CREATE TABLE IF NOT EXISTS tts_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  voice TEXT NOT NULL,
  language TEXT NOT NULL,
  credits INTEGER NOT NULL,
  audio_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tts_history_user_created ON tts_history (user_id, created_at DESC);
