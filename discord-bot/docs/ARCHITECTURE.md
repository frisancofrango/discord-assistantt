# Azure — Production Architecture

Azure is an agentic Discord server operating system. It converts owner goals into inspected, reviewable, executable plans and never reports an action as complete without tool evidence.

## Non-negotiable invariants

1. **Observe before planning.** Every server-changing task begins with a fresh guild snapshot.
2. **Propose before risky execution.** Destructive, externally visible, financial, permission, or bulk actions require the configured approval level.
3. **Receipts over claims.** Completed steps must include persisted Discord/API tool results.
4. **Least privilege.** Capabilities are granted per guild, actor, domain, risk level, and budget.
5. **Idempotency.** Every job and tool invocation has an idempotency key.
6. **Rollback.** Mutable Discord resources are snapshotted before changes; reversible operations emit compensating actions.
7. **No production self-rewrite.** Code workers may prepare and test patches, but deployment requires owner approval.
8. **No spam or deception.** Marketing is consent-based, rate-limited, attributable, and policy checked.
9. **Azure identity.** User-facing output identifies the assistant only as Azure; provider/model internals remain operator telemetry.

## Runtime topology

- **Discord gateway** — event ingestion, context capture, intent detection, typing state, Components V2 interactions.
- **Agent orchestrator** — goal normalization, task DAG planning, delegation, retries, checkpointing, synthesis.
- **Model router** — capability-aware selection, fallback, cost/latency/quality scoring, circuit breakers.
- **Tool runtime** — typed Discord, research, code, filesystem, and internal business tools.
- **Policy engine** — RBAC/ABAC, autonomy domains, risk classification, budgets, approvals, rate limits.
- **Memory service** — exact recent turns, conversations, summaries, durable facts, preferences, entities, semantic retrieval.
- **Job workers** — durable execution through Redis/BullMQ with leases, retry policy, cancellation, and progress events.
- **PostgreSQL** — source of truth for state, plans, evidence, audit, tickets, inventory, orders, warnings, and analytics.
- **Sandbox worker** — isolated research/code workspace with allowlisted network and resource budgets.
- **Owner console** — Discord Components V2 panels for plans, diffs, approvals, capabilities, budgets, and system health.

## Agent loop

`event → contextualize → decide whether to engage → authorize → inspect → plan → price/risk → propose or execute → verify → persist evidence → summarize`

A task is never marked complete solely because a model says so. The orchestrator validates postconditions against tool output and, for Discord mutations, re-reads affected resources.

## Autonomy

Each domain has an independent level:

- `advisor`: inspect and propose
- `operator`: execute low-risk operations; approve risky operations
- `autopilot`: execute within explicit policy and budget
- `developer`: additionally prepare tested code changes; deployment remains owner-gated

Domains: `conversation`, `moderation`, `server_design`, `support`, `verification`, `commerce`, `marketing`, `research`, `coding`, `analytics`.

## Risk classes

- `read`: observation only
- `low`: reversible/private action
- `medium`: visible or member-affecting action
- `high`: destructive, permission, bulk, financial, external publication, or code deployment
- `forbidden`: credential theft, malware, evasion, unsolicited spam, fake engagement, self-bot behavior

## Context and engagement

Azure stores events by guild/channel/thread/user/conversation. Context assembly combines:

1. replied-to message and reference chain
2. current thread/channel recent window
3. active task and its checkpoints
4. per-user preferences and durable facts
5. relevant server facts and semantic memories
6. edited-message revisions and attachment metadata

Engagement is deterministic first (mention, DM, reply, active task, owner command), then model-scored for relevance. Passive messages are observed but not automatically answered. A cooldown prevents interruptions and chatter loops.

## Model routing

Models are configured, never hardcoded. Each profile declares provider, endpoint, model, capabilities, context window, cost, latency target, and priority. Delegated tasks specify capability and quality tier. Routing applies:

1. policy/provider availability
2. capability and context fit
3. health/circuit-breaker state
4. weighted quality, cost, and latency score
5. retry on a different profile
6. optional critic pass for high-risk plans

No user-facing message reveals model/provider metadata.

## Discord tool contract

Every tool has a JSON schema, risk class, required bot permissions, policy domain, execute function, verify function, and optional compensate function. Results contain:

- invocation and idempotency IDs
- normalized input
- Discord resource IDs
- before/after snapshots where applicable
- API status and error details
- verification result
- rollback descriptor

## Core workflows

### Transform server
Inspect full guild → generate 2–3 tiered designs → display structural/permission diff → owner selects/edits → snapshot → staged execution → verify each stage → publish receipt → retain rollback plan.

### Moderation
Observe/report → collect evidence → policy evaluation → human confirmation where required → action → DM where appropriate → mod log → case history → appeal/ticket link.

### Shop
Catalog/inventory → storefront → ticket/order → payment-provider adapter → fulfillment state machine → receipts → vouches → fraud/risk flags → analytics. Secrets remain outside prompts.

### Self-improvement
Detect repeated failure or operator request → open improvement proposal → create isolated branch/worktree → generate patch → lint/test/security checks → present diff and migration impact → owner approval → deploy externally → health check/rollback.

## Deployment

Production uses Docker Compose for the bot, PostgreSQL, and Redis. Secrets are injected at runtime. Database migrations run before startup. Health/readiness endpoints expose dependency status without secrets. Structured logs include correlation IDs, never tokens or private message content by default.
