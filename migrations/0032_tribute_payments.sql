CREATE TABLE IF NOT EXISTS tribute_payments (
  order_uuid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  package_id TEXT,
  credits INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_url TEXT,
  credited_at TEXT,
  refunded_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tribute_payments_user_created
  ON tribute_payments (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tribute_payments_status
  ON tribute_payments (status, created_at DESC);
