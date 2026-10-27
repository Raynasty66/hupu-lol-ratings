# Hupu LoL Ratings

**Live at [lol-hupu-ratings.com](https://lol-hupu-ratings.com)**

After every pro League of Legends game, tens of thousands of Chinese fans on [Hupu](https://www.hupu.com/) (虎扑) rate each player, coach, caster and ban from 1 to 5 stars and leave comments. This site shows those ratings per game and for the full match, with each entry's 30 most-liked comments and their replies translated into English, plus notes on the slang.

## How it works

```
Hupu schedule ──> each finished match ──> each game ──> every rated entry
   ──> all its comments ranked by likes ──> top 30, each with up to 10 replies
   ──> Hupu's full-match (全场) score per player
                     pipeline/fetch.js writes site/data/*.json

Gemini Flash-Lite translates in 50-comment batches across parallel lanes (two models × two API keys)
   with glossaries for champions, champion and player nicknames, team names and esports terms
                     pipeline/translate.js

Groq (Qwen 3.8 / gpt-oss) reviews finished translations; rejected ones are cleared and translated again
                     pipeline/translate.js --check

GitHub Actions, daily: fetch ──> translate ──> check ──> retranslate rejects ──> commit ──> deploy to Cloudflare Workers
```

The site in `site/` is plain HTML, CSS and JavaScript with no build step.

## Run it locally

Needs Node 20+ and free API keys from [Google AI Studio](https://aistudio.google.com/apikey) and [Groq](https://console.groq.com/keys) in a `.env` file. A second Gemini key from another Google project doubles the free daily quota.

```
GEMINI_API_KEY=...
GEMINI_API_KEY_2=...
GROQ_API_KEY=...
```

```bash
node pipeline/fetch.js --event=全球总决赛       # Worlds only; omit --event for every event
node pipeline/fetch.js --reindex               # refresh MVP/LVP and full-match scores without refetching
node pipeline/translate.js                     # translate everything pending until the free quotas run out
node pipeline/translate.js --check             # review finished translations with Groq
npm run dev                                    # preview at http://localhost:8787
```

All steps can be stopped and rerun; finished work is kept.

## Glossaries

Names are where a general model goes wrong, so every prompt gets the entries that appear in its batch:

| File | Contents | Built by |
|---|---|---|
| Riot Data Dragon (fetched live) | Official Chinese and English champion names | `pipeline/champions.js` |
| `pipeline/champion-nicknames.json` | Fan names for champions (蝎子 = Skarner, 奥巴马 = Lucian) | `build-champion-nicknames.js` |
| `pipeline/nicknames.json` | Player nicknames and real names (圣枪哥 = Flandre) | `build-nicknames.js`, `--prune` to drop ones fans use for someone else |
| `pipeline/team-nicknames.json` | Team names (滔搏 = TES, 液体 = Team Liquid) | `build-team-nicknames.js` |
| `pipeline/terms.json` | Esports terms that get a note (VCTCN, 外卡, 一轮游) | edited by hand |

Each builder has Gemini propose entries and Groq confirm them; only entries both agree on are kept.

## Deploy

`.github/workflows/update.yml` runs the whole pipeline daily on GitHub's machines and deploys. `.github/workflows/deploy.yml` redeploys when site code changes. Repository secrets:

- `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GROQ_API_KEY`
- `CLOUDFLARE_API_TOKEN` (from the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`

## Data

All data comes from Hupu's public, read-only endpoints; nothing logs in or posts. Scores are Hupu's 0–10 scale (a 5-star vote counts as 10). MVP and LVP are the highest- and lowest-rated players by Hupu's full-match score, among players with at least 50 votes.
