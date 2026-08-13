# Azure operations and runbooks

## Dependencies

Production requires Node.js 24.17+, PostgreSQL 17+ with the **pgvector**
extension (the Compose stack uses `pgvector/pgvector:pg17`), Redis, and a Discord
bot token. Copy `.env.production.example` to `.env`, replace every `replace_me`,
and never commit `.env`. In development only, unavailable PostgreSQL/Redis leaves
the HTTP process running but `/ready` returns 503; production fails startup.

## Local setup

```sh
npm ci
npm run migrate
npm test
npm run check
npm run deploy
npm start
```

Migrations are ordered SQL files in `migrations/` and are tracked transactionally
in `schema_migrations`. `RUN_MIGRATIONS=true` applies them before Discord login.
Slash commands are deployed out-of-band with `npm run deploy`, or automatically
at startup with `DEPLOY_COMMANDS_ON_START=true` (idempotent; recommended for
containers).

## Docker Compose

```sh
cp .env.production.example .env
# edit secrets
# DATABASE_URL in compose is assembled from POSTGRES_PASSWORD
docker compose up --build -d
docker compose logs -f azure
docker compose down
```

PostgreSQL and Redis use named volumes. Back them up before schema upgrades.

## Health and shutdown

- `GET /live`: process event loop is alive; 503 while stopping.
- `GET /ready`: startup completed and PostgreSQL/Redis respond.
- `SIGTERM`/`SIGINT`: Discord stops accepting work, then HTTP, workers, Redis, and PostgreSQL close within `SHUTDOWN_TIMEOUT_MS`.

## Runbooks

### R1 · Database backup and restore drill

```sh
# Backup (point-in-time consistency, plain SQL)
docker compose exec -T postgres pg_dump -U azure -d azure -F c -f /tmp/azure.dump
docker compose cp postgres:/tmp/azure.dump ./backups/azure-$(date +%Y%m%d-%H%M%S).dump

# Restore into a fresh volume (drill: always on a scratch stack first)
docker compose down -v --remove-orphans        # WARNING: destroys all volumes
docker compose up -d postgres redis
docker compose cp ./backups/azure-latest.dump postgres:/tmp/restore.dump
docker compose exec -T postgres pg_restore -U azure -d azure -F c --clean --if-exists /tmp/restore.dump

# Verify: row counts for evidence-bearing tables
docker compose exec postgres psql -U azure -d azure -c \
  "SELECT (SELECT count(*) FROM evidence) evidence, (SELECT count(*) FROM workflow_receipts) receipts, (SELECT count(*) FROM semantic_memories) semantic;"
```

Run the drill at least quarterly. The backup file contains the `semantic_memories`
rows and their vectors — pgvector data restores with the extension image.

### R2 · Restart recovery

1. `docker compose restart azure` — BullMQ jobs resurface via retries; safe
   workflow executions are picked up by `executor.recover()` on startup
   (`workflow_executions` with status `queued|running|cancelling|rolling_back`).
2. Verify `/ready` returns 200 and `docker compose logs azure | grep -i recover`
   shows recovery summaries.
3. If Redis was lost, jobs are unrecoverable by design (durable state lives in
   PostgreSQL); re-run the source command/approval to re-enqueue.

### R3 · Discord rate-limit (429) storm

- The bot emits rate-limit events through the gateway; tools that hit Discord
  return error receipts. Check `GET /ready` + `docker compose logs azure` for
  `429` clusters.
- First verify no tool or marketing loop is retrying blindly: `docker compose logs azure | grep -i '429' | head -50`.
- Idle workers, wait 5–10 minutes (global limits reset per route), then
  `docker compose restart azure` if the limit never cleared (e.g. a `429` on
  `/guilds/:id/roles` while a stuck workflow re-runs).
- Marketing is rate-limited by `MARKETING_MAX_RATE_PER_MINUTE`; lower it if a
  server hits persistent 429s on message sends.

### R4 · Model/embedding provider outage

- `GET /ready` stays 200 (providers are not startup dependencies). The model
  router's circuit breaker opens per profile (`MODEL_FAILURE_THRESHOLD`,
  `MODEL_CIRCUIT_RESET_MS`); `/admin health` shows open circuits.
- If embeddings are down, semantic search degrades to `[]` and ingestion is
  skipped; relational memory keeps working. `/admin health` reflects RAG status.
- Restore order: provider API key → `docker compose restart azure` → confirm
  `/admin health` shows healthy circuits.

### R5 · Staging-guild end-to-end suite (manual)

1. Create a scratch server, invite the bot with the application role.
2. `GUILD_ID=<staging> DEPLOY_COMMANDS_ON_START=true npm run deploy` (or start with the env).
3. Verify: `/help` renders; `/sales` posts a storefront; `/ban` confirm/cancel;
   `/warn` DMs the target; `/task` produces a proposal panel; approve and watch
   the progress → receipt flow; `/admin health|budget|approvals|policies|memory`
   all render and Refresh works.
4. Send a message mentioning Azure, wait for a reply, then `/admin memory` — the
   exchange row should appear (RAG enabled), and `/admin memory` → Wipe All
   clears it.

## Foundation APIs

`runtime.repositories` exposes `create`, `get`, `find`, and `update` for guilds, users, conversations, messages, revisions, memories, tasks, task steps, tool invocations, evidence, audit records, autonomy policies, approvals, and budgets. Use `repositories.transaction()` for atomic workflows. Tool claims and queue jobs require idempotency keys. Queue processors receive `progress()` and `isCancelled()` controls.

`runtime.memory` exposes the semantic store (`remember`, `search`, `recent`,
`forget`, `forgetAll`, `stats`, `enabled`) — see `docs/SEMANTIC_MEMORY.md`.

Policy decisions must be evaluated before execution and persisted to audit. Forbidden behavior cannot be approved. High-risk and deployment actions remain owner-gated. Logs are JSON and redact common secret fields; private message content should not be added to logs.
