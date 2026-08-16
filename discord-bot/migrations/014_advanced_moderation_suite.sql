-- Advanced Moderation, AutoMod, Sticky Messages, Role Menus, and Modmail

CREATE TABLE IF NOT EXISTS automod_rules (
  id text PRIMARY KEY DEFAULT ('amr_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('anti_phishing', 'anti_invites', 'mass_mentions', 'banned_words', 'mass_caps')),
  enabled boolean NOT NULL DEFAULT true,
  threshold integer NOT NULL DEFAULT 5,
  action text NOT NULL DEFAULT 'delete_and_warn' CHECK (action IN ('delete', 'delete_and_warn', 'delete_and_timeout', 'delete_and_kick')),
  exempt_roles text[] DEFAULT ARRAY[]::text[],
  exempt_channels text[] DEFAULT ARRAY[]::text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, rule_type)
);

CREATE TABLE IF NOT EXISTS member_infractions (
  id text PRIMARY KEY DEFAULT ('inf_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  issuer_id text NOT NULL,
  points integer NOT NULL DEFAULT 1,
  reason text NOT NULL,
  escalation_action text NOT NULL DEFAULT 'warn',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sticky_messages (
  channel_id text PRIMARY KEY,
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  last_message_id text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_menus (
  id text PRIMARY KEY DEFAULT ('rmu_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  roles jsonb NOT NULL,
  channel_id text,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS modmail_threads (
  id text PRIMARY KEY DEFAULT ('mdm_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  thread_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
