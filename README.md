# Hupu LoL Ratings

After every pro League of Legends game, tens of thousands of Chinese fans on [Hupu](https://www.hupu.com/) (虎扑) rate each player, coach, caster and ban from 1 to 5 stars and leave comments. This site shows those ratings with the comments translated into English, plus notes on the slang.

Translation runs offline on a local Qwen model through [Ollama](https://ollama.com/), so it costs nothing per comment. A free [OpenRouter](https://openrouter.ai/) model is the fallback.

## How it works

```
Hupu schedule ──> each finished match ──> each game ──> every rated entry ──> top comments
                     pipeline/fetch.js writes site/data/*.json

site/data/*.json ──> Qwen via Ollama (or OpenRouter) ──> English + slang notes, written back in place
                     pipeline/translate.js, resumable: only untranslated comments are sent

git push ──> GitHub Actions ──> wrangler deploy ──> Cloudflare Workers (static assets)
```

The site in `site/` is plain HTML, CSS and JavaScript with no build step.

## Run it

Needs Node 20+.

```bash
# 1. Pull ratings and comments (finished matches; refreshes the last 3 days)
npm run fetch                                   # every event
node pipeline/fetch.js --event=全球总决赛         # only Worlds
node pipeline/fetch.js --limit=5 --pages=3      # 5 matches, plus 30 newest comments per entry

# 2. Translate with local Qwen (install Ollama, then: ollama pull qwen3.5:9b)
npm run translate

#    or with a free OpenRouter model (50 requests a day on a free account)
OPENROUTER_API_KEY=... node pipeline/translate.js --backend=openrouter

# 3. Preview at http://localhost:8787
npm run dev
```

Both steps are safe to stop and rerun; finished translations are kept.

## Deploy

Pushing changes under `site/` to `main` deploys to Cloudflare through `.github/workflows/deploy.yml`. It needs two repository secrets:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token from the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID`: shown in the Cloudflare dashboard sidebar

To use your own domain, add it under the Worker's Settings → Domains & Routes in Cloudflare.

## Data

All data comes from Hupu's public, read-only endpoints; nothing logs in or posts. Scores are Hupu's 0–10 scale (a 5-star vote counts as 10). Comment locations are the commenter's province as Hupu shows it.
