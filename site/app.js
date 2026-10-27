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

function renderComment(c) {
  const stars = c.score ? "★".repeat(c.score / 2) + "☆".repeat(5 - c.score / 2) : "";
  const body = c.en
    ? `<p class="en">${annotated(c)}</p><p class="zh" hidden>${esc(c.zh)}</p>`
    : `<p class="zh">${esc(c.zh)}</p><p class="pending">Translation coming soon.</p>`;
  return `<div class="comment">${body}<div class="info">
    <span class="stars" title="${c.score / 2} of 5">${stars}</span>
    <span>▲ ${c.likes.toLocaleString()}</span>
    ${c.ip ? `<span>${PROVINCES[c.ip] ?? "Outside China"}</span>` : ""}
    ${c.replies ? `<span>${c.replies} ${c.replies === 1 ? "reply" : "replies"}</span>` : ""}
    ${c.en ? `<button class="link" data-flip>Show original</button>` : ""}
  </div></div>`;
}

function renderItem(it, teams) {
  const total = Object.values(it.dist).reduce((a, b) => a + b, 0) || 1;
  const colors = { 2: "var(--bad)", 4: "#e07a3a", 6: "var(--mid)", 8: "#7bb35a", 10: "var(--good)" };
  const dist = [2, 4, 6, 8, 10].map((k) => `<i style="width:${((it.dist[k] ?? 0) / total) * 100}%;background:${colors[k]}"></i>`).join("");
  const team = teams.find((t) => t.id === it.team)?.name;
  const kd = it.kills != null ? `${it.kills}/${it.deaths} K/D` : "";
  const sub = [team, kd, it.type === "bpHero" ? "Bans" : ""].filter(Boolean).join(" · ");
  return `<article class="item">
    <button aria-expanded="false">
      <div class="avatar">${img(it.image, "face", it.name)}${img(it.champion, "champ", "champion")}</div>
      <div class="who"><b>${esc(it.en ?? it.name)}</b><small>${esc(sub)}</small><div class="dist" title="1★ to 5★ share">${dist}</div></div>
      <div class="rating"><b class="${tone(it.avg)}">${it.avg.toFixed(1)}</b><small>${it.raters.toLocaleString()} ratings</small></div>
    </button>
    <div class="comments" hidden>${it.top.length ? it.top.map(renderComment).join("") : `<p class="empty">No comments yet.</p>`}
      <p class="more">${hupuLink(`/score-item/lol_item/${it.id}`, `Rate it or read all ${it.comments.toLocaleString()} comments on Hupu`)}</p></div>
  </article>`;
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
      return `<a class="match" href="#/m/${m.id}">
        <div class="meta"><span>${esc(eventName(m.event))}</span><span>${date(m.start)}</span></div>
        ${side(a, "home")}<div class="score">${a.score} – ${b.score}</div>${side(b, "away")}
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
    <section class="items">${game ? game.items.map((it) => renderItem(it, m.teams)).join("") : `<p class="empty">No games rated yet.</p>`}</section>`;
}

app.addEventListener("click", (e) => {
  const head = e.target.closest(".item > button");
  if (head) {
    const open = head.getAttribute("aria-expanded") === "true";
    head.setAttribute("aria-expanded", String(!open));
    head.nextElementSibling.hidden = open;
  }
  const flip = e.target.closest("[data-flip]");
  if (flip) {
    const c = flip.closest(".comment");
    const zh = c.querySelector(".zh");
    zh.hidden = !zh.hidden;
    c.querySelector(".en").hidden = !zh.hidden;
    flip.textContent = zh.hidden ? "Show original" : "Show English";
  }
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
