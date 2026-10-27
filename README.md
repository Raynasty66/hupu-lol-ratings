# Hupu LoL Ratings

After every pro League of Legends game, tens of thousands of Chinese fans on [Hupu](https://www.hupu.com/) (虎扑) rate each player, coach, caster and ban from 1 to 5 stars and leave comments. This site shows those ratings with the most-liked comments and their replies translated into English, plus notes on the slang.

Every translation is checked by a second, different model before it appears in English. Anything that hasn't passed yet stays in Chinese.

## How it works

```
Hupu schedule ──> each finished match ──> each game ──> every rated entry
   ──> all its comments, ranked by likes ──> top 30 + up to 10 replies each
                     pipeline/fetch.js writes site/data/*.json

Gemini Flash-Lite translates ──> Groq (Qwen 3.8 / gpt-oss) checks ──> rejected ones are retranslated once and checked again
   names come from Riot's champion list and a nickname list (pipeline/nicknames.json)
                     pipeline/translate.js, most-liked comments first, stops cleanly when free quotas run out

GitHub Actions, daily: fetch ──> translate ──> commit ──> deploy to Cloudflare Workers
```

The site in `site/` is plain HTML, CSS and JavaScript with no build step.

## Run it locally

Needs Node 20+ and free API keys from [Google AI Studio](https://aistudio.google.com/apikey) and [Groq](https://console.groq.com/keys) in a `.env` file:

```
GEMINI_API_KEY=...
GROQ_API_KEY=...
```

```bash
node pipeline/fetch.js --event=全球总决赛     # Worlds only; omit --event for every event
node pipeline/translate.js                  # translate and check until the daily quotas run out
node pipeline/build-nicknames.js            # propose + cross-check nicknames for new players
node pipeline/build-nicknames.js --prune    # drop nicknames fans don't actually use for that player
npm run dev                                 # preview at http://localhost:8787
```

`translate.js` also takes `--translator=ollama` to translate on a local [Ollama](https://ollama.com/) model, or `--translator=openrouter` for a free OpenRouter model.

All steps can be stopped and rerun; finished work is kept.

## Deploy

`.github/workflows/update.yml` runs the whole pipeline daily on GitHub's machines and deploys. `.github/workflows/deploy.yml` redeploys when site code changes. Repository secrets:

- `GEMINI_API_KEY`, `GROQ_API_KEY`
- `CLOUDFLARE_API_TOKEN` (from the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`

## Free-tier limits

Gemini's full Flash models allow only 20 free requests a day, so Flash-Lite does the translating. Groq allows about 200,000 tokens a day per model, which caps checking at roughly 2,000 comments a day. The most-liked comments are done first.

## Data

All data comes from Hupu's public, read-only endpoints; nothing logs in or posts. Scores are Hupu's 0–10 scale (a 5-star vote counts as 10).
