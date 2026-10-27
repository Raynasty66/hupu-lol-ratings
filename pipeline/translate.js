// Translates comments with one model and has a second model check each one; only checked translations count as verified.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { banList, glossary as championGlossary } from "./champions.js";
import { nicknameGlossary } from "./nicknames.js";
import { backend, parseJson, QuotaError } from "./llm.js";

const DATA = new URL("../site/data/matches/", import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const translator = backend(args.translator ?? "gemini");
const checker = args.checker === "none" ? null : backend(args.checker ?? "groq");
const BATCH = Number(args.batch ?? 20);
const LIMIT = Number(args.limit ?? Infinity);
const TRANSLATE = await readFile(new URL("prompt.md", import.meta.url), "utf8");
const VERIFY = await readFile(new URL("verify.md", import.meta.url), "utf8");

const hasChinese = (s) => /[㐀-鿿]/.test(s);
const LOCK = new URL("fetching.lock", DATA);
const beingFetched = (id) => existsSync(LOCK) && readFileSync(LOCK, "utf8").trim() === id;

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
  const text = en.replace(/\[~(\d+):([^\]]*)\]/g, (all, id, phrase) => (ids.has(Number(id)) ? all : phrase));
  return { en: text.replace(/&#39;/g, "'").replace(/&amp;/g, "&"), notes: kept };
}

async function terms(texts) {
  return [...(await nicknameGlossary(texts)), ...(await championGlossary(texts))];
}

async function translate(units, ctx, glossary) {
  const input = units.map((u) => ({
    id: u.id, zh: u.zh, stars: u.score ? u.score / 2 : undefined, replyTo: u.parent, fix: u.problem,
  }));
  const out = new Map((parseJson(await translator.chat(fill(TRANSLATE, ctx, input, glossary))).items ?? [])
    .map((x) => [String(x.id), x]));
  for (const u of units) {
    const t = out.get(u.id);
    if (!t?.en) continue;
    const result = clean(t.en, t.notes, u.zh);
    // Emote codes stay Chinese on purpose; any other Chinese left in the English means the translation is incomplete.
    const emotes = u.zh.match(/\[[^\]\[]{1,30}\]/g) ?? [];
    if (hasChinese(emotes.reduce((s, e) => s.split(e).join(""), result.en))) continue;
    Object.assign(u.ref, result, { verified: false });
  }
}

async function check(units, ctx, glossary) {
  const ready = units.filter((u) => u.ref.en);
  if (!ready.length) return;
  const input = ready.map((u) => ({ id: u.id, zh: u.zh, en: u.ref.en, notes: u.ref.notes?.map((n) => `${n.zh}: ${n.context}`) }));
  const out = new Map((parseJson(await checker.chat(fill(VERIFY, ctx, input, glossary))).items ?? [])
    .map((x) => [String(x.id), x]));
  for (const u of ready) {
    const v = out.get(u.id);
    if (!v) continue;
    if (v.ok === true) u.ref.verified = `${translator.model} + ${checker.model}`;
    else u.problem = v.problem || "rejected by checker";
  }
}

async function nameEntries(match) {
  for (const it of match.games.flatMap((g) => g.items)) {
    if (it.type === "bpHero") it.en = (await banList(it.name)) ?? it.en;
  }
  const items = match.games.flatMap((g) => g.items).filter((it) => !it.en && hasChinese(it.name));
  const unique = [...new Set(items.map((it) => it.name))];
  if (!unique.length) return;
  const units = unique.map((zh, i) => ({ id: String(i), zh, ref: {} }));
  await translate(units, {
    target: "these rating entries (player, coach, caster or champion-ban names; 解说 caster, 二路 co-stream, 教练 coach, 替补 sub, 场内主持 host)",
    match: match.teams.map((t) => t.name).join(" vs "), game: "the whole series",
  }, await terms(unique));
  const en = new Map(units.map((u) => [u.zh, u.ref.en]));
  for (const it of items) if (en.get(it.name)) it.en = en.get(it.name);
}

// Passes over every match: each entry's 10 most-liked comments, then the rest of its top 30, then replies.
const PASSES = [{ from: 0, to: 10 }, { from: 10, to: 30 }, { from: 0, to: 30, replies: true }];

function pendingUnits(item, pass) {
  const units = [];
  for (const c of [...item.top].sort((a, b) => b.likes - a.likes).slice(pass.from, pass.to)) {
    const list = pass.replies ? (c.thread ?? []) : [c];
    for (const x of list) {
      if (x.verified || !x.zh.trim()) continue;
      // Replies carry their parent comment's text so the model can read the thread.
      units.push({ id: x.id, zh: x.zh, score: x.score, parent: pass.replies ? c.zh : undefined, ref: x });
    }
  }
  return units;
}

async function main() {
  const files = (await readdir(DATA)).filter((f) => f.endsWith(".json"));
  const order = [];
  for (const f of files) order.push({ url: new URL(f, DATA), start: JSON.parse(await readFile(new URL(f, DATA), "utf8")).start });
  order.sort((a, b) => b.start - a.start);
  console.log(`translator ${translator.name}/${translator.model}, checker ${checker ? `${checker.name}/${checker.model}` : "none"}`);
  let verified = 0, done = 0;
  try {
    for (const pass of PASSES) for (const { url } of order) {
      // Re-read each time, since a fetch running alongside may have rewritten the file.
      const match = JSON.parse(await readFile(url, "utf8"));
      const label = `${match.event} ${match.teams.map((t) => t.name).join(" vs ")}`;
      if (beingFetched(match.id)) {
        console.log(`  skipping ${label}: being fetched`);
        continue;
      }
      if (pass === PASSES[0]) {
        await nameEntries(match);
        await writeFile(url, JSON.stringify(match));
      }
      for (const g of match.games) {
        for (const it of g.items) {
          if (beingFetched(match.id)) break;
          const units = pendingUnits(it, pass);
          const ctx = { target: it.en ?? it.name, match: label, game: g.name.replace(/第(\d+)局/, "game $1") };
          for (let i = 0; i < units.length && done < LIMIT; i += BATCH) {
            const batch = units.slice(i, i + BATCH);
            const glossary = await terms(batch.map((u) => u.zh));
            const t0 = Date.now();
            try {
              await translate(batch, ctx, glossary);
              if (checker) {
                await check(batch, ctx, glossary);
                const retry = batch.filter((u) => u.problem);
                if (retry.length) {
                  await translate(retry, ctx, glossary);
                  retry.forEach((u) => delete u.problem);
                  await check(retry, ctx, glossary);
                }
              }
            } catch (err) {
              // One bad response skips this batch; it stays unverified and is retried next run.
              if (err instanceof QuotaError) throw err;
              console.warn(`    batch skipped: ${err.message.slice(0, 160)}`);
            }
            const ok = batch.filter((u) => u.ref.verified).length;
            verified += ok;
            done += batch.length;
            console.log(`  ${label} ${g.name} ${it.en ?? it.name}: ${ok}/${batch.length} verified in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
            await writeFile(url, JSON.stringify(match));
          }
          if (done >= LIMIT) return;
        }
      }
    }
  } catch (err) {
    if (!(err instanceof QuotaError)) throw err;
    console.log(`${err.message}; progress is saved, rerun after the daily reset.`);
  } finally {
    console.log(`${verified} verified this run (${done} processed)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
