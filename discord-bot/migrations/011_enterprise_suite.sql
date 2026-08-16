-- Enterprise Suite: OAuth Member Backup, Server Snapshots, License Key Pool, Anti-Nuke, and Affiliates

CREATE TABLE IF NOT EXISTS oauth_members (
  id text PRIMARY KEY DEFAULT ('oam_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  scope text NOT NULL DEFAULT 'identify guilds.join',
  expires_at timestamptz NOT NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS server_backups (
  id text PRIMARY KEY DEFAULT ('bkp_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name text NOT NULL,
  creator_id text NOT NULL,
  channel_count integer NOT NULL DEFAULT 0,
  role_count integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_license_keys (
  id text PRIMARY KEY DEFAULT ('key_' || substr(md5(random()::text), 1, 12)),
  variant_id text NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  license_key text NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  redeemed_by text,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(variant_id, license_key)
);

CREATE INDEX IF NOT EXISTS idx_license_keys_unclaimed ON product_license_keys(variant_id) WHERE NOT is_used;

CREATE TABLE IF NOT EXISTS security_whitelists (
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL DEFAULT 'co_owner',
  added_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS security_incidents (
  id text PRIMARY KEY DEFAULT ('inc_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  action text NOT NULL,
  threshold text NOT NULL,
  status text NOT NULL DEFAULT 'quarantined',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_codes (
  id text PRIMARY KEY DEFAULT ('ref_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  code text NOT NULL,
  commission_percent integer NOT NULL DEFAULT 10,
  total_earnings_minor bigint NOT NULL DEFAULT 0,
  total_referrals integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, user_id),
  UNIQUE(guild_id, code)
);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id text PRIMARY KEY DEFAULT ('rcm_' || substr(md5(random()::text), 1, 12)),
  referral_code_id text NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id text NOT NULL,
  referrer_id text NOT NULL,
  order_amount_minor bigint NOT NULL,
  commission_amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);
