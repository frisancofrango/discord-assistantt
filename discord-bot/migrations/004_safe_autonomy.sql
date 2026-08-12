CREATE TABLE proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES tasks ON DELETE CASCADE,
  guild_discord_id text NOT NULL, revision integer NOT NULL CHECK(revision > 0), status text NOT NULL,
  goal text NOT NULL, domain text NOT NULL, risk risk_class NOT NULL, before_snapshot_hash text NOT NULL,
  before_captured_at timestamptz NOT NULL, content_hash text NOT NULL, diff jsonb NOT NULL, tiers jsonb NOT NULL,
  selected_tier_id text NOT NULL, machine_plan jsonb NOT NULL, estimates jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id,revision)
);
CREATE INDEX proposals_guild_status_idx ON proposals(guild_discord_id,status,created_at DESC);
CREATE TABLE approval_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES proposals ON DELETE CASCADE,
  proposal_revision integer NOT NULL, actor_discord_id text NOT NULL, guild_discord_id text NOT NULL,
  token_hash text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
  decision text, decided_by_discord_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE proposal_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES proposals ON DELETE CASCADE,
  proposal_revision integer NOT NULL, actor_discord_id text NOT NULL, guild_discord_id text NOT NULL,
  decision text NOT NULL CHECK(decision IN ('approve_all','approve_partial','reject','request_changes')),
  approved_step_ids text[] NOT NULL DEFAULT '{}', reason text, authorization jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES proposals,
  proposal_revision integer NOT NULL, guild_discord_id text NOT NULL, status text NOT NULL,
  dry_run boolean NOT NULL DEFAULT false, approved_step_ids text[] NOT NULL, metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workflow_recovery_idx ON workflow_executions(status,created_at);
CREATE TABLE workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), execution_id uuid NOT NULL REFERENCES workflow_executions ON DELETE CASCADE,
  step_key text NOT NULL, stage integer NOT NULL, status text NOT NULL, idempotency_key text UNIQUE NOT NULL,
  receipt jsonb, error jsonb, compensation jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(execution_id,step_key)
);
CREATE TABLE budget_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guild_discord_id text NOT NULL, domain text NOT NULL,
  amount numeric(18,6) NOT NULL CHECK(amount>=0), execution_id uuid UNIQUE NOT NULL REFERENCES workflow_executions ON DELETE CASCADE,
  status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workflow_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), execution_id uuid NOT NULL REFERENCES workflow_executions ON DELETE CASCADE,
  kind text NOT NULL, status text NOT NULL, evidence jsonb NOT NULL DEFAULT '[]', verification jsonb NOT NULL DEFAULT '{}',
  conflicts jsonb NOT NULL DEFAULT '[]', irreversible jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
