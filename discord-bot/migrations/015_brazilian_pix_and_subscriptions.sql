-- Brazilian PIX Gateway, Multi-Gateway Invoicing, and Role Subscriptions

CREATE TABLE IF NOT EXISTS pix_invoices (
  id text PRIMARY KEY DEFAULT ('pix_' || substr(md5(random()::text), 1, 12)),
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  external_reference text,
  qr_code text NOT NULL,
  qr_code_base64 text,
  amount_minor integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_role_subscriptions (
  id text PRIMARY KEY DEFAULT ('sub_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  role_id text NOT NULL,
  order_id text REFERENCES orders(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guild_pix_config (
  guild_id text PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
  access_token text,
  pix_key text,
  webhook_secret text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
