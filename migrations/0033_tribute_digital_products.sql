CREATE TABLE IF NOT EXISTS tribute_digital_purchases (
  purchase_id TEXT PRIMARY KEY,
  transaction_id TEXT,
  product_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  product_name TEXT,
  credits INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  credited_at TEXT,
  refunded_at TEXT,
  purchase_created_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tribute_digital_user_product
  ON tribute_digital_purchases (user_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tribute_digital_transaction
  ON tribute_digital_purchases (transaction_id);
