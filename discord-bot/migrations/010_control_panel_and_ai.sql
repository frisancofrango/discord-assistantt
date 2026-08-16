-- Control Panel, AI Studio, Coupons, and Canned Responses Migration

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id text PRIMARY KEY,
  anti_raid_level text NOT NULL DEFAULT 'standard',
  verification_mode text NOT NULL DEFAULT 'math_captcha',
  ai_persona text NOT NULL DEFAULT 'concierge',
  ai_autonomy text NOT NULL DEFAULT 'operator',
  default_currency text NOT NULL DEFAULT 'USD',
  coupons_enabled boolean NOT NULL DEFAULT true,
  cashback_percent integer NOT NULL DEFAULT 0,
  log_channel_id text,
  ticket_category_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id text PRIMARY KEY DEFAULT ('cpn_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  code text NOT NULL,
  discount_percent integer CHECK (discount_percent IS NULL OR (discount_percent >= 1 AND discount_percent <= 100)),
  discount_minor bigint CHECK (discount_minor IS NULL OR discount_minor > 0),
  min_order_minor bigint NOT NULL DEFAULT 0,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_lookup ON coupons(guild_id, code) WHERE active;

CREATE TABLE IF NOT EXISTS ticket_canned_responses (
  id text PRIMARY KEY DEFAULT ('can_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_knowledge_nodes (
  id text PRIMARY KEY DEFAULT ('kn_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'documentation',
  content text NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, content_hash)
);
