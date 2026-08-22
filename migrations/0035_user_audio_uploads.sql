CREATE TABLE IF NOT EXISTS user_audio_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  duration INTEGER NOT NULL DEFAULT 0,
  telegram_message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_audio_uploads_user_created
  ON user_audio_uploads (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_audio_uploads_message_file
  ON user_audio_uploads (user_id, telegram_message_id, file_id);
