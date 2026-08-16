# Loop safe autonomy workflows

`/task goal:<goal>` is proposal-first. Loop reads a fresh guild snapshot, creates a validated task DAG, and persists a two- or three-tier proposal. No mutation occurs during planning. Proposal panels show the normalized diff, selected scope, required permissions, cost/time/risk estimates, and irreversible warnings.

Approvals are policy checked by guild, actor, domain, autonomy, risk, and budget. Approval tokens use 256 bits of randomness, are stored only as hashes, expire, are one-time use, and are bound to the proposal revision, actor, and guild. Decisions support approve all, dependency-safe partial approval, reject, and request changes. Revising a proposal invalidates earlier approval grants by revision binding.

Execution takes a per-guild database lock, re-reads the guild, rejects stale or changed snapshots, checks permissions, reserves budget, and executes approved DAG stages with bounded concurrency and stable idempotency keys. Discord requests use discord.js rate-limit handling. Every successful mutation must return persisted tool evidence and pass a fresh-read verification. Failed stages remain resumable from durable checkpoints; dependent work does not run after failure. Cancellation is checked between stages and restart recovery resumes queued/running work idempotently.

Rollback uses persisted compensation descriptors and before/after snapshots. It supports dry-run, one-stage, and full rollback. A fresh-read hash conflict blocks rollback rather than overwriting later changes. Irreversible steps are explicitly retained on the rollback receipt. Compensation results are verified and persisted.

## Configuration

- `AUTONOMY_TIER_COUNT`: `2` or `3` (default `3`)
- `APPROVAL_TTL_MS`: approval lifetime (default 15 minutes)
- `APPROVAL_TOKEN_PEPPER`: secret used when hashing approval tokens
- `SNAPSHOT_MAX_AGE_MS`: maximum preflight/read age (default 60 seconds)
- `WORKFLOW_CONCURRENCY`: bounded per-stage concurrency (default `2`)

Apply `004_safe_autonomy.sql`, redeploy commands, and restart Loop. Startup registers the durable workflow services and performs recovery after PostgreSQL/Redis are ready. Shutdown stops new gateway work before foundation dependencies close.

Live Discord behavior must be validated in a staging guild with the required bot permissions; automated tests use deterministic fakes and do not constitute live Discord validation.
