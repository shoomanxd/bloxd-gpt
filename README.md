# 🧊 BloxdBot — AI Coding Assistant for Bloxd.io

A beautiful, interactive AI chatbot for Bloxd.io scripting — deployed on Vercel. Supports **Grok (xAI)** and **Mistral AI** as backend models, fetches live docs from the official GitHub repo.

---

## ✨ Features

- 🔄 **Live GitHub docs** — Fetches the latest API reference from `Bloxdy/code-api` on every session
- 🤖 **Dual AI mode** — Switch between Grok (xAI) and Mistral AI with one click
- 🧠 **Bloxd-aware system prompt** — Never invents callbacks, always uses real API methods
- ⚡ **Quick Prompts sidebar** — One-click common questions
- 💬 **Full markdown + syntax highlighting** — Gorgeous code blocks with copy button
- 🔒 **API keys stored in sessionStorage only** — Never sent to any third party except the AI provider
- 📱 **Responsive** — Works on mobile too

---

## 🚀 Deploy to Vercel

### 1. Clone / Download this project

```bash
# If using git
git init
git add .
git commit -m "BloxdBot init"
```

### 2. Install Vercel CLI (optional, for local dev)

```bash
npm install -g vercel
```

### 3. Deploy

```bash
vercel
# Follow the prompts — select your account, new project
```

Or push to GitHub and connect the repo at **vercel.com/new**.

### 4. That's it!

No environment variables needed — users paste their own API keys in the UI.

---

## 🔑 API Keys

Users need their own API key to use the chatbot:

| Mode | Provider | Get Key |
|------|----------|---------|
| **Grok** | xAI | [console.x.ai](https://console.x.ai) |
| **Mistral** | Mistral AI | [console.mistral.ai](https://console.mistral.ai) |

Keys are **never stored server-side** — they're kept in the browser's sessionStorage and sent directly to the AI provider via your serverless function.

---

## 📁 Project Structure

```
bloxdbot/
├── api/
│   └── chat.js          # Vercel serverless function — handles Grok + Mistral
├── public/
│   └── index.html       # Full frontend — chat UI, sidebar, mode switching
├── vercel.json          # Routing config
├── package.json
└── README.md
```

---

## 🔧 How It Works

1. **Frontend** (`public/index.html`) — Pure HTML/CSS/JS, no build step needed
2. **API route** (`api/chat.js`) — Serverless function that:
   - Fetches the latest Bloxd.io API docs from GitHub (cached 10 min)
   - Builds a strict system prompt with the live docs
   - Forwards to either Grok or Mistral based on user's mode selection
3. **Docs cache** — Fetches these files from `Bloxdy/code-api` on GitHub:
   - `README.md`, `API_REFERENCE.md`, `CLIENT_OPTIONS.md`, `CALLBACKS.md`
   - `ENTITY_SETTINGS.md`, `MOB_SETTINGS.md`, `ENTITY_MESHES.md`, `LOBBY_LEADERBOARD.md`

---

## ⚙️ Customization

### Change cached doc files
Edit `DOC_FILES` in `api/chat.js` to add/remove files from the GitHub repo.

### Change AI model
In `api/chat.js`:
- Grok: change `"grok-3-mini"` to any xAI model
- Mistral: change `"mistral-small-latest"` to any Mistral model

### Add more quick prompts
Edit the sidebar buttons in `public/index.html`.

---

## ⚠️ Bloxd.io Coding Rules (enforced by the bot)

The bot is trained on these critical rules:
- Use `/* comment */` NOT `// comment` (single-line comments break in Bloxd)
- Never declare callbacks inside Code Blocks (World Code only)
- Never invent API methods not in the official docs
- `myId`, `playerId`, `thisPos`, `ownerDbId` are pre-defined
- Both `api.log()` and `console.log()` work
- Use `globalThis.varName` to share state between code blocks
