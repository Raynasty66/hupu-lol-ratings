// Says whether the update should run now: a best-of-N match is due N hours after it starts.
import { readFile } from "node:fs/promises";
import { appendFileSync } from "node:fs";
import * as hupu from "./hupu.js";
import { worldsMatches } from "./lolesports.js";

const HOUR = 36e5;
const index = JSON.parse(await readFile(new URL("../site/data/index.json", import.meta.url), "utf8"));
const updated = index.updated ?? 0;
const now = Date.now();
const reasons = [];

for (const m of await worldsMatches()) {
  const due = m.start + m.bestOf * HOUR;
  if (due <= now && due > updated) reasons.push(`${m.teams.join(" vs ")} (Bo${m.bestOf}) due ${new Date(due).toISOString()}`);
}
// A match that ran long finishes on Hupu after its due time, so any finished match missing from the site counts too.
const have = new Set(index.matches.map((m) => m.id));
for (const m of await hupu.schedule()) {
  if (m.status === "COMPLETED" && m.key?.type === "lol_match" && m.event.includes("全球总决赛") && !have.has(m.id)) {
    reasons.push(`${m.teams.map((t) => t.name).join(" vs ")} finished on Hupu but is not on the site`);
  }
}
// One run a day keeps translations and comment counts moving when no match is due.
if (now - updated > 24 * HOUR) reasons.push("no update in 24 hours");

console.log(reasons.length ? `Run: ${reasons.join("; ")}` : `Nothing due (last update ${new Date(updated).toISOString()})`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${reasons.length > 0}\n`);
