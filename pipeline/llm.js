// One chat interface over the free backends: Gemini, Groq, OpenRouter and local Ollama.
import { readFileSync, existsSync } from "node:fs";

const ENV = new URL("../.env", import.meta.url);
if (existsSync(ENV)) {
  for (const line of readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const BACKENDS = {
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    // Full Flash models allow only 20 free requests a day, so Flash-Lite does the volume.
    key: "GEMINI_API_KEY", model: process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest,gemini-3.1-flash-lite", rpm: 10,
  },
  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: "GROQ_API_KEY", model: process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b,openai/gpt-oss-120b", rpm: 20, tpm: 7000,
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: "OPENROUTER_API_KEY", model: process.env.OPENROUTER_MODEL ?? "google/gemma-4-31b-it:free", rpm: 18,
  },
  ollama: {
    url: `${process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434"}/v1/chat/completions`,
    key: null, model: process.env.OLLAMA_MODEL ?? "qwen3.5:9b", rpm: 1000,
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class QuotaError extends Error {}

export function backend(name) {
  const b = BACKENDS[name];
  if (!b) throw new Error(`unknown backend ${name}`);
  if (b.key && !process.env[b.key]) throw new Error(`${b.key} is not set (put it in .env)`);
  let last = 0;
  const window = [];
  // Comma-separated models are fallbacks: free quotas are per model, and one may be overloaded.
  const models = b.model.split(",").map((s) => s.trim());
  return {
    name,
    get model() {
      return models[0];
    },
    async chat(prompt) {
      for (let tries = models.length; ; tries--) {
        try {
          return await this.once(prompt);
        } catch (err) {
          if (!(err instanceof QuotaError || err.overloaded || err.gone) || models.length < 2 || tries <= 1) throw err;
          const why = err.gone ? "not available" : err.overloaded ? "overloaded" : "out of daily quota";
          console.warn(`    ${name}: ${models[0]} ${why}, switching to ${models[1]}`);
          models.push(models.shift());
          if (err instanceof QuotaError || err.gone) models.pop();
        }
      }
    },
    async once(prompt) {
      // Spaces requests by the free tier's per-minute limits on requests and, for Groq, tokens.
      const tokens = Math.ceil(prompt.length / 1.5) + 1500;
      for (;;) {
        const now = Date.now();
        while (window.length && now - window[0].t > 60000) window.shift();
        const used = window.reduce((s, w) => s + w.tokens, 0);
        const wait = Math.max(last + 60000 / b.rpm - now, b.tpm && used + tokens > b.tpm ? window[0].t + 60000 - now : 0);
        if (wait <= 0) break;
        await sleep(wait);
      }
      last = Date.now();
      window.push({ t: last, tokens });
      for (let attempt = 1; ; attempt++) {
        const res = await fetch(b.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(b.key && { Authorization: `Bearer ${process.env[b.key]}` }) },
          body: JSON.stringify({
            model: models[0], temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (res.ok) {
          const body = await res.json();
          return body.choices?.[0]?.message?.content ?? "";
        }
        const text = await res.text();
        if (res.status === 429 && /day|daily|RPD|TPD|quota/i.test(text) && !/minute/i.test(text)) {
          throw new QuotaError(`${name} daily quota used up`);
        }
        if ((res.status === 429 || res.status >= 500) && attempt < 4) {
          const retry = Number(res.headers.get("retry-after")) || 10 * attempt;
          await sleep(retry * 1000);
          continue;
        }
        throw Object.assign(new Error(`${name} ${res.status}: ${text.slice(0, 300)}`), { overloaded: res.status === 503 || res.status === 429, gone: res.status === 404 });
      }
    },
  };
}

// Takes the first complete JSON object, ignoring code fences or chatter around it; returns {} if there is none.
export function parseJson(text) {
  const start = text.indexOf("{");
  if (start < 0) return {};
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return {};
      }
    }
  }
  return {};
}
