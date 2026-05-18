// api/chat.js — Vercel Serverless Function (CommonJS)

const GITHUB_RAW = "https://raw.githubusercontent.com/Bloxdy/code-api/main";

const DOC_FILES = [
  "README.md",
  "API_REFERENCE.md",
  "CLIENT_OPTIONS.md",
  "CALLBACKS.md",
];

let docsCache = null;
let docsCacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000;

async function fetchDocs() {
  const now = Date.now();
  if (docsCache && now - docsCacheTime < CACHE_TTL) return docsCache;

  const results = await Promise.allSettled(
    DOC_FILES.map((file) =>
      fetch(`${GITHUB_RAW}/${file}`)
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => "")
    )
  );

  const combined = results
    .map((r, i) => (r.status === "fulfilled" && r.value ? `## ${DOC_FILES[i]}\n${r.value}` : ""))
    .filter(Boolean)
    .join("\n\n");

  docsCache = (combined || "Docs unavailable.").slice(0, 12000);
  docsCacheTime = now;
  return docsCache;
}

async function callGrok(apiKey, messages, systemPrompt) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-mini",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
    throw new Error(`Grok error ${response.status}: ${msg}`);
  }
  const data = JSON.parse(text);
  return data.choices[0].message.content;
}

async function callMistral(apiKey, messages, systemPrompt) {
  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 1024,
      temperature: 0.3,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text)?.message || JSON.parse(text)?.error?.message || msg; } catch {}
    throw new Error(`Mistral error ${response.status}: ${msg}`);
  }
  const data = JSON.parse(text);
  return data.choices[0].message.content;
}

module.exports = async function handler(req, res) {
  // Always JSON, never HTML
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).json({ ok: true });

  // GET = health check so you can test the route is alive
  if (req.method === "GET") {
    return res.status(200).json({ status: "BloxdBot API is running ✅" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "Request body missing or not JSON" });
    }

    const { messages, mode, apiKey } = body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }
    if (!mode || !["grok", "mistral"].includes(mode)) {
      return res.status(400).json({ error: "mode must be 'grok' or 'mistral'" });
    }
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
      return res.status(400).json({ error: "Valid API key required" });
    }

    const docs = await fetchDocs();
    const systemPrompt = `You are BloxdBot, an expert Bloxd.io coding assistant.

RULES:
- Only answer Bloxd.io coding questions using the docs below
- NEVER invent API methods or callbacks not in the docs
- NEVER use callbacks inside Code Blocks (World Code only)
- Use /* comment */ not // comment
- myId, playerId, thisPos, ownerDbId are pre-defined
- api.log() = console.log()
- globalThis.x to share vars between blocks
- Code Blocks: no callbacks, 16000 char limit
- World Code: runs once, supports all callbacks

DOCS:
${docs}`;

    let reply;
    if (mode === "grok") {
      reply = await callGrok(apiKey.trim(), messages, systemPrompt);
    } else {
      reply = await callMistral(apiKey.trim(), messages, systemPrompt);
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("Handler error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
