CREATE TABLE IF NOT EXISTS payment_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  package_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_receipt_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  caption TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
