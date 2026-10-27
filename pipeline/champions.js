// Official Chinese-to-English champion names from Riot's Data Dragon, plus checked fan nicknames (蝎子 = Skarner).
import { readFile } from "node:fs/promises";

const DDRAGON = "https://ddragon.leagueoflegends.com";
let table = null;
let fanNames = null;

export async function championList() {
  const [version] = await (await fetch(`${DDRAGON}/api/versions.json`)).json();
  const zh = (await (await fetch(`${DDRAGON}/cdn/${version}/data/zh_CN/champion.json`)).json()).data;
  const en = (await (await fetch(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`)).json()).data;
  return Object.keys(zh).map((id) => ({ en: en[id].name, title: zh[id].title.replace(/\s+/g, ""), epithet: zh[id].name.replace(/\s+/g, "") }));
}

export async function champions() {
  if (table) return table;
  const [version] = await (await fetch(`${DDRAGON}/api/versions.json`)).json();
  const zh = (await (await fetch(`${DDRAGON}/cdn/${version}/data/zh_CN/champion.json`)).json()).data;
  const en = (await (await fetch(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`)).json()).data;
  table = new Map();
  for (const [id, c] of Object.entries(zh)) {
    // Chinese fans use both the character name (title) and the epithet (name), e.g. 嘉文四世 and 德玛西亚皇子.
    table.set(c.title.replace(/\s+/g, ""), en[id].name);
    table.set(c.name.replace(/\s+/g, ""), en[id].name);
  }
  return table;
}

export async function banList(zh) {
  const t = await champions();
  const parts = zh.split("/").map((s) => t.get(s.replace(/\s+/g, "")));
  return parts.every(Boolean) ? parts.join(" / ") : null;
}

export async function glossary(texts) {
  const t = await champions();
  fanNames ??= JSON.parse(await readFile(new URL("champion-nicknames.json", import.meta.url), "utf8").catch(() => "{}"));
  // Emote codes like [虎扑表情-手动狗头] are not champion mentions.
  const joined = texts.join(" ").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "");
  return [...t, ...Object.entries(fanNames)]
    .filter(([zh]) => zh.length >= 2 && joined.includes(zh))
    .map(([zh, en]) => `${zh} may mean the champion ${en}`);
}
