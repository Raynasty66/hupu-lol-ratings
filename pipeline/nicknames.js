// Chinese fan nicknames for pro players (e.g. 圣枪哥 = Flandre), from the checked list in nicknames.json.
import { readFile } from "node:fs/promises";

let table = null;

export async function nicknames() {
  if (!table) table = JSON.parse(await readFile(new URL("nicknames.json", import.meta.url), "utf8"));
  return table;
}

export async function nicknameGlossary(texts) {
  const joined = texts.join(" ");
  return Object.entries(await nicknames())
    .filter(([nick]) => joined.includes(nick))
    .map(([nick, id]) => `${nick} = ${id}`);
}
