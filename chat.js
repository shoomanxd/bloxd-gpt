// api/chat.js — Vercel Serverless Function
// Bloxd.io Coding Assistant — supports Grok (xAI) and Mistral AI

const GITHUB_RAW = "https://raw.githubusercontent.com/Bloxdy/code-api/main";
const GITHUB_API = "https://api.github.com/repos/Bloxdy/code-api/contents";

const DOC_FILES = [
  "README.md",
  "API_REFERENCE.md",
  "CLIENT_OPTIONS.md",
  "CALLBACKS.md",
  "ENTITY_SETTINGS.md",
  "MOB_SETTINGS.md",
  "ENTITY_MESHES.md",
  "LOBBY_LEADERBOARD.md",
];

// Cache docs for 10 minutes per serverless instance
let docsCache = null;
let docsCacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000;

async function fetchDocs() {
  const now = Date.now();
  if (docsCache && now - docsCacheTime < CACHE_TTL) return docsCache;

  const results = await Promise.allSettled(
    DOC_FILES.map((file) =>
      fetch(`${GITHUB_RAW}/${file}`)
        .then((r) => (r.ok ? r.text() : null))
        .then((text) => (text ? `\n\n## ${file}\n${text}` : ""))
        .catch(() => "")
    )
  );

  const combined = results
    .map((r) => (r.status === "fulfilled" ? r.value : ""))
    .join("");

  docsCache = combined || "Documentation temporarily unavailable.";
  docsCacheTime = now;
  return docsCache;
}

const SYSTEM_PROMPT = (docs) => `You are BloxdBot, an expert AI assistant for Bloxd.io scripting and coding. You help developers write, debug, and understand Bloxd.io JavaScript code for custom game worlds.

CRITICAL RULES:
1. ONLY answer questions about Bloxd.io coding using the official API documentation below.
2. NEVER invent new callbacks, API methods, or features that are not in the docs.
3. NEVER suggest using callbacks inside Code Blocks (only World Code supports callbacks).
4. Always use the EXACT method names and signatures from the docs.
5. If something isn't in the docs, say so clearly instead of guessing.
6. Be interactive, helpful, and enthusiastic about Bloxd.io development!
7. Format code examples cleanly using JavaScript.
8. Reference the official docs: https://bloxd.io/docs and https://github.com/Bloxdy/code-api

KEY BLOXD FACTS YOU MUST KNOW:
- Use /* comment */ NOT // comment (single-line comments don't work in Bloxd)
- myId, playerId, thisPos, ownerDbId are pre-defined on the api object
- api.log() and console.log() do the same thing
- Date.now() and api.now() both return milliseconds
- World Code runs once on lobby creation and supports ALL callbacks
- Code Blocks run when clicked/triggered, CANNOT use callbacks, 16,000 char limit
- Both World Code and Code Blocks have their own scope; use globalThis to share state

--- OFFICIAL BLOXD.IO API DOCUMENTATION (fetched live from GitHub) ---
${docs}
--- END OF DOCUMENTATION ---

When answering:
- Be concise but thorough
- Show working code examples when relevant
- Warn about common pitfalls (like the // comment issue)
- Reference which doc file the info comes from when helpful`;

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
      max_tokens: 2048,
      temperature: 0.3,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Grok API error ${response.status}: ${err}`);
  }

  const data = await response.json();
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
      max_tokens: 2048,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Mistral API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, mode, apiKey } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }
    if (!mode || !["grok", "mistral"].includes(mode)) {
      return res.status(400).json({ error: "mode must be 'grok' or 'mistral'" });
    }
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
      return res.status(400).json({ error: "Valid API key required" });
    }

    const docs = await fetchDocs();
    const systemPrompt = SYSTEM_PROMPT(docs);

    let reply;
    if (mode === "grok") {
      reply = await callGrok(apiKey.trim(), messages, systemPrompt);
    } else {
      reply = await callMistral(apiKey.trim(), messages, systemPrompt);
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Chat error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
