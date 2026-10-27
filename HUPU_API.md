# Hupu LoL ratings API

These are the endpoints this project reads from. Hupu (虎扑) does not publish an API: they are the unofficial JSON endpoints its own app and mobile site call. They need no login or key, return JSON, and can change without notice. Everything here was tested on 2026-10-27.

The request format was worked out from two open-source projects, [Miaopu](https://github.com/Kindness-Net/Miaopu) (`HupuAdapter.kt`) and [RiftLog](https://github.com/Ayoa5/RiftLog), and confirmed by calling the endpoints. The client in this repo is [`pipeline/hupu.js`](pipeline/hupu.js).

## How the data fits together

```
schedule (match-api.hupu.com)
 └─ match ── scoreItemKey { outBizType: "lol_match", outBizNo }
     └─ rating tree (games.mobileapi.hupu.com)
         └─ lol_match ──children──> lol_bo (one per game: 第1局, 第2局…)
                                     └──children──> lol_item (each player, coach, caster, co-streamer, and each team's bans)
                                                     ├─ comments (paged, newest first)
                                                     ├─ hottest comments (~26 most liked)
                                                     └─ replies to one comment
match ── matchId ──> full-match (全场) player scores
```

Every rated thing is addressed by a pair: `outBizType` (`lol_match`, `lol_bo`, `lol_item`) and `outBizNo` (its id).

## Common details

- **Hosts:** `match-api.hupu.com` (schedule) and `games.mobileapi.hupu.com` (ratings and comments).
- **Version in the path:** URLs carry an app version (`/1/8.2.99/`, `/1/8.2.58/`, `/1/8.2.10/`). These are the versions that work; others may too.
- **Headers:** a normal `User-Agent` is enough here. RiftLog reports that Hupu's web pages (not these JSON endpoints) return a different structure to desktop browsers, so a mobile UA is the safe choice.
- **Response wrapper:** ratings and comments return `{ code, msg, data, success }` with `code: 1` on success; the schedule returns `{ result, success }`.
- **Scores** are on a 0–10 scale: one star is 2, five stars is 10.
- **Be polite:** this project waits 300 ms between requests and retries with backoff.

## 1. Schedule

`GET https://match-api.hupu.com/1/8.2.10/matchallapi/bff/standard/getScheduleListByTagForH5`

| Parameter | Value |
|---|---|
| `businessType` | `common` |
| `businessId` | `lol` (other esports: `kog`, `cs2`, `val`) |
| `datasource` | `navigation` |

Returns roughly two months of matches nested by day. Each match object has:

| Field | Meaning |
|---|---|
| `matchId` | Match id, also used for the full-match scores (endpoint 6) |
| `matchIntroduction` / `matchName` | Event and stage in Chinese, e.g. `全球总决赛瑞士轮` (Worlds Swiss stage) |
| `matchStartTimeStamp` | Start time in ms |
| `matchStatus` | `NOTSTARTED`, `INPROGRESS` or `COMPLETED` |
| `againstInfo.memberInfos[]` | The two teams: `memberId`, `memberName`, `memberLogo`, `memberBaseScore` (games won) |
| `againstInfo.winnerMemberId` | Winning team id |
| `scoreCountText` | Rater count as text, e.g. `6.3万人评分` (万 = 10,000) |
| `scoreItemKey` | `{ outBizType: "lol_match", outBizNo }`, the entry point into the rating tree |

## 2. Rating tree (children of a node)

`GET https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/score_tree/getCurAndSubNodeByBizKey`

| Parameter | Value |
|---|---|
| `outBizType`, `outBizNo` | The node to expand |
| `relation` | `CHILD` |
| `page`, `pageSize` | `1`, `100` |

Called on a `lol_match` it returns the games (`lol_bo`); called on a game it returns everything rated in it (`lol_item`). Children are in `data.pageResult.data[].node`:

| Field | Meaning |
|---|---|
| `bizType`, `bizId` | This child's `outBizType` / `outBizNo` |
| `name` | Display name (player ID, `教练 X` coach, `解说：X` caster, `二路：X` co-stream, or a ban list like `蔚/奇亚娜/…`) |
| `scoreAvg` | Average score, 0–10 |
| `scorePersonCount` | Number of ratings |
| `commentCount` | Number of comments |
| `scoreDistribution` | Votes per score: `{ "2": n, "4": n, "6": n, "8": n, "10": n }` |
| `image[0]` | Photo |
| `infoJson.type[0]` | `player`, `bpHero` (a ban list), or other roles |
| `infoJson.teamId[0]` | The player's team (matches `memberId` in the schedule) |
| `infoJson.killCount[0]`, `infoJson.deathCount[0]` | Kills and deaths in that game |
| `infoJson.auxiliaryPic[0]` | The champion played (image) |

There is no separate full-match node: a `lol_match`'s children are only its games.

## 3. Comments, newest first

`GET https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/comment/list/primarySingleRow`

| Parameter | Value |
|---|---|
| `outBizType`, `outBizNo` | Usually a `lol_item` |
| `order` | `desc` (newest first) or `asc` |
| `publishTime` | Cursor in ms: start with the current time, then use `data.cursor.publishTime` from the previous page |
| `clientCode`, `cid` | Empty strings |

Returns 10 top-level comments per page in `data.comments[]` (replies are not included), plus `data.cursor`, `data.commentCount` and `data.hasMore`. **Keep paging until a page comes back empty**; `hasMore` was not reliable in testing. There is no "sort by likes" order, so to get the most-liked comments this project pages through all of them and sorts by `lightCount`.

Each comment:

| Field | Meaning |
|---|---|
| `commentId` | Comment id |
| `commentContent` | Text; Hupu emotes appear as codes like `[捂脸]` or `[虎扑表情-这就叫专业]` |
| `commentUserName` | Username |
| `score` | The commenter's own rating, 2–10 (0 or missing if none) |
| `lightCount` | Likes ("lights" on Hupu) |
| `ipLocation` | Province, in Chinese (e.g. `广东`); places outside China appear by their own name |
| `publishTime` | Time in ms |
| `subCommentCount` | Number of replies |
| `parentCommentId`, `parentCommentUserName` | For replies, who they answer |

## 4. Hottest comments

`GET https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/comment/list/primarySingleRow/hottest`

Parameters: `outBizType`, `outBizNo`, `clientCode` (empty). Returns about 26 of the most-liked comments, not strictly in like order, with the same fields as endpoint 3. Fine for a quick look; it stops short of a full top 30.

## 5. Replies to a comment

`GET https://games.mobileapi.hupu.com/1/8.2.99/bplcommentapi/bpl/comment/list/primarySingleRow/getMore`

| Parameter | Value |
|---|---|
| `outBizType`, `outBizNo` | The rated item the comment belongs to |
| `parentCommentId` | The top-level comment's id |
| `publishTime` | `0` for the first page |
| `pageSize` | Up to `50` |
| `clientCode`, `cid` | Empty strings |

Returns the whole thread in `data.comments[]`, including replies to replies. A reply whose `parentCommentId` is not the top-level comment's id is answering another reply; `parentCommentUserName` says whom.

## 6. Full-match (全场) player scores

`GET https://games.mobileapi.hupu.com/1/8.2.58/player/v1/lol/getAllPlayerScore?matchId=<matchId>`

Hupu's own rating of each player over the whole series, the number its app shows on the 全场 tab. `data.teamScoreInfo[]` has one entry per team (`teamId`, `home`) with `playerInfo[]`:

| Field | Meaning |
|---|---|
| `playerName` | Player ID |
| `playerScore` | Full-match score, 0–10 |
| `playerScoreNum` | Number of ratings |
| `playerLocation` | Role: `TOP`, `JUN`, `MID`, `BOT`, `SUP` |
| `isSubstitution` | Whether the player is a sub |

It covers players only, not coaches or casters, and the comments for a full match live under its individual games: Hupu has no separate full-match comment section.

## Links back to Hupu

These mobile web pages open in any browser and match the API ids:

- Match: `https://m.hupu.com/score-list/lol_match/<outBizNo>`
- Game: `https://m.hupu.com/score-list/lol_bo/<bizId>`
- Player, coach or caster: `https://m.hupu.com/score-item/lol_item/<bizId>`

Images on Hupu's CDN (`hoopchina.com.cn`) load in normal browsers but return 403 to headless Chrome's default user agent.
