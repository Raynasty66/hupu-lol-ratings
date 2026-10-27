const app = document.getElementById("app");
const cache = new Map();

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

const HUPU = "https://m.hupu.com";
const hupuLink = (path, text) => `<a class="hupu" href="${HUPU}${path}" target="_blank" rel="noopener">${text} ↗</a>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const img = (src, cls, alt = "") => (src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">` : "");

function eventName(zh) {
  const ev = EVENTS.find(([k]) => zh.includes(k))?.[1] ?? zh;
  const st = STAGES.filter(([k]) => zh.includes(k)).map(([, v]) => v).join(" ");
  return st ? `${ev} · ${st}` : ev;
}
const eventGroup = (zh) => EVENTS.find(([k]) => zh.includes(k))?.[1] ?? "Other";
const tone = (avg) => (avg >= 7 ? "r-good" : avg >= 4.5 ? "r-mid" : "r-bad");
const date = (ms) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
// Hupu writes counts like "6.3万" where 万 is ten thousand.
const raterCount = (s) => {
  const [, n, wan] = s.match(/([\d.]+)(万)?/) ?? [];
  return n ? Math.round(n * (wan ? 1e4 : 1)).toLocaleString() : "";
};
const gameName = (zh) => zh.replace(/第(\d+)局/, "Game $1");

async function load(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(r.status))));
  return cache.get(path);
}

function annotated(c) {
  const notes = new Map((c.notes ?? []).map((n) => [n.id, n]));
  return esc(c.en).replace(/\[~(\d+):([^\]]*)\]/g, (all, id, phrase) => {
    const n = notes.get(Number(id));
    if (!n) return phrase;
    return `<span class="note" tabindex="0">${phrase}<span class="tip"><b>${esc(n.zh)}</b> ${n.pinyin ? `<em>${esc(n.pinyin)}</em>` : ""}<br>Literally “${esc(n.literal)}”. ${esc(n.context)}</span></span>`;
  });
}

// Match-page view settings, shared by every player card.
const view = { sort: "top", stars: 0, lang: "en", q: "", open: new Set() };
const COLORS = { 2: "var(--bad)", 4: "#e07a3a", 6: "var(--mid)", 8: "#7bb35a", 10: "var(--good)" };
const starText = (score) => (score ? "★".repeat(score / 2) + "☆".repeat(5 - score / 2) : "");

function body(c) {
  const english = c.en && c.verified;
  const en = english ? `<p class="en">${annotated(c)}</p>` : "";
  const zh = `<p class="zh">${esc(c.zh)}</p>`;
  if (!english) return `${zh}<p class="pending">English translation is still being checked.</p>`;
  if (view.lang === "zh") return zh;
  if (view.lang === "both") return en + zh;
  return en;
}

function renderComment(c) {
  const thread = c.thread ?? [];
  return `<div class="comment">${body(c)}<div class="info">
    ${c.score ? `<span class="stars s${c.score}" title="${c.score / 2} of 5 stars">${starText(c.score)}</span>` : ""}
    <span>▲ ${c.likes.toLocaleString()}</span>
    ${c.ip ? `<span>${PROVINCES[c.ip] ?? "Outside China"}</span>` : ""}
    ${thread.length ? `<button class="link" data-thread aria-expanded="false">${thread.length} ${thread.length === 1 ? "reply" : "replies"}</button>` : ""}
  </div>
  ${thread.length ? `<div class="thread" hidden>${thread.map((r) => `<div class="reply">${r.to ? `<span class="to">→ ${esc(r.to)}</span>` : ""}${body(r)}
    <div class="info"><span>▲ ${r.likes.toLocaleString()}</span>${r.ip ? `<span>${PROVINCES[r.ip] ?? "Outside China"}</span>` : ""}</div></div>`).join("")}</div>` : ""}
  </div>`;
}

function matches(c) {
  if (view.stars && c.score !== view.stars) return false;
  if (!view.q) return true;
  const q = view.q.toLowerCase();
  return [c, ...(c.thread ?? [])].some((x) => x.zh.toLowerCase().includes(q) || (x.verified && x.en?.toLowerCase().includes(q)));
}

function breakdown(it) {
  const total = Object.values(it.dist).reduce((a, b) => a + b, 0) || 1;
  return `<div class="chart" role="img" aria-label="Rating breakdown">${[10, 8, 6, 4, 2].map((k) => {
    const n = it.dist[k] ?? 0;
    return `<div class="row"><span>${k / 2}★</span><div class="bar"><i style="width:${(n / total) * 100}%;background:${COLORS[k]}"></i></div><span>${n.toLocaleString()} · ${Math.round((n / total) * 100)}%</span></div>`;
  }).join("")}</div>`;
}

function renderItem(it, teams) {
  const total = Object.values(it.dist).reduce((a, b) => a + b, 0) || 1;
  const dist = [2, 4, 6, 8, 10].map((k) => `<i style="width:${((it.dist[k] ?? 0) / total) * 100}%;background:${COLORS[k]}"></i>`).join("");
  const team = teams.find((t) => t.id === it.team)?.name;
  const kd = it.kills != null ? `${it.kills}/${it.deaths} K/D` : "";
  const sub = [team, kd, it.type === "bpHero" ? "Bans" : ""].filter(Boolean).join(" · ");
  const list = it.top.filter(matches).sort(view.sort === "new" ? (a, b) => b.time - a.time : (a, b) => b.likes - a.likes);
  const open = view.open.has(it.id) || (view.q && list.length > 0);
  if ((view.q || view.stars) && !list.length) return "";
  return `<article class="item" data-id="${it.id}">
    <button aria-expanded="${open}">
      <div class="avatar">${img(it.image, "face", it.name)}${img(it.champion, "champ", "champion")}</div>
      <div class="who"><b>${esc(it.en ?? it.name)}</b><small>${esc(sub)}</small><div class="dist" title="1★ to 5★ share">${dist}</div></div>
      <div class="rating"><b class="${tone(it.avg)}">${it.avg.toFixed(1)}</b><small>${it.raters.toLocaleString()} ratings</small></div>
    </button>
    <div class="comments" ${open ? "" : "hidden"}>${breakdown(it)}
      ${list.length ? list.map(renderComment).join("") : `<p class="empty">No comments match.</p>`}
      <p class="more">Showing the ${it.top.length} most-liked of ${it.comments.toLocaleString()} comments. ${hupuLink(`/score-item/lol_item/${it.id}`, "Rate it or read the rest on Hupu")}</p></div>
  </article>`;
}

function controls() {
  const seg = (key, opts) => `<div class="seg" role="group">${opts.map(([v, label]) =>
    `<button data-set="${key}" data-value="${v}" aria-pressed="${String(view[key]) === String(v)}">${label}</button>`).join("")}</div>`;
  return `<div class="controls">
    ${seg("sort", [["top", "Top"], ["new", "Newest"]])}
    ${seg("stars", [[0, "All"], [10, "5★"], [8, "4★"], [6, "3★"], [4, "2★"], [2, "1★"]])}
    ${seg("lang", [["en", "English"], ["zh", "中文"], ["both", "Both"]])}
    <input type="search" placeholder="Search comments" value="${esc(view.q)}" aria-label="Search comments">
  </div>`;
}

async function showList(filter) {
  const index = await load("data/index.json");
  document.getElementById("updated").textContent = `Last updated ${new Date(index.updated).toLocaleString()}.`;
  const groups = [...new Set(index.matches.map((m) => eventGroup(m.event)))];
  const active = filter && groups.includes(filter) ? filter : null;
  const list = index.matches.filter((m) => !active || eventGroup(m.event) === active);
  app.innerHTML = `
    <nav class="chips" aria-label="Events">
      <a class="chip" href="#/" aria-pressed="${!active}">All</a>
      ${groups.map((g) => `<a class="chip" href="#/e/${encodeURIComponent(g)}" aria-pressed="${g === active}">${esc(g)}</a>`).join("")}
    </nav>
    <section class="matches">${list.map((m) => {
      const [a, b] = m.teams;
      const side = (t, cls) => `<div class="team ${cls} ${m.winner && t.id !== m.winner ? "lost" : ""}">${cls === "away" ? esc(t.name) + img(t.logo, "") : img(t.logo, "") + esc(t.name)}</div>`;
      const s = m.standouts;
      const pick = (p, label, cls) => `<span class="pick">${img(p.image, "mini", p.name)}<span><small>${label} · ${esc(gameName(p.game))}</small>${esc(p.name)} <b class="${cls}">${p.avg.toFixed(1)}</b></span></span>`;
      return `<a class="match" href="#/m/${m.id}">
        <div class="meta"><span>${esc(eventName(m.event))}</span><span>${date(m.start)}</span></div>
        ${side(a, "home")}<div class="score">${a.score} – ${b.score}</div>${side(b, "away")}
        ${s ? `<div class="picks">${pick(s.mvp, "Fans' MVP", tone(s.mvp.avg))}${pick(s.worst, "Scapegoat", tone(s.worst.avg))}</div>` : ""}
      </a>`;
    }).join("") || `<p class="empty">No matches yet.</p>`}</section>`;
}

async function showMatch(id, gameId) {
  const m = await load(`data/matches/${id}.json`);
  const game = m.games.find((g) => g.id === gameId) ?? [...m.games].sort((a, b) => a.name.localeCompare(b.name))[0];
  const [a, b] = m.teams;
  document.title = `${a.name} vs ${b.name} · Hupu LoL Ratings`;
  app.innerHTML = `
    <a class="back" href="#/">← All matches</a>
    <div class="head"><h1>${esc(a.name)} ${a.score} – ${b.score} ${esc(b.name)}</h1>
      <div class="sub">${esc(eventName(m.event))} · ${date(m.start)}${m.raters ? ` · ${raterCount(m.raters)} raters` : ""}
        · ${hupuLink(`/score-list/lol_match/${m.key.no}`, "Match on Hupu")}</div></div>
    <nav class="tabs">${[...m.games].sort((x, y) => x.name.localeCompare(y.name)).map((g) =>
      `<a class="chip" href="#/m/${m.id}/${g.id}" aria-pressed="${g === game}">${esc(gameName(g.name))}</a>`).join("")}
      ${game ? hupuLink(`/score-list/lol_bo/${game.id}`, `${gameName(game.name)} on Hupu`) : ""}</nav>
    ${controls()}
    <section class="items"></section>`;
  current = { game, teams: m.teams };
  renderItems();
}

let current = null;

function renderItems() {
  const box = app.querySelector(".items");
  if (!box || !current) return;
  const html = current.game ? current.game.items.map((it) => renderItem(it, current.teams)).join("") : "";
  box.innerHTML = html || `<p class="empty">${current.game ? "No comments match." : "No games rated yet."}</p>`;
}

app.addEventListener("click", (e) => {
  const head = e.target.closest(".item > button");
  if (head) {
    const id = head.parentElement.dataset.id;
    const open = head.getAttribute("aria-expanded") === "true";
    head.setAttribute("aria-expanded", String(!open));
    head.nextElementSibling.hidden = open;
    if (open) view.open.delete(id);
    else view.open.add(id);
  }
  const set = e.target.closest("[data-set]");
  if (set) {
    const key = set.dataset.set;
    view[key] = key === "stars" ? Number(set.dataset.value) : set.dataset.value;
    set.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === set)));
    renderItems();
  }
  const thread = e.target.closest("[data-thread]");
  if (thread) {
    const box = thread.closest(".comment").querySelector(".thread");
    box.hidden = !box.hidden;
    thread.setAttribute("aria-expanded", String(!box.hidden));
  }
});

let searchTimer;
app.addEventListener("input", (e) => {
  if (e.target.type !== "search") return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    view.q = e.target.value.trim();
    renderItems();
  }, 200);
});

async function route() {
  const [, kind, a, b] = location.hash.split("/");
  document.title = "Hupu LoL Ratings";
  try {
    if (kind === "m") await showMatch(a, b);
    else await showList(kind === "e" ? decodeURIComponent(a) : null);
  } catch {
    app.innerHTML = `<p class="empty">Couldn't load that page.</p>`;
  }
  if (kind !== "m" || !b) window.scrollTo(0, 0);
}

addEventListener("hashchange", route);
route();
