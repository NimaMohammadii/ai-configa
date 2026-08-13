ALTER TABLE ai_chat_preferences
  ADD COLUMN reasoning_effort TEXT NOT NULL DEFAULT 'medium';

CREATE TABLE IF NOT EXISTS ai_user_memory (
  user_id TEXT PRIMARY KEY,
  memories_json TEXT NOT NULL DEFAULT '[]',
  memory_bytes INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
