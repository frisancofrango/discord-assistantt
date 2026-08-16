-- Escrow Deal Vault and Cryptocurrency Invoicing

CREATE TABLE IF NOT EXISTS escrow_deals (
  id text PRIMARY KEY DEFAULT ('esc_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  buyer_id text NOT NULL,
  seller_id text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  terms text NOT NULL,
  status text NOT NULL DEFAULT 'pending_deposit' CHECK (status IN ('pending_deposit', 'funds_locked', 'delivered', 'completed', 'disputed', 'refunded', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS crypto_invoices (
  id text PRIMARY KEY DEFAULT ('crp_' || substr(md5(random()::text), 1, 12)),
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  crypto_currency text NOT NULL CHECK (crypto_currency IN ('BTC', 'LTC', 'USDT_TRC20', 'SOL')),
  deposit_address text NOT NULL,
  crypto_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirming', 'paid', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
