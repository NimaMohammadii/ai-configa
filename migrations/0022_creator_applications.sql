CREATE TABLE IF NOT EXISTS creator_applications (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language TEXT,
  creator_handle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bonus_granted INTEGER NOT NULL DEFAULT 0,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_creator_applications_status_created
  ON creator_applications (status, created_at DESC);
