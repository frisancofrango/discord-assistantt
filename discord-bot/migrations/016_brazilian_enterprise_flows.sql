-- Brazilian Enterprise Flows: Private Cart Channels, Social Proof Reviews Broadcast, Multi-Seller Vendors, and Server Commerce Channels Config

CREATE TABLE IF NOT EXISTS guild_commerce_channels (
  guild_id text PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
  cart_category_id text,
  reviews_channel_id text,
  logs_channel_id text,
  ranking_channel_id text,
  language text NOT NULL DEFAULT 'pt_BR',
  currency text NOT NULL DEFAULT 'BRL',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS active_cart_channels (
  id text PRIMARY KEY DEFAULT ('cch_' || substr(md5(random()::text), 1, 12)),
  guild_id text NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  channel_id text NOT NULL UNIQUE,
  order_id text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'checking_out', 'fulfilled', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_vendors (
  product_id text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  vendor_user_id text NOT NULL,
  commission_percent integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
