// Builds nicknames.json: one model proposes Chinese fan nicknames per player, a second must confirm each before it is kept.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { backend, parseJson } from "./llm.js";

const DATA = new URL("../site/data/matches/", import.meta.url);
const OUT = new URL("nicknames.json", import.meta.url);
const proposer = backend("gemini");
const checker = backend("groq");

const existing = JSON.parse(await readFile(OUT, "utf8").catch(() => "{}"));
const players = new Map();
const texts = new Map();
for (const f of (await readdir(DATA)).filter((f) => f.endsWith(".json"))) {
  const m = JSON.parse(await readFile(new URL(f, DATA), "utf8"));
  const team = new Map(m.teams.map((t) => [t.id, t.name]));
  for (const it of m.games.flatMap((g) => g.items)) {
    if (it.type !== "player") continue;
    if (!players.has(it.name)) players.set(it.name, team.get(it.team) ?? "");
    const said = it.top.flatMap((c) => [c.zh, ...(c.thread ?? []).map((r) => r.zh)]);
    texts.set(it.name, [...(texts.get(it.name) ?? []), ...said]);
  }
}

// Drops a nickname only on evidence against it: fans use it often, but mostly under some other player's ratings.
function evidence(nick, id) {
  if (!texts.has(id)) return true;
  const counts = [...texts].map(([name, said]) => [name, said.filter((s) => s.includes(nick)).length]);
  counts.sort((a, b) => b[1] - a[1]);
  const own = counts.find(([name]) => name === id)?.[1] ?? 0;
  return counts[0][1] < 3 || counts[0][0] === id || own >= counts[0][1] / 2;
}

if (process.argv.includes("--prune")) {
  for (const [nick, id] of Object.entries(existing)) {
    if (!evidence(nick, id)) {
      console.log(`  dropped ${nick} = ${id}`);
      delete existing[nick];
    }
  }
  await writeFile(OUT, JSON.stringify(existing, null, 1));
  console.log(`${Object.keys(existing).length} nicknames kept`);
  process.exit(0);
}
const known = new Set(Object.values(existing));
const todo = [...players].filter(([name]) => !known.has(name));
console.log(`${players.size} players, ${todo.length} without nicknames yet`);

for (let i = 0; i < todo.length; i += 15) {
  const batch = todo.slice(i, i + 15).map(([id, team]) => ({ id, team }));
  const proposed = parseJson(await proposer.chat(
    `These are League of Legends pro players (in-game ID and 2026 team). For each, list the Chinese nicknames that fans on Hupu, Bilibili and Weibo commonly use for them (e.g. Flandre: 圣枪哥; Clearlove: 厂长; Uzi: 乌兹). Only include nicknames you are confident about; an empty list is fine. Do not include the plain ID itself.\n${JSON.stringify(batch)}\nReturn JSON {"players": [{"id": "...", "nicknames": ["..."]}]}`,
  )).players ?? [];
  const pairs = proposed.flatMap((p) => (p.nicknames ?? []).map((n) => ({ nick: n.trim(), id: p.id }))).filter((p) => p.nick && p.nick !== p.id);
  if (!pairs.length) continue;
  const verdicts = parseJson(await checker.chat(
    `Check each claimed Chinese fan nickname for a League of Legends pro player. Answer true only if the nickname really refers to that player among Chinese fans and would not usually mean someone else.\n${JSON.stringify(pairs)}\nReturn JSON {"items": [{"nick": "...", "id": "...", "ok": true|false}]}`,
  )).items ?? [];
  for (const v of verdicts) {
    if (v.ok === true && pairs.some((p) => p.nick === v.nick && p.id === v.id) && !existing[v.nick]) existing[v.nick] = v.id;
  }
  console.log(`  ${i + batch.length}/${todo.length}: ${verdicts.filter((v) => v.ok).length}/${pairs.length} confirmed`);
  await writeFile(OUT, JSON.stringify(existing, null, 1));
}
