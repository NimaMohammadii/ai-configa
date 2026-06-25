CREATE TABLE IF NOT EXISTS daily_rewards (
  user_id TEXT PRIMARY KEY,
  last_claimed_at TEXT,
  last_notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
