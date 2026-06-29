CREATE TABLE IF NOT EXISTS initial_start_bonuses (
  user_id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL,
  language TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
