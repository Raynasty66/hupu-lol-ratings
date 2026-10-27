// Read-only client for Hupu's public LoL schedule, rating tree and comment endpoints.
const SCHEDULE = "https://match-api.hupu.com/1/8.2.10/matchallapi/bff/standard/getScheduleListByTagForH5";
const SCORE = "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, params) {
  const qs = new URLSearchParams(params).toString();
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${url}?${qs}`, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      await sleep(300);
      return body.data ?? body.result ?? body;
    } catch (err) {
      if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
      await sleep(1000 * attempt);
    }
  }
}

function findMatches(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => findMatches(n, out));
  else if (node && typeof node === "object") {
    if ("matchId" in node && "scoreItemKey" in node) out.push(node);
    else Object.values(node).forEach((n) => findMatches(n, out));
  }
  return out;
}

export async function schedule() {
  const data = await get(SCHEDULE, { businessType: "common", businessId: "lol", datasource: "navigation" });
  return findMatches(data).map((m) => {
    const [home, away] = m.againstInfo?.memberInfos ?? [];
    const team = (t) => t && { id: t.memberId, name: t.memberName, logo: t.memberLogo, score: Number(t.memberBaseScore ?? 0) };
    return {
      id: m.matchId,
      event: m.matchIntroduction || m.matchName,
      start: Number(m.matchStartTimeStamp),
      status: m.matchStatus,
      winner: m.againstInfo?.winnerMemberId ?? null,
      teams: [team(home), team(away)].filter(Boolean),
      raters: m.scoreCountText ?? null,
      key: m.scoreItemKey?.outBizType ? { type: m.scoreItemKey.outBizType, no: m.scoreItemKey.outBizNo } : null,
    };
  });
}

export async function children(type, no) {
  const data = await get(`${SCORE}/bpl/score_tree/getCurAndSubNodeByBizKey`, {
    outBizType: type, outBizNo: no, relation: "CHILD", page: 1, pageSize: 100,
  });
  return (data.pageResult?.data ?? []).map((x) => x.node);
}

export async function hottest(type, no) {
  const data = await get(`${SCORE}/bpl/comment/list/primarySingleRow/hottest`, { outBizType: type, outBizNo: no, clientCode: "" });
  return Array.isArray(data) ? data : data.comments ?? [];
}

export async function replies(type, no, parentId, max) {
  const data = await get(`${SCORE}/bpl/comment/list/primarySingleRow/getMore`, {
    publishTime: 0, outBizType: type, outBizNo: no, parentCommentId: parentId, pageSize: max, clientCode: "", cid: "",
  });
  return data.comments ?? [];
}

export async function latest(type, no, pages = Infinity) {
  const out = [];
  let cursor = Date.now();
  for (let i = 0; i < pages; i++) {
    const data = await get(`${SCORE}/bpl/comment/list/primarySingleRow`, {
      publishTime: cursor, order: "desc", outBizType: type, outBizNo: no, clientCode: "", cid: "",
    });
    if (!data.comments?.length) break;
    out.push(...data.comments);
    cursor = data.cursor.publishTime;
  }
  return out;
}
