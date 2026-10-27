// Pulls finished LoL matches, every rated player/coach/caster/pick per game, and their top comments.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as hupu from "./hupu.js";

const DATA = new URL("../site/data/", import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const EVENT = args.event ?? "";
const LIMIT = Number(args.limit ?? Infinity);
const PAGES = Number(args.pages ?? 0);
const REFRESH_DAYS = Number(args.refresh ?? 3);

const one = (v) => (Array.isArray(v) ? v[0] : v);

function comment(c) {
  return {
    id: String(c.commentId),
    zh: c.commentContent ?? "",
    score: c.score ?? null,
    likes: c.lightCount ?? 0,
    ip: c.ipLocation || null,
    time: c.publishTime ?? null,
    replies: c.subCommentCount ?? 0,
  };
}

function item(node) {
  const info = node.infoJson ?? {};
  return {
    id: String(node.bizId),
    type: one(info.type) ?? "other",
    name: node.name,
    image: node.image?.[0] ?? one(info.cover_87x122) ?? null,
    champion: one(info.auxiliaryPic) ?? null,
    team: one(info.teamId) ?? null,
    kills: info.killCount ? Number(one(info.killCount)) : null,
    deaths: info.deathCount ? Number(one(info.deathCount)) : null,
    note: one(info.desc) ?? null,
    avg: Number(node.scoreAvg ?? 0),
    raters: node.scorePersonCount ?? 0,
    comments: node.commentCount ?? 0,
    dist: node.scoreDistribution ?? {},
  };
}

async function readJson(url, fallback) {
  return existsSync(url) ? JSON.parse(await readFile(url, "utf8")) : fallback;
}

// Keeps translations already done for comments that are fetched again.
function carry(oldItems, newItems) {
  const old = new Map(oldItems.flatMap((it) => it.top.map((c) => [c.id, c])));
  const oldNames = new Map(oldItems.map((it) => [it.id, it.en]));
  for (const it of newItems) {
    if (oldNames.get(it.id)) it.en = oldNames.get(it.id);
    for (const c of it.top) {
      const prev = old.get(c.id);
      if (prev?.en) Object.assign(c, { en: prev.en, notes: prev.notes });
    }
  }
}

async function main() {
  await mkdir(new URL("matches/", DATA), { recursive: true });
  const index = await readJson(new URL("index.json", DATA), { matches: [] });
  const known = new Map(index.matches.map((m) => [m.id, m]));
  const all = (await hupu.schedule())
    .filter((m) => m.status === "COMPLETED" && m.key?.type === "lol_match" && m.event.includes(EVENT))
    .sort((a, b) => b.start - a.start);
  const fresh = Date.now() - REFRESH_DAYS * 864e5;
  const todo = all.filter((m) => !known.has(m.id) || m.start > fresh).slice(0, LIMIT);
  console.log(`${all.length} finished matches, fetching ${todo.length}`);

  for (const m of todo) {
    const file = new URL(`matches/${m.id}.json`, DATA);
    const prev = await readJson(file, { games: [] });
    const games = [];
    for (const g of await hupu.children(m.key.type, m.key.no)) {
      const items = [];
      for (const node of await hupu.children(g.bizType, g.bizId)) {
        const it = item(node);
        const raw = PAGES ? await hupu.latest(node.bizType, node.bizId, PAGES) : [];
        const seen = new Set();
        it.top = [...(await hupu.hottest(node.bizType, node.bizId)), ...raw]
          .map(comment)
          .filter((c) => c.zh.trim() && !seen.has(c.id) && seen.add(c.id));
        items.push(it);
      }
      items.sort((a, b) => b.raters - a.raters);
      carry(prev.games.find((p) => p.id === String(g.bizId))?.items ?? [], items);
      games.push({ id: String(g.bizId), name: g.name, items });
    }
    await writeFile(file, JSON.stringify({ ...m, games }));
    known.set(m.id, { ...m, games: games.map((g) => ({ id: g.id, name: g.name })) });
    console.log(`  ${m.event} ${m.teams.map((t) => t.name).join(" vs ")}: ${games.length} games`);
  }

  index.matches = [...known.values()].sort((a, b) => b.start - a.start);
  index.updated = Date.now();
  await writeFile(new URL("index.json", DATA), JSON.stringify(index));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
