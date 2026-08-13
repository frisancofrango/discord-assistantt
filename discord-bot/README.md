# Azure Discord Bot

Azure is a production-oriented Discord server operating system with a PostgreSQL source of truth, Redis/BullMQ durable work, policy enforcement, audit/evidence records, structured logs, health endpoints, and a pgvector semantic memory (RAG) layer. The existing sales and moderation interface remains available.

A clean, bold, **monochrome** Discord bot for **sales** and **moderation**, built entirely
with Discord's **Components V2** UI (`MessageFlags.IsComponentsV2`). No embeds, no color —
just bold typography, thin separators, and black-accented containers.

## Features

**Owner console**
- `/admin` — monochrome Components V2 panels: system/model health, agent budget,
  pending approvals, autonomy policies, and RAG memory status (Refresh/Wipe buttons)
- `/task` — owner-gated autonomy: inspect → plan → proposal → approval → verified execution → rollback
- `/help` — command reference

**Semantic memory (RAG)**
- pgvector store (`semantic_memories`) with HNSW cosine index
- Nomic Embed Text embeddings (OpenAI-compatible; any provider via `EMBED_BASE_URL`)
- Retrieval-augmented context assembly: relevant memories are injected into every agent turn
- Auto-ingestion of engaged exchanges (capped), owner wipe via `/admin memory`

**Sales**
- `/sales` — posts the storefront panel (catalog from `src/config.js`) with **Buy** buttons
- `/announce` — posts a monochrome announcement panel
- Buy → ephemeral checkout panel → **payment hook** ready for Stripe/PayPal (`handleCheckout()`)

**Moderation** (all with permission gating + optional mod-log)
- `/ban` — confirm/cancel UI before banning
- `/kick` — confirm/cancel UI before kicking
- `/timeout` — timeout a member for N minutes (0 removes it)
- `/purge` — bulk-delete up to 100 recent messages, optionally per-user
- `/warn` — warn a member and DM them the reason

## Requirements
- **Node.js ≥ 24.17.0**
- **PostgreSQL 17+ with pgvector** (compose uses `pgvector/pgvector:pg17`)
- **Redis 7+**
- **discord.js ≥ 14.27** (Components V2 support)

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for deployment and runbooks,
[`docs/SEMANTIC_MEMORY.md`](docs/SEMANTIC_MEMORY.md) for RAG, [`docs/DISCORD_RUNTIME.md`](docs/DISCORD_RUNTIME.md)
for the Discord control plane, and [`docs/SAFE_AUTONOMY.md`](docs/SAFE_AUTONOMY.md)
for proposal, approval, verified execution, recovery, and rollback workflows.

## Setup
```bash
cd discord-bot
npm ci
cp .env.example .env   # then fill in your values
cp .env.agent.example >> .env   # model profiles + embeddings config (edit endpoints/keys)
```

Fill in `.env`:
- `DISCORD_TOKEN` — bot token
- `CLIENT_ID` — application ID
- `GUILD_ID` — dev server ID (instant command deploy; leave blank for global)
- `MOD_LOG_CHANNEL_ID` — channel for moderation logs (optional)
- `MODEL_PROFILES_JSON` — OpenAI-compatible profiles (the OpenCode LLM proxy
  `http://127.0.0.1:4010/v1` works out of the box; see `.env.agent.example`)
- `EMBED_API_KEY` — Nomic (or compatible) embeddings key; leave empty to run without RAG

Enable the **Server Members** and **Message Content** privileged intents for your bot in the Developer Portal. They are required for moderation and comprehensive message observation/context.

## Run
```bash
npm run migrate    # apply schema (pgvector table included)
npm run deploy     # register slash commands (or set DEPLOY_COMMANDS_ON_START=true)
npm start          # start the bot
```

## Project structure
```
discord-bot/
├─ src/
│  ├─ index.js              # client + command/event loaders
│  ├─ deploy-commands.js    # slash command registration (also on-start deployable)
│  ├─ config.js             # secrets, monochrome THEME, PRODUCTS catalog
│  ├─ ui/theme.js           # Components V2 design system (panels, buttons)
│  ├─ ui/owner.js           # /admin console panels
│  ├─ memory/               # Nomic embeddings client + pgvector semantic store
│  ├─ commands/             # sales, announce, ban, kick, timeout, purge, warn, task, admin, help
│  ├─ events/               # ready, interactionCreate (command + button router)
│  └─ lib/                  # moderation helpers + pending-action store
├─ migrations/              # 001–006 (006 = pgvector semantic memory)
├─ test/                    # 68 node:test unit/integration tests
└─ .env.example
```

## Customizing the store
Edit the `PRODUCTS` array in `src/config.js`. Each product's `id` is used inside button
custom IDs, so keep it short, lowercase, and without `:`.

## Connecting payments
Open `src/events/interactionCreate.js` → `handleCheckout()`. Create a checkout session with
your provider and return a **link button** (`button.link(url, 'Pay Now')`) or update the panel
with the result.
