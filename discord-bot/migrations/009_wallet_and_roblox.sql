CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  member_id text NOT NULL,
  balance_minor bigint NOT NULL DEFAULT 0 CHECK(balance_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  locked_minor bigint NOT NULL DEFAULT 0 CHECK(locked_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, member_id, currency),
  CHECK(locked_minor <= balance_minor)
);

CREATE INDEX IF NOT EXISTS wallets_member_idx ON wallets(guild_id, member_id);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  guild_id text NOT NULL,
  member_id text NOT NULL,
  type text NOT NULL CHECK(type IN ('deposit', 'withdrawal', 'purchase', 'refund', 'transfer_in', 'transfer_out', 'adjustment')),
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  balance_after_minor bigint NOT NULL CHECK(balance_after_minor >= 0),
  reference_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_tx_member_idx ON wallet_transactions(guild_id, member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS roblox_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  member_id text NOT NULL,
  roblox_id bigint NOT NULL,
  roblox_username text NOT NULL,
  verified boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, member_id)
);

CREATE INDEX IF NOT EXISTS roblox_links_user_idx ON roblox_links(roblox_id);

CREATE TABLE IF NOT EXISTS roblox_gamepasses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  gamepass_id bigint NOT NULL,
  seller_roblox_id bigint NOT NULL,
  price_robux integer NOT NULL CHECK(price_robux > 0),
  net_robux integer NOT NULL CHECK(net_robux > 0),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'sold', 'expired')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(guild_id, gamepass_id)
);
