# Implementation plan

## Phase 1 — Foundation
- Configuration validation and secret redaction
- PostgreSQL migrations and repository layer
- Redis-backed durable queue
- Structured logs, correlation IDs, health checks
- Policy, autonomy, budget, approval, audit, and evidence records

## Phase 2 — Intelligence runtime
- OpenAI-compatible model adapter for configured OpenCode endpoints
- Capability model registry and health-aware router
- Planner producing validated task DAGs
- Executor with checkpoints, retries, cancellation, verification, and compensation
- Critic/reviewer passes for high-risk plans
- Research worker with source records and download quarantine
- Code worker with isolated worktree/container, tests, and owner-gated patch deployment

## Phase 3 — Discord control plane
- [x] Complete normalized event capture: messages, exact edits/deletes/replies, threads, members, roles, channels, reactions, interactions, moderation, AutoMod, invites, scheduled events, webhooks and guild updates
- [x] Token-budgeted context assembler and deterministic/relevance-based engagement policy
- [x] Typed, policy-gated, idempotent tools for channels, categories, forums, threads, roles, overwrites, Components V2 messages, pins, reactions, stickers, emojis, moderation, guild settings, invites, AutoMod, scheduled events and policy-limited webhooks
- [x] Fresh normalized guild snapshot/diff and execute/verify/compensate primitives (proposal/apply orchestration remains a later workflow)
- [x] Components V2 proposal, progress, approval, diff, receipt, settings, health, and owner-console panels (`/admin`, `/help`)
- [x] Semantic memory: pgvector store, Nomic Embed Text client, RAG context retrieval, exchange ingestion with caps

## Phase 4 — Native systems
- [x] Ticket lifecycle, routing, transcript, SLA, and satisfaction
- [x] Verification/captcha adapter and anti-raid controls
- [x] Catalog, inventory, order, fulfillment, payment adapter, receipts, and vouches
- [x] Cases, warnings, evidence, escalation, appeals, and automod policies
- [x] Consent-based campaigns, attribution links, scheduling, experiments, and opt-out
- [x] Server/member/order/support/moderation analytics

## Phase 5 — Hardening
- [x] Unit, integration, permission, policy, migration, and failure-injection tests (68 tests, `npm test`)
- [x] Discord staging-guild end-to-end suite (manual runbook R5)
- [x] Database backup and restoration drill (runbook R1)
- [x] Rate-limit and restart recovery tests/runbooks (R2–R4)
- [x] Docker production deployment and operator runbooks

## Definition of done

A capability is complete only when it has:
- typed inputs and outputs
- policy and permission enforcement
- persisted audit/evidence
- deterministic failure handling
- postcondition verification
- rollback or explicit irreversibility warning
- tests for success, denial, retry, and partial failure
- operator documentation

## Explicit platform boundaries

Discord bot accounts cannot impersonate users or use ordinary user accounts as self-bots. Loop can invoke its own interactions and supported APIs, but cannot arbitrarily operate third-party applications without an exposed integration. Captcha and payments use provider adapters. Marketing is strictly opt-in; unsolicited messaging, scraping, fake engagement, and evasion are prohibited.
