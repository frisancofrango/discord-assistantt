# Azure intelligence runtime

## Model profiles

Configure `MODEL_PROFILES_JSON` as a JSON array. Profiles are operator-only metadata and must include `id`, OpenAI-compatible `endpoint`, `model`, `capabilities`, and `contextWindow`. Optional scoring fields are `quality` (0–1), `inputCostPerMillion`, `outputCostPerMillion`, `latencyMs`, and `priority`. `apiKey` and custom `headers` are accepted but must be injected as secrets. Azure never includes endpoint, provider, profile, or model identity in user-facing text.

Routing filters by capability and context fit, excludes open circuits, then scores quality, context fit, cost, latency, and priority. Retries rotate to distinct profiles. Configure `MODEL_MAX_RETRIES`, `MODEL_FAILURE_THRESHOLD`, `MODEL_CIRCUIT_RESET_MS`, and `AGENT_BUDGET_USD`. Usage and latency are persisted in `model_usage`; logs contain structured profile IDs but no credentials.

## Planning and execution

Plans require fresh context with `observedAt` and are schema-validated acyclic DAGs. Every step records domain/risk, dependencies, preconditions, postconditions, verification, and compensation. High-risk plans require a separate critic profile and are rejected if review is not approved. Plans and steps are persisted before queue execution.

The `agent-tasks` queue resumes completed steps, checkpoints each new completion, checks cancellation between steps, and refuses evidence-required completion without persisted evidence. Queue job and task idempotency keys are mandatory. Failures persist on the task and active step. Model retries are bounded and use distinct profiles.

## Research policy

Research accepts 1–20 HTTPS URLs, rejects loopback/private networks, optionally enforces `RESEARCH_ALLOWED_HOSTS`, denies unapproved MIME types, follows no redirects, and enforces declared and actual byte limits plus request deadlines. Downloads are SHA-256 hashed and written with exclusive creation under `.azure-quarantine` using opaque names. Evidence records identify source URL, type, size, hash, quarantine state, and gather time. Gathered evidence is returned separately from synthesis.

Configure `RESEARCH_MAX_BYTES`, `RESEARCH_TIMEOUT_MS`, `RESEARCH_ALLOWED_TYPES`, and comma-separated `RESEARCH_ALLOWED_HOSTS`. Quarantined artifacts are untrusted and must be scanned before any later consumer opens them.

## Code worker

The code worker creates a unique temporary directory, locally clones the configured repository, applies only the supplied patch, runs configured validation commands sequentially with deadlines and bounded captured output, persists the patch hash/diff/results, and deletes the sandbox. Deployment, publication, pushes, infrastructure apply, and production mutation commands are denied. Deployment remains an external owner-approved operation.

Configure `CODE_WORKSPACE_ROOT`, `CODE_VALIDATION_COMMANDS_JSON`, and `CODE_COMMAND_TIMEOUT_MS`. Validation should include tests, syntax/lint checks, and security checks appropriate to the repository.

## Required migration and operation

Apply `002_agent_runtime.sql` with `npm run migrate`. The intelligence worker starts only after PostgreSQL and Redis are ready and closes before those dependencies during shutdown. A production installation should configure at least two profiles for each critical capability (`planning`, `critic`, and any synthesis capability) to enable rotation.
