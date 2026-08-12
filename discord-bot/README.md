# Azure Discord Bot

Azure is a production-oriented Discord server operating system with a PostgreSQL source of truth, Redis/BullMQ durable work, policy enforcement, audit/evidence records, structured logs, and health endpoints. The existing sales and moderation interface remains available.

A clean, bold, **monochrome** Discord bot for **sales** and **moderation**, built entirely
with Discord's **Components V2** UI (`MessageFlags.IsComponentsV2`). No embeds, no color —
just bold typography, thin separators, and black-accented containers.

## Features

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
- **PostgreSQL 17+**
- **Redis 7+**
- **discord.js ≥ 14.27** (Components V2 support)

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for deployment, [`docs/DISCORD_RUNTIME.md`](docs/DISCORD_RUNTIME.md) for the Discord control plane, and [`docs/SAFE_AUTONOMY.md`](docs/SAFE_AUTONOMY.md) for proposal, approval, verified execution, recovery, and rollback workflows.

## Setup
```bash
cd discord-bot
npm install
cp .env.example .env   # then fill in your values
```

Fill in `.env`:
- `DISCORD_TOKEN` — bot token
- `CLIENT_ID` — application ID
- `GUILD_ID` — dev server ID (instant command deploy; leave blank for global)
- `MOD_LOG_CHANNEL_ID` — channel for moderation logs (optional)

Enable the **Server Members** and **Message Content** privileged intents for your bot in the Developer Portal. They are required for moderation and comprehensive message observation/context.

## Run
```bash
npm run deploy   # register slash commands
npm start        # start the bot
```

## Project structure
```
discord-bot/
├─ src/
│  ├─ index.js              # client + command/event loaders
│  ├─ deploy-commands.js    # slash command registration
│  ├─ config.js             # secrets, monochrome THEME, PRODUCTS catalog
│  ├─ ui/theme.js           # Components V2 design system (panels, buttons)
│  ├─ commands/             # sales, announce, ban, kick, timeout, purge, warn
│  ├─ events/               # ready, interactionCreate (command + button router)
│  └─ lib/                  # moderation helpers + pending-action store
└─ .env.example
```

## Customizing the store
Edit the `PRODUCTS` array in `src/config.js`. Each product's `id` is used inside button
custom IDs, so keep it short, lowercase, and without `:`.

## Connecting payments
Open `src/events/interactionCreate.js` → `handleCheckout()`. Create a checkout session with
your provider and return a **link button** (`button.link(url, 'Pay Now')`) or update the panel
with the result.
