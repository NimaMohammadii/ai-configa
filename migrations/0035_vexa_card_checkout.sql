CREATE TABLE IF NOT EXISTS vexa_card_checkout_sessions (
  public_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'created',
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_session_id TEXT,
  provider_payment_id TEXT,
  provider_url TEXT,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  credited_at TEXT,
  refunded_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vexa_card_checkout_token_hash
  ON vexa_card_checkout_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_vexa_card_checkout_user_created
  ON vexa_card_checkout_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vexa_card_checkout_provider_session
  ON vexa_card_checkout_sessions (provider_session_id);

CREATE INDEX IF NOT EXISTS idx_vexa_card_checkout_provider_payment
  ON vexa_card_checkout_sessions (provider_payment_id);
