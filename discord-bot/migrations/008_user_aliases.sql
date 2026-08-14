CREATE TABLE IF NOT EXISTS user_aliases (
  discord_id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);