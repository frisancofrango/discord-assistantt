# Azure Phase 1 operations

## Dependencies

Production requires Node.js 24.17+, PostgreSQL, Redis, and a Discord bot token. Copy `.env.production.example` to `.env`, replace every `replace_me`, and never commit `.env`. In development only, unavailable PostgreSQL/Redis leaves the HTTP process running but `/ready` returns 503; production fails startup.

## Local setup

```sh
npm ci
npm run migrate
npm test
npm run check
npm run deploy
npm start
```

Migrations are ordered SQL files in `migrations/` and are tracked transactionally in `schema_migrations`. `RUN_MIGRATIONS=true` applies them before Discord login.

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

## Foundation APIs

`runtime.repositories` exposes `create`, `get`, `find`, and `update` for guilds, users, conversations, messages, revisions, memories, tasks, task steps, tool invocations, evidence, audit records, autonomy policies, approvals, and budgets. Use `repositories.transaction()` for atomic workflows. Tool claims and queue jobs require idempotency keys. Queue processors receive `progress()` and `isCancelled()` controls.

Policy decisions must be evaluated before execution and persisted to audit. Forbidden behavior cannot be approved. High-risk and deployment actions remain owner-gated. Logs are JSON and redact common secret fields; private message content should not be added to logs.
