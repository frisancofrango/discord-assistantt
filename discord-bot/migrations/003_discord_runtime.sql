CREATE TABLE discord_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), gateway_key text UNIQUE NOT NULL,
  event_type text NOT NULL, guild_id text, channel_id text, thread_id text, user_id text,
  resource_id text, occurred_at timestamptz NOT NULL, correlation_id uuid, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discord_events_context_idx ON discord_events(guild_id, channel_id, thread_id, occurred_at DESC);
CREATE INDEX discord_events_resource_idx ON discord_events(resource_id, occurred_at DESC);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS referenced_message_id text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS last_discord_edited_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS message_revision_exact_idx ON message_revisions(message_id, revision);

CREATE TABLE discord_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guild_discord_id text NOT NULL,
  kind text NOT NULL DEFAULT 'guild', sha256 text NOT NULL, snapshot jsonb NOT NULL,
  correlation_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX discord_snapshots_guild_idx ON discord_snapshots(guild_discord_id, created_at DESC);

CREATE TABLE engagement_state (
  scope_key text PRIMARY KEY, last_response_at timestamptz, last_message_id text,
  consecutive_responses integer NOT NULL DEFAULT 0, metadata jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tool_idempotency (
  idempotency_key text PRIMARY KEY, tool_name text NOT NULL, input_hash text NOT NULL,
  status text NOT NULL, result jsonb, error jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
