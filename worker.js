// Serves the site, and every 15 minutes starts the GitHub check for finished games (GitHub's own timer runs hours late).
export default {
  fetch: (request, env) => env.ASSETS.fetch(request),
  async scheduled(event, env) {
    if (!env.GITHUB_TOKEN) return;
    const res = await fetch("https://api.github.com/repos/Raynasty66/hupu-lol-ratings/actions/workflows/plan.yml/dispatches", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "hupu-lol-ratings" },
      body: JSON.stringify({ ref: "main" }),
    });
    if (!res.ok) throw new Error(`GitHub dispatch failed: HTTP ${res.status} ${await res.text()}`);
  },
};
