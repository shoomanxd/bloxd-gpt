// api/chat.js — Vercel Serverless Function
// Bloxd.io Coding Assistant — supports Grok (xAI) and Mistral AI

const GITHUB_RAW = "https://raw.githubusercontent.com/Bloxdy/code-api/main";

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

const SYSTEM_PROMPT = (docs) => `You are BloxdBot, an expert AI assistant for Bloxd.io scripting and coding.

CRITICAL RULES:
1. ONLY answer questions about Bloxd.io coding using the official API documentation below.
2. NEVER invent new callbacks, API methods, or features not in the docs.
3. NEVER suggest using callbacks inside Code Blocks (only World Code supports callbacks).
4. Always use EXACT method names and signatures from the docs.
5. If something is not in the docs, say so clearly.
6. Be interactive, helpful, and enthusiastic!
7. Format code examples cleanly using JavaScript.

KEY BLOXD FACTS:
- Use /* comment */ NOT // comment (single-line comments do not work in Bloxd)
- myId, playerId, thisPos, ownerDbId are pre-defined
- api.log() and console.log() both work
- World Code supports ALL callbacks; Code Blocks do NOT support callbacks
- Use globalThis.varName to share state between code blocks

--- BLOXD.IO API DOCS ---
${docs.slice(0, 12000)}
--- END DOCS ---`;

async function callGrok(apiKey, messages, systemPrompt) {
  let response;
  try {
    response = await fetch("https://api.x.ai/v1/chat/completions", {
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
  } catch (fetchErr) {
    throw new Error(`Grok network error: ${fetchErr.message}`);
  }

  const rawText = await response.text();

  if (!response.ok) {
    try {
      const errJson = JSON.parse(rawText);
      const msg = errJson?.error?.message || errJson?.message || rawText.slice(0, 300);
      throw new Error(`Grok ${response.status}: ${msg}`);
    } catch (e) {
      if (e.message.startsWith("Grok")) throw e;
      throw new Error(`Grok ${response.status}: ${rawText.slice(0, 300)}`);
    }
  }

  try {
    const data = JSON.parse(rawText);
    return data.choices[0].message.content;
  } catch {
    throw new Error(`Grok returned unexpected response: ${rawText.slice(0, 200)}`);
  }
}

async function callMistral(apiKey, messages, systemPrompt) {
  let response;
  try {
    response = await fetch("https://api.mistral.ai/v1/chat/completions", {
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
  } catch (fetchErr) {
    throw new Error(`Mistral network error: ${fetchErr.message}`);
  }

  const rawText = await response.text();

  if (!response.ok) {
    try {
      const errJson = JSON.parse(rawText);
      const msg = errJson?.message || errJson?.error?.message || rawText.slice(0, 300);
      throw new Error(`Mistral ${response.status}: ${msg}`);
    } catch (e) {
      if (e.message.startsWith("Mistral")) throw e;
      throw new Error(`Mistral ${response.status}: ${rawText.slice(0, 300)}`);
    }
  }

  try {
    const data = JSON.parse(rawText);
    return data.choices[0].message.content;
  } catch {
    throw new Error(`Mistral returned unexpected response: ${rawText.slice(0, 200)}`);
  }
}

module.exports = async function handler(req, res) {
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
};
