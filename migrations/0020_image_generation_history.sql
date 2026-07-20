CREATE TABLE IF NOT EXISTS image_generation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  chat_id TEXT,
  kind TEXT NOT NULL,
  prompt TEXT NOT NULL,
  file_id TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  filename TEXT,
  size TEXT,
  source_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_image_generation_history_user
  ON image_generation_history (user_id, id DESC);
