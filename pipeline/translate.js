// Translates every pending comment in big batches, spread across several free model backends at once.
// With --check, it instead reviews finished translations with a second model and retranslates the rejected ones.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { banList, glossary as championGlossary } from "./champions.js";
import { nicknameGlossary } from "./nicknames.js";
import { backend, parseJson, QuotaError } from "./llm.js";

const DATA = new URL("../site/data/matches/", import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const BATCH = Number(args.batch ?? 50);
// Groq's 8k tokens-a-minute cap can't take 50-comment batches, so it only checks; Cloudflare's free Qwen was too weak to translate.
const LANES = String(args.lanes ?? (args.check ? "groq:2" : "gemini:3,gemini2:3,geminiB:3,geminiB2:3")).split(",").map((s) => s.split(":"));
const CHECK = Boolean(args.check);
const TRANSLATE = await readFile(new URL("prompt.md", import.meta.url), "utf8");
const VERIFY = await readFile(new URL("verify.md", import.meta.url), "utf8");
const LOCK = new URL("fetching.lock", DATA);

const hasChinese = (s) => /[㐀-鿿]/.test(s);

function fill(template, ctx, input, terms) {
  return template.replace("{{TARGET}}", ctx.target).replace("{{MATCH}}", ctx.match).replace("{{GAME}}", ctx.game)
    .replace("{{GLOSSARY}}", terms.length ? `Names in these comments: ${terms.join(", ")}.` : "")
    .replace("{{INPUT}}", JSON.stringify(input));
}

// Drops invented emotes, notes without markers and markers without notes.
function clean(en, notes, zh) {
  const squash = (s) => s.replace(/\s+/g, "");
  const emotes = new Map((zh.match(/\[[^\]\[]{1,30}\]/g) ?? []).map((e) => [squash(e), e]));
  en = en.replace(/\s*\[虎扑表情[^\]]*\]/g, (e) => (emotes.has(squash(e)) ? " " + emotes.get(squash(e)) : "")).trim();
  const marked = new Set([...en.matchAll(/\[~(\d+):/g)].map((m) => Number(m[1])));
  const kept = (notes ?? []).filter((n) => marked.has(n.id));
  const ids = new Set(kept.map((n) => n.id));
  // Keeps only well-formed [~N:phrase] markers that have a note; malformed ones like [~N:x] or [~0] become plain text.
  const text = en.replace(/\[~([^\]:]*)(?::([^\]]*))?\]/g, (all, id, phrase = "") =>
    (/^\d+$/.test(id) && ids.has(Number(id)) && phrase ? all : /^\d*$/.test(phrase) ? "" : phrase));
  return { en: text.replace(/\s{2,}/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim(), notes: kept };
}


async function terms(texts) {
  return [...(await nicknameGlossary(texts)), ...(await championGlossary(texts))];
}

async function translateBatch(model, job) {
  const input = job.units.map((u) => ({
    id: u.id, about: u.about, zh: u.zh, stars: u.score ? u.score / 2 : undefined, replyTo: u.parent, fix: u.problem,
  }));
  const reply = parseJson(await model.chat(fill(TRANSLATE, job.ctx, input, await terms(job.units.map((u) => u.zh)))));
  const out = new Map((reply.items ?? []).map((x) => [String(x.id), x]));
  let n = 0;
  for (const u of job.units) {
    const t = out.get(u.id);
    if (!t?.en) continue;
    const result = clean(t.en, t.notes, u.zh);
    // Emote codes stay Chinese on purpose; any other Chinese left in the English means the translation is incomplete.
    const emotes = u.zh.match(/\[[^\]\[]{1,30}\]/g) ?? [];
    if (hasChinese(emotes.reduce((s, e) => s.split(e).join(""), result.en))) continue;
    Object.assign(u.ref, result, { by: model.model, verified: false });
    delete u.ref.problem;
    n++;
  }
  return n;
}

async function checkBatch(model, job) {
  const ready = job.units.filter((u) => u.ref.en);
  const input = ready.map((u) => ({ id: u.id, about: u.about, zh: u.zh, en: u.ref.en }));
  const reply = parseJson(await model.chat(fill(VERIFY, job.ctx, input, await terms(ready.map((u) => u.zh)))));
  const out = new Map((reply.items ?? []).map((x) => [String(x.id), x]));
  let n = 0;
  for (const u of ready) {
    const v = out.get(u.id);
    if (!v) continue;
    if (v.ok === true) {
      u.ref.verified = `${u.ref.by ?? "?"} + ${model.model}`;
      n++;
    } else {
      // Rejected: drop the English so the next run retranslates it with the reason attached.
      u.ref.problem = v.problem || "rejected by checker";
      delete u.ref.en;
      delete u.ref.notes;
    }
  }
  return n;
}

async function nameEntries(match) {
  for (const it of match.games.flatMap((g) => g.items)) {
    if (it.type === "bpHero") it.en = (await banList(it.name)) ?? it.en;
  }
  return match.games.flatMap((g) => g.items).filter((it) => !it.en && hasChinese(it.name));
}

// Passes over every match: each entry's 10 most-liked comments, then the rest of its top 30, then replies.
const PASSES = [{ from: 0, to: 10 }, { from: 10, to: 30 }, { from: 0, to: 30, replies: true }];

function units(match, g, it, pass) {
  const out = [];
  for (const c of [...it.top].sort((a, b) => b.likes - a.likes).slice(pass.from, pass.to)) {
    for (const x of pass.replies ? (c.thread ?? []) : [c]) {
      if (!x.zh.trim()) continue;
      if (CHECK ? !x.en || x.verified : x.en) continue;
      out.push({ id: x.id, about: it.en ?? it.name, zh: x.zh, score: x.score, parent: pass.replies ? c.zh : undefined, problem: x.problem, ref: x });
    }
  }
  return out;
}

async function main() {
  const files = (await readdir(DATA)).filter((f) => f.endsWith(".json"));
  const busy = existsSync(LOCK) ? readFileSync(LOCK, "utf8").trim() : null;
  const matches = [];
  for (const f of files) {
    const url = new URL(f, DATA);
    const data = JSON.parse(await readFile(url, "utf8"));
    if (data.id !== busy) matches.push({ url, data, dirty: false });
  }
  matches.sort((a, b) => b.data.start - a.data.start);

  // Every batch stays within one game so the context line is accurate; most-liked first.
  const queue = [];
  for (const m of matches) {
    const names = await nameEntries(m.data);
    if (names.length && !CHECK) {
      const unique = [...new Set(names.map((it) => it.name))];
      queue.push({
        m, names, ctx: { target: "these rating entries (player, coach, caster or champion-ban names; 解说 caster, 二路 co-stream, 教练 coach, 替补 sub, 场内主持 host)", match: m.data.teams.map((t) => t.name).join(" vs "), game: "the whole series" },
        units: unique.map((zh, i) => ({ id: `n${i}`, zh, ref: {} })),
      });
    }
    m.dirty = true;
  }
  for (const pass of PASSES) {
    for (const m of matches) {
      const label = `${m.data.event} ${m.data.teams.map((t) => t.name).join(" vs ")}`;
      for (const g of m.data.games) {
        const all = g.items.flatMap((it) => units(m.data, g, it, pass));
        for (let i = 0; i < all.length; i += BATCH) {
          queue.push({ m, units: all.slice(i, i + BATCH), ctx: { target: "each comment's `about` entry", match: label, game: g.name.replace(/第(\d+)局/, "game $1") } });
        }
      }
    }
  }
  const total = queue.reduce((s, j) => s + j.units.length, 0);
  console.log(`${CHECK ? "checking" : "translating"} ${total} comments in ${queue.length} batches`);

  // Writes changed match files every few seconds so progress survives an interruption.
  const flush = async () => {
    for (const m of matches) if (m.dirty) { m.dirty = false; await writeFile(m.url, JSON.stringify(m.data)); }
  };
  const timer = setInterval(flush, 10000);

  let done = 0, ok = 0;
  const t0 = Date.now();
  const lanes = LANES.flatMap(([name, n]) => {
    try {
      const model = backend(name);
      return Array.from({ length: Number(n) }, () => ({ name, model }));
    } catch (err) {
      console.warn(`  lane ${name} off: ${err.message}`);
      return [];
    }
  });
  const dead = new Set();
  await Promise.all(lanes.map(async (lane) => {
    while (queue.length && !dead.has(lane.name)) {
      const job = queue.shift();
      try {
        const n = job.names
          ? await translateBatch(lane.model, job).then(() => { for (const it of job.names) it.en = job.units.find((u) => u.zh === it.name)?.ref.en ?? it.en; return job.units.length; })
          : CHECK ? await checkBatch(lane.model, job) : await translateBatch(lane.model, job);
        ok += n;
        done += job.units.length;
        job.m.dirty = true;
        const rate = done / ((Date.now() - t0) / 60000);
        console.log(`  ${lane.name}/${lane.model.model}: ${n}/${job.units.length} | ${done}/${total} done, ${rate.toFixed(0)}/min`);
      } catch (err) {
        if (!job.retried) queue.push({ ...job, retried: true });
        if (err instanceof QuotaError) {
          dead.add(lane.name);
          console.warn(`  ${lane.name} out of daily quota`);
        } else console.warn(`  ${lane.name} batch failed: ${err.message.slice(0, 140)}`);
      }
    }
  }));
  clearInterval(timer);
  await flush();
  console.log(`${ok} ${CHECK ? "verified" : "translated"} of ${total}; ${queue.reduce((s, j) => s + j.units.length, 0)} left in queue`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
