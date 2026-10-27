# Hupu LoL ratings API

Six endpoints, called in this order: schedule → match → game → rated person → comments. No login or key is needed.

## Terms

| Term | Meaning |
|---|---|
| `outBizType` / `outBizNo` | Every rated thing is addressed by a type and an id. You pass both to most endpoints. |
| `lol_match` | A whole series, e.g. BLG vs KC. |
| `lol_bo` | One game inside a series ("bo" as in best-of). Named `第1局` = Game 1, `第2局` = Game 2. |
| `lol_item` | One rated entry inside a game: a player, coach (`教练`), caster (`解说`), co-streamer (`二路`) or a team's bans. |
| `bpHero` | The `infoJson.type` of an entry that is a team's ban list rather than a person. |
| `matchId` | The schedule's id for a match, used only by the full-match scores endpoint. |
| `publishTime` | Paging cursor for comments, a time in milliseconds. |
| `lightCount` | Likes ("lights" on Hupu). |
| score | 0–10 scale: one star = 2, five stars = 10. |

## 1. Schedule

```bash
curl "https://match-api.hupu.com/1/8.2.10/matchallapi/bff/standard/getScheduleListByTagForH5?businessType=common&businessId=lol&datasource=navigation"
```

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

- `scoreItemKey` is what you pass to endpoint 2.
- `memberBaseScore` is games won; `scoreCountText` is the rater count (万 = 10,000).
- `matchStatus` is `NOTSTARTED`, `INPROGRESS` or `COMPLETED`.

## 2. Games in a match, or entries in a game

Same endpoint for both levels. Pass a `lol_match` to get its games:

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/score_tree/getCurAndSubNodeByBizKey?outBizType=lol_match&outBizNo=4608&relation=CHILD&page=1&pageSize=100"
```

```json
{ "data": { "pageResult": { "data": [
  { "node": { "bizType": "lol_bo", "bizId": "7909", "name": "第1局" } }
] } } }
```

Pass a `lol_bo` to get everyone rated in that game:

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/score_tree/getCurAndSubNodeByBizKey?outBizType=lol_bo&outBizNo=7909&relation=CHILD&page=1&pageSize=100"
```

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

- `bizType` + `bizId` are the next call's `outBizType` + `outBizNo`.
- `scoreDistribution` is votes per score (2 = one star … 10 = five stars).
- `teamId` matches `memberId` from the schedule.

## 3. Comments, newest first

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/comment/list/primarySingleRow?outBizType=lol_item&outBizNo=80012&order=desc&publishTime=1793050000000&clientCode=&cid="
```

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

- Returns 10 comments per call. For the next page, call again with `publishTime` = `cursor.publishTime`. Start with the current time.
- Stop when `comments` comes back empty (don't rely on `hasMore`).
- There is no sort by likes. To get the most-liked, page through all of them and sort by `lightCount`.
- `score` is the commenter's own rating; `ipLocation` is their province.

## 4. Most-liked comments (quick)

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/comment/list/primarySingleRow/hottest?outBizType=lol_item&outBizNo=80012&clientCode="
```

Returns about 26–28 popular comments in one call, same fields as endpoint 3:

```json
{ "data": [ { "commentId": "3022761803", "commentContent": "bin！", "lightCount": 2777, "subCommentCount": 16 } ] }
```

## 5. Replies to a comment

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/comment/list/primarySingleRow/getMore?outBizType=lol_item&outBizNo=80012&parentCommentId=3022761803&publishTime=0&pageSize=50&clientCode=&cid="
```

```json
{ "data": { "comments": [
  { "commentId": "3022689082", "commentContent": "不如shy哥", "parentCommentId": "3022761803",
    "parentCommentUserName": "虎扑JR0055857005", "lightCount": 7 }
] } }
```

- `pageSize` up to 50.
- If `parentCommentId` isn't the comment you asked about, that reply answers another reply; `parentCommentUserName` says whom.

## 6. Full-match (全场) player scores

```bash
curl "https://games.mobileapi.hupu.com/1/8.2.58/player/v1/lol/getAllPlayerScore?matchId=1693138570756096"
```

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

- Takes the schedule's `matchId`, not `outBizNo`.
- One score per player for the whole series; `playerLocation` is `TOP`, `JUN`, `MID`, `BOT` or `SUP`.
- Players only, no coaches or casters. Comments only exist per game (endpoint 3).

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
