// Pulls finished LoL matches, every rated entry per game, its 30 most-liked comments and their replies.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as hupu from "./hupu.js";

const DATA = new URL("../site/data/", import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const EVENT = args.event ?? "";
const LIMIT = Number(args.limit ?? Infinity);
const TOP = Number(args.top ?? 30);
const REPLIES = Number(args.replies ?? 10);
const REFRESH_DAYS = Number(args.refresh ?? 3);
const WORKERS = Number(args.workers ?? 3);

const one = (v) => (Array.isArray(v) ? v[0] : v);

function comment(c) {
  return {
    id: String(c.commentId),
    user: c.commentUserName ?? null,
    zh: c.commentContent ?? "",
    score: c.score || null,
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

// Every comment ranked by likes, so the top 30 are exact rather than Hupu's short "hottest" list.
async function topComments(node) {
  const all = await hupu.latest(node.bizType, node.bizId);
  const seen = new Set();
  const top = all.filter((c) => c.commentContent?.trim() && !seen.has(c.commentId) && seen.add(c.commentId))
    .sort((a, b) => (b.lightCount ?? 0) - (a.lightCount ?? 0))
    .slice(0, TOP)
    .map(comment);
  for (const c of top) {
    if (!c.replies || !REPLIES) continue;
    const thread = await hupu.replies(node.bizType, node.bizId, c.id, Math.min(50, c.replies));
    c.thread = thread
      .filter((r) => r.commentContent?.trim())
      .sort((a, b) => (b.lightCount ?? 0) - (a.lightCount ?? 0))
      .slice(0, REPLIES)
      .map((r) => ({ ...comment(r), to: String(r.parentCommentId) === c.id ? null : r.parentCommentUserName ?? null }))
      .sort((a, b) => a.time - b.time);
  }
  return top;
}

// Carries finished translations over to comments fetched again.
function carry(oldItems, newItems) {
  const keep = ["en", "notes", "verified"];
  const old = new Map();
  for (const it of oldItems) for (const c of it.top) for (const x of [c, ...(c.thread ?? [])]) old.set(x.id, x);
  const oldNames = new Map(oldItems.map((it) => [it.id, it.en]));
  for (const it of newItems) {
    if (oldNames.get(it.id)) it.en = oldNames.get(it.id);
    for (const c of it.top) {
      for (const x of [c, ...(c.thread ?? [])]) {
        const prev = old.get(x.id);
        if (prev?.en && prev.zh === x.zh) for (const k of keep) if (prev[k] !== undefined) x[k] = prev[k];
      }
    }
  }
}

async function pool(tasks, n) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  }));
  return out;
}

// Highest- and lowest-rated players over the whole series, from Hupu's series ratings when it has them.
// A 50-vote floor only screens out near-empty entries, and ties go to the more-rated player.
function standouts(games, series) {
  const image = new Map(games.flatMap((g) => g.items.map((it) => [it.name, it.image])));
  const players = series?.length
    ? series.filter((p) => p.raters >= 50).map((p) => ({ ...p, game: games.length > 1 ? "Series" : games[0]?.name, image: image.get(p.name) ?? null }))
    : games.flatMap((g) => g.items.filter((it) => it.type === "player" && it.raters >= 50)
      .map((it) => ({ name: it.en ?? it.name, avg: it.avg, raters: it.raters, game: g.name, image: it.image, team: it.team })));
  if (!players.length) return null;
  const mvp = [...players].sort((a, b) => b.avg - a.avg || b.raters - a.raters)[0];
  const worst = [...players].sort((a, b) => a.avg - b.avg || b.raters - a.raters)[0];
  return { mvp, worst };
}

async function main() {
  await mkdir(new URL("matches/", DATA), { recursive: true });
  const index = await readJson(new URL("index.json", DATA), { matches: [] });
  const known = new Map(index.matches.map((m) => [m.id, m]));
  if (args.reindex !== undefined) {
    // Recomputes each match's MVP/LVP from the saved files, pulling only the series ratings from Hupu.
    for (const m of index.matches) {
      const saved = await readJson(new URL(`matches/${m.id}.json`, DATA), null);
      if (!saved) continue;
      m.series = await hupu.seriesScores(m.id).catch(() => m.series ?? []);
      m.standouts = standouts(saved.games, m.series);
    }
    index.updated = Date.now();
    await writeFile(new URL("index.json", DATA), JSON.stringify(index));
    console.log(`reindexed ${index.matches.length} matches`);
    return;
  }
  const all = (await hupu.schedule())
    .filter((m) => m.status === "COMPLETED" && m.key?.type === "lol_match" && m.event.includes(EVENT))
    .sort((a, b) => b.start - a.start);
  const fresh = Date.now() - REFRESH_DAYS * 864e5;
  const todo = all.filter((m) => args.all !== undefined || !known.get(m.id)?.full || m.start > fresh).slice(0, LIMIT);
  console.log(`${all.length} finished matches, fetching ${todo.length}`);

  const lock = new URL("matches/fetching.lock", DATA);
  for (const m of todo) {
    const t0 = Date.now();
    // Tells a translate run going at the same time to leave this match alone until it is rewritten.
    await writeFile(lock, m.id);
    const file = new URL(`matches/${m.id}.json`, DATA);
    const prev = await readJson(file, { games: [] });
    const games = [];
    for (const g of await hupu.children(m.key.type, m.key.no)) {
      const nodes = await hupu.children(g.bizType, g.bizId);
      const items = await pool(nodes.map((node) => async () => ({ ...item(node), top: await topComments(node) })), WORKERS);
      items.sort((a, b) => b.raters - a.raters);
      carry(prev.games.find((p) => p.id === String(g.bizId))?.items ?? [], items);
      games.push({ id: String(g.bizId), name: g.name, items });
    }
    await writeFile(file, JSON.stringify({ ...m, games }));
    const series = await hupu.seriesScores(m.id).catch(() => []);
    known.set(m.id, { ...m, full: true, series, standouts: standouts(games, series), games: games.map((g) => ({ id: g.id, name: g.name })) });
    index.matches = [...known.values()].sort((a, b) => b.start - a.start);
    index.updated = Date.now();
    await writeFile(new URL("index.json", DATA), JSON.stringify(index));
    const n = games.reduce((s, g) => s + g.items.reduce((t, it) => t + it.top.length, 0), 0);
    console.log(`  ${m.event} ${m.teams.map((t) => t.name).join(" vs ")}: ${games.length} games, ${n} top comments, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  await rm(lock, { force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
