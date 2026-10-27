// Official Chinese-to-English champion names from Riot's Data Dragon, so bans and glossaries are exact.
const DDRAGON = "https://ddragon.leagueoflegends.com";
let table = null;

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
  const joined = texts.join(" ").replace(/\s+/g, "");
  return [...t].filter(([zh]) => zh.length >= 2 && joined.includes(zh)).map(([zh, en]) => `${zh} = ${en}`);
}
