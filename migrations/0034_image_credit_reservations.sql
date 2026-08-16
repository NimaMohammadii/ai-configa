CREATE TABLE IF NOT EXISTS image_credit_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reserved_credits INTEGER NOT NULL,
  actual_credits INTEGER,
  status TEXT NOT NULL,
  metadata TEXT,
  release_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_image_credit_reservations_user_created
  ON image_credit_reservations (user_id, created_at DESC);
