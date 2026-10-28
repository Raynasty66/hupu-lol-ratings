// Champions each player used, per game, from Riot's lolesports API (the one lolesports.com itself calls).
const API = "https://esports-api.lolesports.com/persisted/gw";
const FEED = "https://feed.lolesports.com/livestats/v1/window";
const DDRAGON = "https://ddragon.leagueoflegends.com";
// Public key that lolesports.com ships in its own page code.
const HEADERS = { "x-api-key": "0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z" };

let events = null;
let champions = null;

async function json(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function championInfo() {
  if (champions) return champions;
  const [version] = await json(`${DDRAGON}/api/versions.json`);
  const data = (await json(`${DDRAGON}/cdn/${version}/data/en_US/champion.json`)).data;
  champions = new Map(Object.values(data).map((c) => [c.id, { name: c.name, icon: `${DDRAGON}/cdn/${version}/img/champion/${c.image.full}` }]));
  return champions;
}

// Every completed match in the leagues this project covers, keyed for matching by team codes and day.
async function schedule() {
  if (events) return events;
  const leagues = (await json(`${API}/getLeagues?hl=en-US`, HEADERS)).data.leagues;
  const ids = leagues.filter((l) => ["worlds", "msi", "lpl", "lck"].includes(l.slug)).map((l) => l.id);
  events = [];
  for (const id of ids) {
    const s = (await json(`${API}/getSchedule?hl=en-US&leagueId=${id}`, HEADERS)).data.schedule.events;
    events.push(...s.filter((e) => e.type === "match" && e.state === "completed"));
  }
  return events;
}

// Team codes can differ slightly between Riot and Hupu (MKOI vs KOI), so one containing the other counts.
const sameCode = (a, b) => { a = a.toUpperCase(); b = b.toUpperCase(); return a === b || a.includes(b) || b.includes(a); };
const sameTeams = (a, b) => a.length === 2 && b.length === 2 && ((sameCode(a[0], b[0]) && sameCode(a[1], b[1])) || (sameCode(a[0], b[1]) && sameCode(a[1], b[0])));

// Returns { "1": { Breathe: { name, icon }, ... }, "2": ... } for a Hupu match, or null when Riot has no match for it.
export async function picks(match) {
  const codes = match.teams.map((t) => t.name);
  const event = (await schedule()).find((e) => sameTeams(e.match.teams.map((t) => t.code), codes)
    && Math.abs(new Date(e.startTime) - match.start) < 36 * 3600e3);
  if (!event) return null;
  const games = (await json(`${API}/getEventDetails?hl=en-US&id=${event.match.id}`, HEADERS)).data.event.match.games;
  const info = await championInfo();
  const out = {};
  for (const g of games.filter((g) => g.state === "completed")) {
    const meta = (await json(`${FEED}/${g.id}`)).gameMetadata;
    out[g.number] = { byRole: {} };
    for (const side of [meta.blueTeamMetadata, meta.redTeamMetadata]) {
      for (const p of side.participantMetadata) {
        // Riot writes "AL Breathe"; Hupu writes "Breathe".
        const player = p.summonerName.split(" ").slice(1).join(" ") || p.summonerName;
        const champ = info.get(p.championId);
        if (!champ) continue;
        out[g.number][player.toLowerCase()] = champ;
        out[g.number].byRole[`${side.esportsTeamId}:${p.role}`] = { ...champ, team: side.esportsTeamId };
      }
    }
  }
  return out;
}

// Attaches each player's champion to their entry in every game of a saved Hupu match.
// Falls back to team + role (from Hupu's full-match data) when Riot spells a player's name differently.
const ROLE = { TOP: "top", JUN: "jungle", MID: "mid", BOT: "bottom", SUP: "support" };

export async function addPicks(match, series = []) {
  const byGame = await picks(match);
  if (!byGame) return 0;
  let n = 0;
  for (const g of match.games) {
    const number = g.name.match(/第(\d+)局/)?.[1];
    const players = byGame[number] ?? {};
    for (const it of g.items) {
      if (it.type !== "player") continue;
      let champ = players[it.name.toLowerCase()];
      if (!champ) {
        const role = ROLE[series.find((p) => p.name === it.name)?.role];
        // Same role, on the side where this player's teammates were found by name.
        const options = Object.entries(players.byRole ?? {}).filter(([k]) => k.endsWith(`:${role}`)).map(([, v]) => v);
        const mates = g.items.filter((x) => x.type === "player" && x.team === it.team && x !== it).map((x) => players[x.name.toLowerCase()]).filter(Boolean);
        champ = options.find((o) => mates.some((mate) => Object.values(players.byRole).some((v) => v.team === o.team && v.name === mate.name)));
      }
      if (champ) { it.pick = champ; n++; }
    }
  }
  return n;
}
