// Builds champion-nicknames.json: Gemini lists Chinese fan nicknames per champion, Groq must confirm each before it is kept.
import { readFile, writeFile } from "node:fs/promises";
import { championList } from "./champions.js";
import { backend, parseJson } from "./llm.js";

const OUT = new URL("champion-nicknames.json", import.meta.url);
const proposer = backend("gemini");
const checker = backend("groq");
const existing = JSON.parse(await readFile(OUT, "utf8").catch(() => "{}"));
const champions = await championList();
const official = new Set(champions.flatMap((c) => [c.title, c.epithet]));
console.log(`${champions.length} champions`);

for (let i = 0; i < champions.length; i += 25) {
  const batch = champions.slice(i, i + 25).map((c) => ({ champion: c.en, officialChinese: [c.title, c.epithet] }));
  const proposed = parseJson(await proposer.chat(
    `For each League of Legends champion, list the Chinese nicknames that players and fans on Hupu, Bilibili and Weibo commonly use, other than the official names given (e.g. Skarner: 蝎子; Lucian: 奥巴马; Twisted Fate: 卡牌; Lee Sin: 瞎子; Ezreal: EZ). Only nicknames you are confident about, at least two characters each; an empty list is fine.\n${JSON.stringify(batch)}\nReturn JSON {"champions": [{"champion": "...", "nicknames": ["..."]}]}`,
  )).champions ?? [];
  const pairs = proposed.flatMap((p) => (p.nicknames ?? []).map((n) => ({ nick: String(n).trim(), champion: p.champion })))
    .filter((p) => p.nick.length >= 2 && !official.has(p.nick) && !existing[p.nick]);
  if (!pairs.length) continue;
  const verdicts = parseJson(await checker.chat(
    `Check each claimed Chinese fan nickname for a League of Legends champion. Answer true only if Chinese players really use it for that champion and it would not usually mean a different champion.\n${JSON.stringify(pairs)}\nReturn JSON {"items": [{"nick": "...", "champion": "...", "ok": true|false}]}`,
  )).items ?? [];
  for (const v of verdicts) {
    if (v.ok === true && pairs.some((p) => p.nick === v.nick && p.champion === v.champion)) existing[v.nick] = v.champion;
  }
  console.log(`  ${Math.min(i + 25, champions.length)}/${champions.length}: ${verdicts.filter((v) => v.ok).length}/${pairs.length} confirmed`);
  await writeFile(OUT, JSON.stringify(existing, null, 1));
}
console.log(`${Object.keys(existing).length} champion nicknames`);
