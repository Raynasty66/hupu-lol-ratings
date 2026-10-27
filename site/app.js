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
const score = (m) => `${m.teams[0].name} ${m.teams[0].score}–${m.teams[1].score} ${m.teams[1].name}`;

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

// Match-page view settings.
const view = { sort: "hot", lang: "en", q: "", searching: false, player: null, shown: PAGE };

function sidebar(index, current) {
  const groups = new Map();
  for (const m of index.matches) {
    const g = eventName(m.event);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(m);
  }
  nav.innerHTML = [...groups].map(([g, list]) => `<div class="group">${esc(g)}</div>${list.map((m) => {
    const active = current?.match === m.id;
    const games = active ? `<div class="nav-games">${(current.tabs ?? [...m.games].sort((a, b) => a.name.localeCompare(b.name))).map((g) =>
      `<a href="#/m/${m.id}/${g.id}" class="${g.id === current.game ? "active" : ""}">${gameName(g.name)}</a>`).join("")}</div>` : "";
    return `<a class="nav-match ${active ? "active" : ""}" href="#/m/${m.id}">
      <span><b>${esc(score(m))}</b><small>${shortDate(m.start)} · ${m.games.length} ${m.games.length === 1 ? "game" : "games"}</small></span>
      ${active ? ICON.chevron : ICON.right}</a>${games}`;
  }).join("")}`).join("");
}

function header(title, sub) {
  return `<div class="title"><button class="menu" data-menu aria-label="Open navigation">${ICON.menu}</button><h1>${title}</h1></div>${sub ?? ""}`;
}

function annotated(c) {
  const notes = new Map((c.notes ?? []).map((n) => [n.id, n]));
  return esc(c.en).replace(/\[~(\d+):([^\]]*)\]/g, (all, id, phrase) => {
    const n = notes.get(Number(id));
    if (!n) return phrase;
    return `<span class="note" tabindex="0">${phrase}<span class="tip"><b>${esc(n.zh)}</b> ${n.pinyin ? `<em>${esc(n.pinyin)}</em>` : ""}<br>Literally “${esc(n.literal)}”. ${esc(n.context)}</span></span>`;
  });
}

function textBlock(c) {
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
    ${textBlock(c)}
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
  const kd = it.kills != null ? ` · ${it.kills}/${it.deaths} K/D` : "";
  return `<div class="player">
    <div class="big ${tone(it.avg)}">${it.avg.toFixed(1)}</div>
    <div><b>${esc(it.en ?? it.name)}</b><div class="meta">${it.raters.toLocaleString()} ratings · ${it.comments.toLocaleString()} comments${kd} · <a class="hupu" href="${HUPU}/score-item/lol_item/${it.link ?? it.id}" target="_blank" rel="noopener">Rate on Hupu ↗</a></div></div>
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
      for (const [k, n] of Object.entries(it.dist)) x.dist[k] = (x.dist[k] ?? 0) + n;
      x.raters += it.raters;
      x.comments += it.comments;
      x.weighted += it.avg * it.raters;
    }
  }
  const items = [...merged.values()].map((x) => {
    const s = series.get(x.name);
    return { ...x, avg: s ? s.avg : x.weighted / (x.raters || 1), raters: s ? s.raters : x.raters };
  }).sort((a, b) => b.raters - a.raters);
  const full = { id: "all", name: "Full match", full: true, items };
  fullCache.set(m.id, full);
  return full;
}

async function showMatch(id, gameId) {
  const [index, m] = await Promise.all([load("data/index.json"), load(`data/matches/${id}.json`)]);
  const entry = index.matches.find((x) => x.id === m.id);
  const games = [...m.games].sort((a, b) => a.name.localeCompare(b.name));
  // Series with more than one game open on the full-match tab.
  const tabs = games.length > 1 ? [fullMatch(m, games, entry), ...games] : games;
  const game = tabs.find((g) => g.id === gameId) ?? tabs[0];
  if (state.game !== game) Object.assign(view, { player: null, q: "", searching: false, shown: PAGE });
  state.game = game;
  sidebar(index, { match: m.id, game: game?.id, tabs });
  document.title = `${vs(m)} · Hupu LoL Ratings`;
  const [a, b] = m.teams;
  const items = game ? game.items : [];
  app.innerHTML = `
    ${header(`${img(a.logo, "", a.name)}${esc(a.name)} ${a.score} – ${b.score} ${esc(b.name)}${img(b.logo, "", b.name)}`,
      `<p class="sub">${esc(eventName(m.event))}${game ? ` · ${gameName(game.name)}` : ""}${m.raters ? ` · ${raterCount(m.raters)} raters` : ""}</p>
       <p class="updated">Last updated: ${date(index.updated)}</p>`)}
    ${game ? `<div class="label">${tabs.length > 1 ? `${gameName(game.name)} · ` : ""}${items.length} rated</div>
    <div class="chips">
      <button class="chip all" data-player="" aria-pressed="${!view.player}">All</button>
      ${items.map((it) => `<button class="chip" data-player="${it.id}" aria-pressed="${view.player === it.id}">${img(it.image, "face", it.name)}
        <span><b>${esc(it.en ?? it.name)}</b> <span class="score ${tone(it.avg)}">${it.avg.toFixed(1)}</span><small>${it.raters.toLocaleString()} ratings</small></span></button>`).join("")}
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
  const pick = (p, label) => `<span class="pick">${img(p.image, "", p.name)}<span><small>${label} · ${gameName(p.game)}</small>${esc(p.name)} <span class="${tone(p.avg)}">${p.avg.toFixed(1)}</span></span></span>`;
  app.innerHTML = `${header("Hupu LoL Ratings", `<p class="updated">Last updated: ${date(index.updated)}</p>`)}
    <div class="cards">${index.matches.map((m) => {
      const [a, b] = m.teams;
      // MVP and LVP each sit under their own team's side.
      const s = m.standouts?.mvp?.team ? m.standouts : null;
      const picksFor = (t) => s ? [[s.mvp, "MVP"], [s.worst, "LVP"]].filter(([p]) => p.team === t.id).map(([p, l]) => pick(p, l)).join("") : "";
      const side = (t, cls) => `<div class="team ${cls} ${m.winner && t.id !== m.winner ? "lost" : ""}">${cls === "away" ? esc(t.name) + img(t.logo) : img(t.logo) + esc(t.name)}</div>`;
      return `<a class="card" href="#/m/${m.id}">
        <div class="meta"><span>${esc(eventName(m.event))}</span><span>${date(m.start)}</span></div>
        <div class="versus">${side(a, "left")}<div class="score">${a.score} – ${b.score}</div>${side(b, "away")}</div>
        ${s ? `<div class="picks"><div class="col">${picksFor(a)}</div><div class="col away">${picksFor(b)}</div></div>` : ""}
      </a>`;
    }).join("")}</div>`;
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
nav.addEventListener("click", (e) => { if (e.target.closest("a")) document.body.classList.remove("nav-open"); });

// Theme: light, dark, or follow the system; remembered per browser when storage is allowed.
function applyTheme(mode) {
  if (mode === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  try { localStorage.setItem("theme", mode); } catch {}
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === mode)));
}
document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.themeSet)));
applyTheme(document.documentElement.dataset.theme ?? "system");

async function route() {
  const [, kind, a, b] = location.hash.split("/");
  try {
    if (kind === "m") await showMatch(a, b);
    else if (kind === "about") await showAbout();
    else await showHome();
  } catch {
    app.innerHTML = `<p class="empty">Couldn't load that page.</p>`;
  }
  window.scrollTo(0, 0);
}

addEventListener("hashchange", route);
route();
