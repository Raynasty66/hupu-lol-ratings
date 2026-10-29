const app = document.getElementById("app");
const nav = document.getElementById("nav");
const cache = new Map();
const HUPU = "https://m.hupu.com";
const PAGE = 60;

const EVENTS = [
  ["全球总决赛", "Worlds"], ["季中", "MSI"], ["LPL", "LPL"], ["LCK", "LCK"],
  ["亚运会", "Asian Games"], ["德玛西亚杯", "Demacia Cup"], ["表演赛", "Showmatch"],
];
const STAGES = [
  ["瑞士轮", "Swiss Stage"], ["入围赛", "Play-In"], ["淘汰赛", "Knockouts"], ["季后赛", "Playoffs"],
  ["小组赛", "Groups"], ["资格赛", "Qualifiers"], ["骑士之路", "Road of Knights"], ["对决日", "Showdown"],
  ["全明星", "All-Star"], ["第三赛段", "Split 3"],
];
const PROVINCES = {
  北京: "Beijing", 天津: "Tianjin", 上海: "Shanghai", 重庆: "Chongqing", 河北: "Hebei", 山西: "Shanxi",
  辽宁: "Liaoning", 吉林: "Jilin", 黑龙江: "Heilongjiang", 江苏: "Jiangsu", 浙江: "Zhejiang", 安徽: "Anhui",
  福建: "Fujian", 江西: "Jiangxi", 山东: "Shandong", 河南: "Henan", 湖北: "Hubei", 湖南: "Hunan",
  广东: "Guangdong", 海南: "Hainan", 四川: "Sichuan", 贵州: "Guizhou", 云南: "Yunnan", 陕西: "Shaanxi",
  甘肃: "Gansu", 青海: "Qinghai", 台湾: "Taiwan", 内蒙古: "Inner Mongolia", 广西: "Guangxi", 西藏: "Tibet",
  宁夏: "Ningxia", 新疆: "Xinjiang", 香港: "Hong Kong", 澳门: "Macau", 海外: "Overseas",
};
const COLORS = { 2: "var(--bad)", 4: "#e07a3a", 6: "var(--mid)", 8: "#7bb35a", 10: "var(--good)" };

const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  like: '<svg viewBox="0 0 24 24"><path d="M7 10v11H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 21H7"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const img = (src, cls = "", alt = "") => (src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">` : "");
const tone = (avg) => (avg >= 7 ? "good" : avg >= 4.5 ? "mid" : "bad");
const date = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const shortDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const gameName = (zh) => zh.replace(/第(\d+)局/, "Game $1");
const vs = (m) => m.teams.map((t) => t.name).join(" vs ");
// The series format, which reveals nothing about the result (wins needed × 2 − 1).
const bestOf = (m) => `Bo${Math.max(m.teams[0].score, m.teams[1].score) * 2 - 1}`;

function eventName(zh) {
  const ev = EVENTS.find(([k]) => zh.includes(k))?.[1] ?? zh;
  const st = STAGES.filter(([k]) => zh.includes(k)).map(([, v]) => v).join(" ");
  return st ? `${ev} · ${st}` : ev;
}

// Hupu writes counts like "6.3万" where 万 is ten thousand.
const raterCount = (s) => {
  const [, n, wan] = String(s).match(/([\d.]+)(万)?/) ?? [];
  return n ? Math.round(n * (wan ? 1e4 : 1)).toLocaleString() : "";
};

async function load(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(r.status))));
  return cache.get(path);
}

let spoilers = false;

// Match-page view settings.
const view = { sort: "hot", lang: "en", q: "", searching: false, player: null, playerName: null, showExtra: false, shown: PAGE };

// Stages the reader has opened or closed in the sidebar; the current match's stage always starts open.
const openStages = new Set();
const closedStages = new Set();
let lastSidebar = null;

function sidebar(index, current) {
  lastSidebar = [index, current];
  const groups = new Map();
  for (const m of index.matches) {
    const g = eventName(m.event);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(m);
  }
  const currentStage = [...groups].find(([, list]) => list.some((m) => m.id === current?.match))?.[0];
  nav.innerHTML = [...groups].map(([g, list], i) => {
    const open = !closedStages.has(g) && (openStages.has(g) || g === currentStage || (!currentStage && i === 0));
    return `<button class="stage ${open ? "open" : ""}" data-stage="${esc(g)}" aria-expanded="${open}">
      <span><b>${esc(g)}</b><small>${list.length} ${list.length === 1 ? "match" : "matches"}</small></span>${open ? ICON.chevron : ICON.right}</button>
      ${open ? `<div class="stage-list">${stageMatches(list, current)}</div>` : ""}`;
  }).join("");
}

function stageMatches(list, current) {
  return list.map((m) => {
    const active = current?.match === m.id;
    const games = active ? `<div class="nav-games">${(current.tabs ?? [...m.games].sort((a, b) => a.name.localeCompare(b.name))).map((g) =>
      `<a href="#/m/${m.id}/${g.id}" class="${g.id === current.game ? "active" : ""}">${gameName(g.name)}</a>`).join("")}</div>` : "";
    return `<a class="nav-match ${active ? "active" : ""}" href="#/m/${m.id}">
      <span><b>${esc(spoilers ? `${m.teams[0].name} ${m.teams[0].score}–${m.teams[1].score} ${m.teams[1].name}` : vs(m))}</b><small>${shortDate(m.start)} · ${bestOf(m)}</small></span>
      ${active ? ICON.chevron : ICON.right}</a>${games}`;
  }).join("");
}

function header(title, sub) {
  return `<div class="title"><button class="menu" data-menu aria-label="Open navigation">${ICON.menu}</button><h1>${title}</h1></div>${sub ?? ""}`;
}

function annotated(c) {
  const notes = new Map((c.notes ?? []).map((n) => [n.id, n]));
  // Any marker that isn't a well-formed [~N:phrase] with a note is shown as its plain phrase.
  return esc(c.en).replace(/\[~([^\]:]*)(?::([^\]]*))?\]/g, (all, id, phrase = "") => {
    const n = /^\d+$/.test(id) ? notes.get(Number(id)) : null;
    if (!n) return /^\d*$/.test(phrase) ? "" : phrase;
    return `<span class="note" tabindex="0">${phrase}<span class="tip"><b>${esc(n.zh)}</b> ${n.pinyin ? `<em>${esc(n.pinyin)}</em>` : ""}<br>Literally “${esc(n.literal)}”. ${esc(n.context)}</span></span>`;
  });
}

function pics(c) {
  if (!c.images?.length) return "";
  return `<div class="pics">${c.images.map((src) => `<a href="${esc(src)}" target="_blank" rel="noopener noreferrer">${img(src, "", "Attached image")}</a>`).join("")}</div>`;
}

function textBlock(c) {
  if (!c.zh.trim()) return "";
  const zh = `<p class="text">${esc(c.zh)}</p>`;
  const done = Boolean(c.en);
  const en = done ? `<p class="text">${annotated(c)}</p>` : `<p class="pending">Being translated…</p>`;
  if (view.lang === "zh") return zh;
  if (view.lang === "split") return `<div class="split"><div>${zh}</div><div>${en}</div></div>`;
  if (!done) return zh + en;
  return `${en}<p class="text zh-orig" hidden>${esc(c.zh)}</p><button class="orig" data-orig>Show original</button>`;
}

function comment(c, it, isReply) {
  const stars = c.score ? `<span class="stars s${c.score}" title="${c.score / 2} of 5 stars">${"★".repeat(c.score / 2)}${"☆".repeat(5 - c.score / 2)}</span>` : "";
  const about = !isReply && !view.player ? `<span class="who">${img(it.image, "", it.name)}${esc(it.en ?? it.name)}</span>` : "";
  const thread = c.thread ?? [];
  return `<div class="c">
    <div class="c-top">${about}${c.user ? `<span class="user">${esc(c.user)}</span>` : ""}${c.to ? `<span class="to">→ ${esc(c.to)}</span>` : ""}${stars}${c.game && !isReply ? `<span class="tag">${c.game}</span>` : ""}<span class="date">${c.time ? shortDate(c.time) : ""}</span></div>
    ${textBlock(c)}${pics(c)}
    <div class="c-foot"><span class="likes">${ICON.like}${c.likes.toLocaleString()}</span>
      <a href="${HUPU}/score-item/lol_item/${c.item ?? it.link ?? it.id}" target="_blank" rel="noopener">${ICON.link}Link</a>
      ${c.ip ? `<span>${PROVINCES[c.ip] ?? "Outside China"}</span>` : ""}</div>
    ${thread.length ? `<button class="toggle" data-thread aria-expanded="false">${ICON.chevron}<span>Show ${thread.length} ${thread.length === 1 ? "reply" : "replies"}</span></button>
      <div class="thread" hidden>${thread.map((r) => comment(r, it, true)).join("")}</div>` : ""}
  </div>`;
}

function searchHit(c) {
  const q = view.q.toLowerCase();
  return [c, ...(c.thread ?? [])].some((x) => x.zh.toLowerCase().includes(q) || x.en?.toLowerCase().includes(q));
}

function feed(game) {
  let rows = game.items.filter((it) => !view.player || it.id === view.player).flatMap((it) => it.top.map((c) => ({ c, it })));
  if (view.q) rows = rows.filter(({ c }) => searchHit(c));
  const order = { hot: (a, b) => b.c.likes - a.c.likes, new: (a, b) => b.c.time - a.c.time, old: (a, b) => a.c.time - b.c.time };
  rows.sort(order[view.sort]);
  return rows;
}

function breakdown(it) {
  const total = Object.values(it.dist).reduce((a, b) => a + b, 0) || 1;
  const kd = (championNames(it) ? ` · ${championNames(it)}` : "") + (kda(it) ? ` · ${kda(it)} K/D/A` : it.kills != null ? ` · ${it.kills}/${it.deaths} K/D` : "");
  return `<div class="player">
    <div class="big ${tone(it.avg)}">${it.avg.toFixed(1)}</div>
    <div><b class="who-line">${esc(it.en ?? it.name)}${championIcon(it)}</b><div class="meta">${it.raters.toLocaleString()} ratings · ${it.comments.toLocaleString()} comments${kd} · <a class="hupu" href="${HUPU}/score-item/lol_item/${it.link ?? it.id}" target="_blank" rel="noopener">Rate on Hupu ↗</a></div></div>
    <div class="chart">${[10, 8, 6, 4, 2].map((k) => {
      const n = it.dist[k] ?? 0;
      return `<div class="row"><span>${k / 2}★</span><div class="bar"><i style="width:${(n / total) * 100}%;background:${COLORS[k]}"></i></div><span>${n.toLocaleString()} · ${Math.round((n / total) * 100)}%</span></div>`;
    }).join("")}</div>
  </div>`;
}

function renderFeed() {
  const box = app.querySelector("#feed-area");
  if (!box || !state.game) return;
  const rows = feed(state.game);
  const it = state.game.items.find((x) => x.id === view.player);
  const pill = (v, label) => `<button class="pill" data-sort="${v}" aria-pressed="${view.sort === v}">${label}</button>`;
  const lang = (v, label) => `<button class="pill" data-lang="${v}" aria-pressed="${view.lang === v}">${label}</button>`;
  box.innerHTML = `${it ? breakdown(it) : ""}
    <div class="comments-head"><h2>Comments (${rows.length.toLocaleString()})</h2>
      <div class="pills">${pill("hot", "Hot")}${pill("new", "Newest")}${pill("old", "Oldest")}</div>
      <div class="right"><button class="icon-btn" data-search aria-label="Search">${ICON.search}</button>${lang("zh", "Chinese")}${lang("en", "English")}${lang("split", "Side by Side")}</div>
    </div>
    ${view.searching ? `<input class="search" type="search" placeholder="Search comments" value="${esc(view.q)}" aria-label="Search comments">` : ""}
    ${rows.length ? `<div class="feed">${rows.slice(0, view.shown).map(({ c, it }) => comment(c, it)).join("")}</div>
      ${rows.length > view.shown ? `<button class="btn more-btn" data-more>Show more (${(rows.length - view.shown).toLocaleString()} left)</button>` : ""}`
      : `<p class="empty">No comments match.</p>`}`;
  if (view.searching) {
    const input = box.querySelector(".search");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

const state = { game: null };
const fullCache = new Map();

// The whole-match view: each person once, with Hupu's 全场 score, votes summed across games and every game's comments.
function fullMatch(m, games, entry) {
  if (fullCache.has(m.id)) return fullCache.get(m.id);
  const series = new Map((entry?.series ?? []).map((p) => [p.name, p]));
  const merged = new Map();
  for (const g of games) {
    for (const it of g.items) {
      if (it.type === "bpHero") continue;
      let x = merged.get(it.name);
      if (!x) merged.set(it.name, x = { ...it, id: `all-${it.id}`, link: it.id, top: [], dist: {}, raters: 0, comments: 0, weighted: 0, kills: null });
      x.top.push(...it.top.map((c) => ({ ...c, game: gameName(g.name), item: it.id })));
      if (it.pick && !(x.picks ??= []).some((c) => c.name === it.pick.name)) x.picks.push(it.pick);
      // K/D/A for the series is the sum over its games.
      const k = kda(it).split("/").map(Number);
      if (k.length === 3) x.kdaSum = (x.kdaSum ?? [0, 0, 0]).map((v, i) => v + k[i]);
      for (const [k, n] of Object.entries(it.dist)) x.dist[k] = (x.dist[k] ?? 0) + n;
      x.raters += it.raters;
      x.comments += it.comments;
      x.weighted += it.avg * it.raters;
    }
  }
  const items = [...merged.values()].map((x) => {
    const s = series.get(x.name);
    return { ...x, avg: s ? s.avg : x.weighted / (x.raters || 1), raters: s ? s.raters : x.raters,
      note: x.kdaSum ? `K/D/A:${x.kdaSum.join("/")}` : null };
  }).sort((a, b) => b.raters - a.raters);
  const full = { id: "all", name: "Full match", full: true, items };
  fullCache.set(m.id, full);
  return full;
}

// Champions a player used (from Riot; one per game, several in the full-match view) and their K/D/A from Hupu's note.
const picksOf = (it) => it.picks ?? (it.pick ? [it.pick] : []);
const championIcon = (it) => picksOf(it).slice(0, 3).map((c) => img(c.icon, "champ", c.name)).join("");
const championNames = (it) => picksOf(it).map((c) => c.name).join(", ");
const kda = (it) => it.note?.match(/K\/D\/A[:：]\s*([\d/]+)/)?.[1] ?? "";

// Rated entries as wrapping rows instead of one long scroll: one row per team, then casters and co-streams, then bans.
function chipRows(items, m, teamIndex) {
  const chip = (it, quoted) => `<button class="chip" data-player="${it.id}" aria-pressed="${view.player === it.id}">
    <span class="faces">${img(it.image, "face", it.name)}${championIcon(it)}</span>
    <span><b>${quoted ? `“${esc(it.en ?? it.name)}”` : esc(it.en ?? it.name)}</b> <span class="score ${tone(it.avg)}">${it.avg.toFixed(1)}</span><small>${[championNames(it), kda(it), `${it.raters.toLocaleString()} ratings`].filter(Boolean).join(" · ")}</small></span></button>`;
  // Players and coaches always show; Hupu's extra entries (casters, fun ratings, bans) sit behind a toggle.
  const people = (it) => (it.type === "player" || it.type === "coach") && teamIndex(it) < 2;
  const caster = (it) => /^(解说|二路|场内主持|主持)/.test(it.name);
  const rows = (list) => list.filter(([, l]) => l.length)
    .map(([label, l]) => `<div class="chip-row"><span class="row-label">${esc(label)}</span><div class="chips">${l.map((it) => chip(it, label === "Fun ratings")).join("")}</div></div>`).join("");
  const main = m.teams.map((t, i) => [t.name, items.filter((it) => people(it) && teamIndex(it) === i)]);
  const extra = [
    ["Casters & co-streams", items.filter((it) => !people(it) && it.type !== "bpHero" && caster(it))],
    ["Fun ratings", items.filter((it) => !people(it) && it.type !== "bpHero" && !caster(it))],
    ["Bans", items.filter((it) => it.type === "bpHero")],
  ];
  const extraCount = extra.reduce((s, [, l]) => s + l.length, 0);
  const open = view.showExtra || extra.some(([, l]) => l.some((it) => it.id === view.player));
  return rows(main) + (extraCount ? `
    <button class="btn more-ratings" data-extra aria-expanded="${open}">${open ? "Hide" : "Show"} ${extraCount} more ratings</button>
    ${open ? rows(extra) : ""}` : "");
}

// MVP and LVP of the match, each under its own team's side; shown only inside the match to avoid spoilers.
function standoutsRow(m, entry) {
  const s = entry?.standouts?.mvp?.team ? entry.standouts : null;
  if (!s) return "";
  const pick = (p, label) => `<span class="pick">${img(p.image, "", p.name)}<span><small>${label} · ${gameName(p.game)}</small>${esc(p.name)} <span class="${tone(p.avg)}">${p.avg.toFixed(1)}</span></span></span>`;
  const picksFor = (t) => [[s.mvp, "MVP"], [s.worst, "LVP"]].filter(([p]) => p.team === t.id).map(([p, l]) => pick(p, l)).join("");
  return `<div class="picks match-picks"><div class="col">${picksFor(m.teams[0])}</div><div class="col away">${picksFor(m.teams[1])}</div></div>`;
}

async function showMatch(id, gameId) {
  const [index, m] = await Promise.all([load("data/index.json"), load(`data/matches/${id}.json`)]);
  const entry = index.matches.find((x) => x.id === m.id);
  const games = [...m.games].sort((a, b) => a.name.localeCompare(b.name));
  // Series with more than one game open on the full-match tab.
  const tabs = games.length > 1 ? [fullMatch(m, games, entry), ...games] : games;
  const game = tabs.find((g) => g.id === gameId) ?? tabs[0];
  // Switching game or match keeps sort, language and search, and keeps the selected person by name when they are in it.
  if (state.game !== game) {
    view.player = game?.items.find((it) => it.name === view.playerName)?.id ?? null;
    view.shown = PAGE;
  }
  state.game = game;
  sidebar(index, { match: m.id, game: game?.id, tabs });
  document.title = `${vs(m)} · Hupu LoL Ratings`;
  const [a, b] = m.teams;
  // Lineup order in every tab: each team Top to Support, then coaches, casters and the rest, then bans.
  const ROLES = ["TOP", "JUN", "MID", "BOT", "SUP"];
  const roleOf = new Map((entry?.series ?? []).map((p) => [p.name, p.role]));
  const teamIndex = (it) => { const i = m.teams.findIndex((t) => t.id === it.team || t.id === (entry?.series ?? []).find((p) => p.name === it.name)?.team); return i < 0 ? 2 : i; };
  const rank = (it) => it.type === "bpHero" ? [4, teamIndex(it), 0] : it.type === "player" ? [0, teamIndex(it), ROLES.indexOf(roleOf.get(it.name)) + 1 || 9] : [3, 0, -it.raters];
  const items = game ? [...game.items].sort((x, y) => { const a = rank(x), b = rank(y); return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }) : [];
  app.innerHTML = `
    ${header(`${img(a.logo, "", a.name)}${esc(a.name)} ${a.score} – ${b.score} ${esc(b.name)}${img(b.logo, "", b.name)}`,
      `<p class="sub">${esc(eventName(m.event))}${game ? ` · ${gameName(game.name)}` : ""}${m.raters ? ` · ${raterCount(m.raters)} raters` : ""}</p>
       <p class="updated">Last updated: ${date(index.updated)}</p>`)}
    ${standoutsRow(m, entry)}
    ${game ? `<div class="label">${tabs.length > 1 ? `${gameName(game.name)} · ` : ""}${items.length} rated</div>
    <div class="rated">
      <button class="chip all" data-player="" aria-pressed="${!view.player}">All</button>
      ${chipRows(items, m, teamIndex)}
    </div>` : ""}
    <div class="links">
      ${tabs.map((g) => `<a class="btn" href="#/m/${m.id}/${g.id}" aria-pressed="${g === game}">${gameName(g.name)}</a>`).join("")}
      <a class="btn" href="${HUPU}/score-list/lol_match/${m.key.no}" target="_blank" rel="noopener">${ICON.out}Match on Hupu</a>
      ${game && !game.full ? `<a class="btn" href="${HUPU}/score-list/lol_bo/${game.id}" target="_blank" rel="noopener">${ICON.out}${gameName(game.name)} on Hupu</a>` : ""}
    </div>
    <p class="disclaimer">Translations and annotations are AI-generated and may not be fully accurate.</p>
    <section id="feed-area"></section>`;
  renderFeed();
}

async function showHome() {
  const index = await load("data/index.json");
  sidebar(index, null);
  document.title = "Hupu LoL Ratings";
  // One section per tournament stage, newest stage first, same grouping as the sidebar; no scores or ratings here, to avoid spoilers.
  const sections = new Map();
  for (const m of index.matches) {
    const key = eventName(m.event);
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key).push(m);
  }
  app.innerHTML = `${header("Hupu LoL Ratings", `<p class="updated">Last updated: ${date(index.updated)}</p>`)}
    ${[...sections].map(([stage, list]) => `<h2 class="section">${esc(stage)}</h2><div class="cards">${list.map((m) => {
      const [a, b] = m.teams;
      const lost = (t) => spoilers && m.winner && t.id !== m.winner ? "lost" : "";
      const side = (t, cls) => `<div class="team ${cls} ${lost(t)}">${cls === "away" ? esc(t.name) + img(t.logo) : img(t.logo) + esc(t.name)}</div>`;
      return `<a class="card" href="#/m/${m.id}">
        <div class="meta"><span>${bestOf(m)}</span><span>${date(m.start)}</span></div>
        <div class="versus">${side(a, "left")}${spoilers ? `<div class="score">${a.score} – ${b.score}</div>` : `<div class="score vs">vs</div>`}${side(b, "away")}</div>
        ${spoilers ? standoutsRow(m, m).replace("picks match-picks", "picks") : ""}
      </a>`;
    }).join("")}</div>`).join("")}`;
}

async function showAbout() {
  sidebar(await load("data/index.json"), null);
  document.title = "About · Hupu LoL Ratings";
  app.innerHTML = `${header("About this site")}<div class="about">
    <p>After every pro League of Legends game, fans on <a class="hupu" href="https://www.hupu.com/" target="_blank" rel="noopener">Hupu</a> (虎扑) rate each player, coach, caster and ban from 1 to 5 stars and comment. This site collects each entry's most-liked comments and their replies.</p>
    <p>Gemini translates the comments.</p>
    <h2>Contact</h2>
    <p>For issues, suggestions, or any other feedback, reach out to <a class="hupu" href="https://www.reddit.com/user/Raynasty66/" target="_blank" rel="noopener">u/Raynasty66</a> on Reddit.</p></div>`;
}

app.addEventListener("click", (e) => {
  const t = e.target;
  if (t.closest("[data-menu]")) document.body.classList.add("nav-open");
  const player = t.closest("[data-player]");
  if (player) {
    view.player = player.dataset.player || null;
    view.playerName = state.game.items.find((it) => it.id === view.player)?.name ?? null;
    view.shown = PAGE;
    app.querySelectorAll("[data-player]").forEach((c) => c.setAttribute("aria-pressed", String(c === player)));
    renderFeed();
  }
  const sort = t.closest("[data-sort]");
  if (sort) { view.sort = sort.dataset.sort; renderFeed(); }
  const lang = t.closest("[data-lang]");
  if (lang) { view.lang = lang.dataset.lang; renderFeed(); }
  if (t.closest("[data-search]")) {
    view.searching = !view.searching;
    if (!view.searching) view.q = "";
    renderFeed();
  }
  if (t.closest("[data-more]")) { view.shown += PAGE; renderFeed(); }
  if (t.closest("[data-extra]")) {
    view.showExtra = !view.showExtra;
    route(false);
    return;
  }
  const thread = t.closest("[data-thread]");
  if (thread) {
    const box = thread.nextElementSibling;
    box.hidden = !box.hidden;
    thread.setAttribute("aria-expanded", String(!box.hidden));
    const n = box.children.length;
    thread.querySelector("span").textContent = `${box.hidden ? "Show" : "Hide"} ${n} ${n === 1 ? "reply" : "replies"}`;
  }
  const orig = t.closest("[data-orig]");
  if (orig) {
    const zh = orig.previousElementSibling;
    zh.hidden = !zh.hidden;
    orig.textContent = zh.hidden ? "Show original" : "Hide original";
  }
});

let searchTimer;
app.addEventListener("input", (e) => {
  if (!e.target.classList.contains("search")) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    view.q = e.target.value.trim();
    view.shown = PAGE;
    renderFeed();
  }, 250);
});

document.getElementById("scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
nav.addEventListener("click", (e) => {
  const stage = e.target.closest("[data-stage]");
  if (stage) {
    const g = stage.dataset.stage;
    const open = stage.getAttribute("aria-expanded") === "true";
    (open ? closedStages : openStages).add(g);
    (open ? openStages : closedStages).delete(g);
    sidebar(...lastSidebar);
    return;
  }
  if (e.target.closest("a")) document.body.classList.remove("nav-open");
});

// Theme: light, dark, or follow the system; remembered per browser when storage is allowed.
function applyTheme(mode) {
  if (mode === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  try { localStorage.setItem("theme", mode); } catch {}
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === mode)));
}
document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.themeSet)));
applyTheme(document.documentElement.dataset.theme ?? "system");

// Spoilers: hidden by default; when shown, scores and MVP/LVP also appear in the sidebar and on the home cards.
function applySpoilers(on, rerender) {
  spoilers = on;
  try { localStorage.setItem("spoilers", on ? "on" : "off"); } catch {}
  document.querySelectorAll("[data-spoilers]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.spoilers === "on") === on)));
  if (rerender) route(false);
}
document.querySelectorAll("[data-spoilers]").forEach((b) => b.addEventListener("click", () => applySpoilers(b.dataset.spoilers === "on", true)));
try { spoilers = localStorage.getItem("spoilers") === "on"; } catch {}
applySpoilers(spoilers, false);

async function route(scroll) {
  const [, kind, a, b] = location.hash.split("/");
  try {
    if (kind === "m") await showMatch(a, b);
    else if (kind === "about") await showAbout();
    else await showHome();
  } catch {
    app.innerHTML = `<p class="empty">Couldn't load that page.</p>`;
  }
  if (scroll !== false) window.scrollTo(0, 0);
}

addEventListener("hashchange", route);
route();
