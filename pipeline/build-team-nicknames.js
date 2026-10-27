// Builds team-nicknames.json: Gemini lists Chinese fan names for pro teams, Groq must confirm each before it is kept.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { backend, parseJson } from "./llm.js";

const DATA = new URL("../site/data/matches/", import.meta.url);
const OUT = new URL("team-nicknames.json", import.meta.url);
const proposer = backend(process.argv[2] ?? "geminiB");
const checker = backend("groq");
const existing = JSON.parse(await readFile(OUT, "utf8").catch(() => "{}"));

// Teams at this event plus the major leagues' teams that fans bring up in comparisons.
const teams = new Set(["JDG", "BLG", "TES", "WBG", "LNG", "IG", "AL", "NIP", "EDG", "RNG", "OMG", "FPX", "WE", "UP", "TT", "LGD",
  "T1", "GEN", "HLE", "DK", "KT", "DRX", "NS", "BRO", "FOX", "G2", "FNC", "KC", "MKOI", "TH", "C9", "TL", "FLY", "100T", "PSG", "CFO", "GAM"]);
for (const f of (await readdir(DATA)).filter((f) => f.endsWith(".json"))) {
  for (const t of JSON.parse(await readFile(new URL(f, DATA), "utf8")).teams) teams.add(t.name);
}
const list = [...teams];
console.log(`${list.length} teams`);

for (let i = 0; i < list.length; i += 20) {
  const batch = list.slice(i, i + 20);
  const proposed = parseJson(await proposer.chat(
    `For each League of Legends pro team (by its usual short name), list the Chinese names and nicknames that fans on Hupu and Bilibili commonly use for it (e.g. TES: 滔博; JDG: 京东; WBG: 微博; T1: SKT is NOT a nickname, but 宇宙队 is). Only names you are confident about, at least two characters; an empty list is fine.\n${JSON.stringify(batch)}\nReturn JSON {"teams": [{"team": "...", "names": ["..."]}]}`,
  )).teams ?? [];
  const pairs = proposed.flatMap((p) => (p.names ?? []).map((n) => ({ nick: String(n).trim(), team: p.team })))
    .filter((p) => p.nick.length >= 2 && p.nick !== p.team && !existing[p.nick]);
  if (!pairs.length) continue;
  const verdicts = parseJson(await checker.chat(
    `Check each claimed Chinese fan name for a League of Legends pro team. Answer true only if Chinese fans really use it for that team and it would not usually mean a different team.\n${JSON.stringify(pairs)}\nReturn JSON {"items": [{"nick": "...", "team": "...", "ok": true|false}]}`,
  )).items ?? [];
  for (const v of verdicts) {
    if (v.ok === true && pairs.some((p) => p.nick === v.nick && p.team === v.team)) existing[v.nick] = v.team;
  }
  console.log(`  ${Math.min(i + 20, list.length)}/${list.length}: ${verdicts.filter((v) => v.ok).length}/${pairs.length} confirmed`);
  await writeFile(OUT, JSON.stringify(existing, null, 1));
}
console.log(`${Object.keys(existing).length} team names`);
