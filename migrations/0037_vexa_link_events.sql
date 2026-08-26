CREATE TABLE IF NOT EXISTS vexa_link_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source TEXT NOT NULL,
  successful INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_vexa_link_events_user_created
  ON vexa_link_events (user_id, created_at DESC);
