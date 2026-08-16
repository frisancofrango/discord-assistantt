-- Advanced Operating Hours, Channel Schedules, Buyer Loyalty, Flash Drops, and Reviews

CREATE TABLE IF NOT EXISTS guild_operating_hours (
  guild_id text PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  days text[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun'],
  start_time text NOT NULL DEFAULT '09:00',
  end_time text NOT NULL DEFAULT '22:00',
  timezone text NOT NULL DEFAULT 'UTC',
  out_of_office_message text NOT NULL DEFAULT 'Our support team is currently offline. Please leave your message and staff will assist you as soon as hours open.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_schedules (
  id text PRIMARY KEY DEFAULT ('sch_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  lock_time text NOT NULL,
  unlock_time text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id text PRIMARY KEY DEFAULT ('lyt_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  tier_name text NOT NULL,
  min_spend_minor bigint NOT NULL,
  cashback_percent integer NOT NULL DEFAULT 1,
  role_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, tier_name)
);

CREATE TABLE IF NOT EXISTS member_loyalty (
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  lifetime_spent_minor bigint NOT NULL DEFAULT 0,
  current_tier text NOT NULL DEFAULT 'Bronze',
  total_cashback_minor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS flash_drops (
  id text PRIMARY KEY DEFAULT ('drp_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  title text NOT NULL,
  variant_id text NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  drop_price_minor bigint NOT NULL,
  max_stock integer,
  claimed_stock integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_reviews (
  id text PRIMARY KEY DEFAULT ('rev_' || substr(md5(random()::text), 1, 12)),
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  cashback_awarded_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);
