// Checked glossaries for the prompt: player nicknames (圣枪哥 = Flandre), team names (滔搏 = TES) and esports terms (VCTCN).
import { readFile } from "node:fs/promises";

const lists = {};

async function list(file) {
  lists[file] ??= JSON.parse(await readFile(new URL(file, import.meta.url), "utf8").catch(() => "{}"));
  return lists[file];
}

export async function nicknames() {
  return list("nicknames.json");
}

export async function nicknameGlossary(texts) {
  // Emote codes like [虎扑表情-手动狗头] never count as mentions.
  const joined = texts.join(" ").replace(/\[[^\]]*\]/g, "");
  const lower = joined.toLowerCase();
  const hit = (k) => joined.includes(k) || lower.includes(k.toLowerCase());
  return [
    ...Object.entries(await list("nicknames.json")).filter(([k]) => hit(k)).map(([k, v]) => `${k} = player ${v}`),
    ...Object.entries(await list("team-nicknames.json")).filter(([k]) => hit(k)).map(([k, v]) => `${k} = team ${v}`),
    ...Object.entries(await list("terms.json")).filter(([k]) => hit(k)).map(([k, v]) => `${k} means ${v}; explain it in a note`),
  ];
}
