CREATE TABLE IF NOT EXISTS ai_chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  user_message TEXT NOT NULL DEFAULT '',
  assistant_message TEXT NOT NULL DEFAULT '',
  attachment_name TEXT,
  response_type TEXT NOT NULL DEFAULT 'text',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_history_user_created
  ON ai_chat_history (user_id, created_at DESC, id DESC);
