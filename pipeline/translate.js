// Fills in English for every untranslated comment and name, using local Qwen (Ollama) or a free OpenRouter model.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { banList, glossary } from "./champions.js";

const DATA = new URL("../site/data/matches/", import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const BACKEND = args.backend ?? process.env.TRANSLATE_BACKEND ?? "ollama";
const MODEL = args.model ?? (BACKEND === "ollama" ? "qwen3.5:9b" : "google/gemma-4-31b-it:free");
const BATCH = Number(args.batch ?? 12);
const LIMIT = Number(args.limit ?? Infinity);
const PROMPT = await readFile(new URL("prompt.md", import.meta.url), "utf8");
const OLLAMA = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasChinese = (s) => /[㐀-鿿]/.test(s);

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          en: { type: "string" },
          notes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" }, zh: { type: "string" }, pinyin: { type: "string" },
                literal: { type: "string" }, context: { type: "string" },
              },
              required: ["id", "zh", "literal", "context"],
            },
          },
        },
        required: ["id", "en", "notes"],
      },
    },
  },
  required: ["items"],
};

async function ask(prompt) {
  if (BACKEND === "ollama") {
    // Streams so long generations never hit Node's five-minute header timeout.
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      body: JSON.stringify({
        model: MODEL, stream: true, think: false, format: SCHEMA, keep_alive: "5m",
        options: { temperature: 0.3, num_ctx: 8192 },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
    let text = "", buf = "";
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const line of lines) if (line.trim()) text += JSON.parse(line).message?.content ?? "";
    }
    return text;
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (res.status === 429) throw Object.assign(new Error("rate limited"), { rateLimited: true });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${await res.text()}`);
  await sleep(3500);
  return (await res.json()).choices[0].message.content;
}

function parse(text) {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json).items ?? [];
}

// Drops notes without a marker and unwraps markers without a note so the page never shows a broken tooltip.
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

async function translateBatch(batch, ctx) {
  const input = JSON.stringify(batch.map((c) => ({ id: c.id, zh: c.zh, stars: c.score ? c.score / 2 : undefined })));
  const terms = await glossary(batch.map((c) => c.zh));
  const prompt = PROMPT.replace("{{TARGET}}", ctx.target).replace("{{MATCH}}", ctx.match)
    .replace("{{GAME}}", ctx.game).replace("{{INPUT}}", input)
    .replace("{{GLOSSARY}}", terms.length ? `Champion names in these comments: ${terms.join(", ")}.` : "");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = new Map(parse(await ask(prompt)).map((x) => [String(x.id), x]));
      let done = 0;
      for (const c of batch) {
        const t = out.get(c.id);
        if (!t?.en || hasChinese(t.en.replace(/\[虎扑表情[^\]]*\]/g, ""))) continue;
        Object.assign(c, clean(t.en, t.notes, c.zh));
        done++;
      }
      return done;
    } catch (err) {
      if (err.rateLimited) throw err;
      console.warn(`    retry ${attempt}: ${err.message.slice(0, 120)}`);
    }
  }
  return 0;
}

async function translateNames(match) {
  for (const it of match.games.flatMap((g) => g.items)) {
    if (it.type === "bpHero") it.en = (await banList(it.name)) ?? it.en;
  }
  const items = match.games.flatMap((g) => g.items).filter((it) => !it.en && hasChinese(it.name));
  const unique = [...new Set(items.map((it) => it.name))];
  if (!unique.length) return;
  const batch = unique.map((zh, i) => ({ id: String(i), zh }));
  await translateBatch(batch, {
    target: "these rating entries (player, coach, caster or champion-ban names; translate role words like 解说 caster, 二路 co-stream, 教练 coach, 替补 sub, 场内主持 host)",
    match: match.teams.map((t) => t.name).join(" vs "), game: "the whole series",
  });
  const en = new Map(batch.map((b) => [b.zh, b.en]));
  for (const it of items) if (en.get(it.name)) it.en = en.get(it.name);
}

async function main() {
  const files = (await readdir(DATA)).filter((f) => f.endsWith(".json")).sort().reverse();
  let total = 0;
  console.log(`backend ${BACKEND}, model ${MODEL}`);
  for (const f of files) {
    const url = new URL(f, DATA);
    const match = JSON.parse(await readFile(url, "utf8"));
    const label = `${match.teams.map((t) => t.name).join(" vs ")}`;
    const before = JSON.stringify(match);
    await translateNames(match);
    if (JSON.stringify(match) !== before) await writeFile(url, JSON.stringify(match));
    const pending = match.games.flatMap((g) => g.items.map((it) => [g, it, it.top.filter((c) => !c.en)]))
      .filter(([, , todo]) => todo.length);
    if (!pending.length) continue;
    console.log(`${match.event} ${label}`);
    try {
      for (const [g, it, todo] of pending) {
        for (let i = 0; i < todo.length && total < LIMIT; i += BATCH) {
          const t0 = Date.now();
          const n = await translateBatch(todo.slice(i, i + BATCH), {
            target: it.en ?? it.name, match: `${match.event} ${label}`, game: g.name,
          });
          total += n;
          console.log(`  ${g.name} ${it.name}: ${n}/${Math.min(BATCH, todo.length - i)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        }
        await writeFile(url, JSON.stringify(match));
        if (total >= LIMIT) break;
      }
    } catch (err) {
      await writeFile(url, JSON.stringify(match));
      if (err.rateLimited) {
        console.log("OpenRouter daily limit reached; progress saved, rerun tomorrow.");
        break;
      }
      throw err;
    }
    if (total >= LIMIT) break;
  }
  console.log(`translated ${total} comments`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
