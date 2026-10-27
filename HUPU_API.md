# Hupu LoL ratings API

Six endpoints, called in this order: schedule → match → game → rated person → comments. No login or key is needed.

## Terms

| Term | Meaning |
|---|---|
| `outBizType` | What kind of thing you're asking about: `lol_match`, `lol_bo` or `lol_item`. |
| `outBizNo` | The id of that thing. You always pass it together with `outBizType`. |
| `lol_match` | A whole series, e.g. BLG vs KC. |
| `lol_bo` | One game inside a series ("bo" as in best-of). Named `第1局` = Game 1, `第2局` = Game 2. |
| `lol_item` | One rated entry inside a game: a player, coach (`教练`), caster (`解说`), co-streamer (`二路`) or a team's bans. |
| `bpHero` | Marks an entry that is a team's ban list rather than a person ("bp" = ban/pick). |
| `matchId` | The schedule's own id for a match. Only the full-match scores endpoint uses it. |
| `publishTime` | A time in milliseconds, used as a page cursor for comments. |
| `lightCount` | Likes. Hupu calls a like a "light" (点亮). |
| Score scale | 0–10: one star = 2, five stars = 10. |

### Parts of the URL path

| Part | Meaning |
|---|---|
| `match-api.hupu.com` | Hupu's schedule server. |
| `games.mobileapi.hupu.com` | Hupu's ratings and comments server. |
| `/1/8.2.99/`, `/1/8.2.58/`, `/1/8.2.10/` | The Hupu app version the endpoint belongs to. Use the version shown for each endpoint. |
| `bplcommentapi/bpl` | Hupu's ratings-and-comments service. |
| `score_tree` | The tree of rated things (match → games → people). |
| `comment/list/primarySingleRow` | Top-level comments (not replies). |

## 1. Schedule

```bash
curl "https://match-api.hupu.com/1/8.2.10/matchallapi/bff/standard/getScheduleListByTagForH5?businessType=common&businessId=lol&datasource=navigation"
```

| Parameter | Meaning |
|---|---|
| `businessType=common` | Always `common`. |
| `businessId=lol` | Which game's schedule: `lol` for League (others: `kog`, `cs2`, `val`). |
| `datasource=navigation` | Always `navigation`. |

Returns about two months of matches, nested by day. One match:

```json
{
  "matchId": "1693138570756096",
  "matchIntroduction": "全球总决赛瑞士轮",
  "matchStartTimeStamp": "1793037600000",
  "matchStatus": "COMPLETED",
  "againstInfo": {
    "memberInfos": [
      { "memberId": "57", "memberName": "BLG", "memberBaseScore": "1" },
      { "memberId": "853996080463872", "memberName": "KC", "memberBaseScore": "0" }
    ],
    "winnerMemberId": "57"
  },
  "scoreCountText": "9.0万人评分",
  "scoreItemKey": { "outBizType": "lol_match", "outBizNo": "4608" }
}
```

| Field | Meaning |
|---|---|
| `matchId` | The match's id; pass it to endpoint 6. |
| `matchIntroduction` | Event and stage in Chinese. `全球总决赛瑞士轮` = Worlds, Swiss stage. |
| `matchStartTimeStamp` | Start time in milliseconds. |
| `matchStatus` | `NOTSTARTED`, `INPROGRESS` or `COMPLETED`. |
| `memberInfos` | The two teams. |
| `memberId` | Team id (matches `teamId` in endpoints 2 and 6). |
| `memberName` | Team name. |
| `memberBaseScore` | Games that team won. |
| `winnerMemberId` | Id of the team that won. |
| `scoreCountText` | How many people rated the match. `9.0万` = 90,000 (万 = 10,000). |
| `scoreItemKey` | The match's `outBizType` and `outBizNo`; pass them to endpoint 2. |

## 2. Games in a match, or entries in a game

Same endpoint for both levels. Pass a `lol_match` to get its games:

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/score_tree/getCurAndSubNodeByBizKey?outBizType=lol_match&outBizNo=4608&relation=CHILD&page=1&pageSize=100"
```

| Parameter | Meaning |
|---|---|
| `outBizType=lol_match` | You're asking about a whole match. |
| `outBizNo=4608` | Which match (from the schedule's `scoreItemKey`). |
| `relation=CHILD` | Return what's inside it (its games), not the match itself. |
| `page=1` | Which page of results. |
| `pageSize=100` | Results per page; 100 covers everything. |

```json
{ "data": { "pageResult": { "data": [
  { "node": { "bizType": "lol_bo", "bizId": "7909", "name": "第1局" } }
] } } }
```

| Field | Meaning |
|---|---|
| `bizType` | `lol_bo`: this child is a game. |
| `bizId` | The game's id. |
| `name` | `第1局` = Game 1. |

Pass a `lol_bo` to get everyone rated in that game:

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/score_tree/getCurAndSubNodeByBizKey?outBizType=lol_bo&outBizNo=7909&relation=CHILD&page=1&pageSize=100"
```

| Parameter | Meaning |
|---|---|
| `outBizType=lol_bo` | You're asking about one game. |
| `outBizNo=7909` | Which game (the `bizId` from the previous call). |
| `relation`, `page`, `pageSize` | Same as above. |

```json
{ "data": { "pageResult": { "data": [
  { "node": {
      "bizType": "lol_item", "bizId": "80012", "name": "Bin",
      "scoreAvg": 9.7, "scorePersonCount": 20951, "commentCount": 3278,
      "scoreDistribution": { "2": 636, "4": 73, "6": 106, "8": 230, "10": 19906 },
      "infoJson": { "type": ["player"], "teamId": ["57"], "killCount": ["4"], "deathCount": ["1"] }
  } },
  { "node": { "bizType": "lol_item", "bizId": "80006", "name": "蔚/奇亚娜/辛德拉/卡西奥佩娅/烈娜塔 · 戈拉斯克",
      "infoJson": { "type": ["bpHero"] } } }
] } } }
```

| Field | Meaning |
|---|---|
| `bizType` | `lol_item`: a rated entry. |
| `bizId` | The entry's id; pass it as `outBizNo` to endpoints 3–5. |
| `name` | Player ID, or a label like `教练 X` (coach), `解说：X` (caster), or a list of banned champions. |
| `scoreAvg` | Average rating, 0–10. |
| `scorePersonCount` | How many people rated them. |
| `commentCount` | How many comments they have. |
| `scoreDistribution` | Votes per score: `"2"` = one star … `"10"` = five stars. |
| `infoJson.type` | `player`, or `bpHero` for a team's ban list. |
| `infoJson.teamId` | Their team (matches `memberId` from the schedule). |
| `infoJson.killCount`, `deathCount` | Kills and deaths in this game. |

## 3. Comments, newest first

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/comment/list/primarySingleRow?outBizType=lol_item&outBizNo=80012&order=desc&publishTime=1793050000000&clientCode=&cid="
```

| Parameter | Meaning |
|---|---|
| `outBizType=lol_item` | You want comments on a rated entry. |
| `outBizNo=80012` | Which entry (Bin's `bizId` from endpoint 2). |
| `order=desc` | Newest first (`asc` = oldest first). |
| `publishTime=1793050000000` | Return comments older than this time (ms). Start with the current time. |
| `clientCode=`, `cid=` | Leave empty. |

```json
{ "data": {
  "comments": [
    { "commentId": "3023283006", "commentContent": "[加油][加油]", "commentUserName": "虎扑JR0582696408",
      "score": 10, "lightCount": 0, "ipLocation": "重庆", "publishTime": 1793049043325, "subCommentCount": 0 }
  ],
  "cursor": { "publishTime": 1793045648078 },
  "commentCount": 3008
} }
```

| Field | Meaning |
|---|---|
| `comments` | Up to 10 top-level comments (no replies). |
| `commentId` | The comment's id; pass it to endpoint 5 for replies. |
| `commentContent` | The text. Codes like `[加油]` are Hupu emotes. |
| `commentUserName` | Who wrote it. |
| `score` | The rating that person gave, 2–10 (0 if none). |
| `lightCount` | Likes. |
| `ipLocation` | The commenter's province (`重庆` = Chongqing). |
| `publishTime` | When it was posted, in ms. |
| `subCommentCount` | Number of replies. |
| `cursor.publishTime` | Pass this as `publishTime` to get the next 10. |
| `commentCount` | Total comments on this entry. |

Keep paging until `comments` is empty. There's no sort by likes: to find the most-liked, page through everything and sort by `lightCount`.

## 4. Most-liked comments (quick)

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/comment/list/primarySingleRow/hottest?outBizType=lol_item&outBizNo=80012&clientCode="
```

| Parameter | Meaning |
|---|---|
| `outBizType=lol_item`, `outBizNo=80012` | Which entry, as in endpoint 3. |
| `clientCode=` | Leave empty. |

```json
{ "data": [ { "commentId": "3022761803", "commentContent": "bin！", "lightCount": 2777, "subCommentCount": 16 } ] }
```

Returns about 26–28 popular comments in one call (not strictly in like order). Fields are the same as endpoint 3.

## 5. Replies to a comment

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/comment/list/primarySingleRow/getMore?outBizType=lol_item&outBizNo=80012&parentCommentId=3022761803&publishTime=0&pageSize=50&clientCode=&cid="
```

| Parameter | Meaning |
|---|---|
| `outBizType=lol_item`, `outBizNo=80012` | The entry the comment belongs to. |
| `parentCommentId=3022761803` | The comment whose replies you want (its `commentId`). |
| `publishTime=0` | Start from the beginning of the thread. |
| `pageSize=50` | Replies per call (max 50). |
| `clientCode=`, `cid=` | Leave empty. |

```json
{ "data": { "comments": [
  { "commentId": "3022689082", "commentContent": "不如shy哥", "parentCommentId": "3022761803",
    "parentCommentUserName": "虎扑JR0055857005", "lightCount": 7 }
] } }
```

| Field | Meaning |
|---|---|
| `commentId`, `commentContent`, `lightCount` | Same as endpoint 3. |
| `parentCommentId` | What this reply answers. If it isn't the comment you asked about, it's a reply to another reply. |
| `parentCommentUserName` | Who it's replying to. |

## 6. Full-match (全场) player scores

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.58/player/v1/lol/getAllPlayerScore?matchId=1693138570756096"
```

| Parameter | Meaning |
|---|---|
| `matchId` | The schedule's `matchId` (not the `outBizNo`). |

```json
{ "data": {
  "scoreCount": 89561,
  "teamScoreInfo": [
    { "teamId": 57, "home": true, "playerInfo": [
      { "playerName": "Viper", "playerScore": 9.2, "playerScoreNum": 14879, "playerLocation": "BOT", "isSubstitution": false }
    ] }
  ]
} }
```

| Field | Meaning |
|---|---|
| `scoreCount` | Total ratings across the match. |
| `teamScoreInfo` | One entry per team. |
| `teamId` | The team (matches `memberId` in the schedule). |
| `home` | Whether it's the team listed first. |
| `playerName` | Player ID. |
| `playerScore` | Their rating for the whole series, 0–10. |
| `playerScoreNum` | How many people rated them. |
| `playerLocation` | Role: `TOP`, `JUN` (jungle), `MID`, `BOT`, `SUP` (support). |
| `isSubstitution` | Whether they're a substitute. |

Players only, no coaches or casters.

## Calling it from JavaScript

```js
const BASE = "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi";

const res = await fetch(`${BASE}/bpl/score_tree/getCurAndSubNodeByBizKey?` + new URLSearchParams({
  outBizType: "lol_bo", outBizNo: "7909", relation: "CHILD", page: 1, pageSize: 100,
}));
const people = (await res.json()).data.pageResult.data.map((x) => x.node);
console.log(people.map((p) => `${p.name}: ${p.scoreAvg}`));
```

The full client this project uses is [`pipeline/hupu.js`](pipeline/hupu.js). Request formats were worked out from [Miaopu](https://github.com/Kindness-Net/Miaopu) and [RiftLog](https://github.com/Ayoa5/RiftLog).
