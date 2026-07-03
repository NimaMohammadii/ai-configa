CREATE TABLE IF NOT EXISTS credit_usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'tts',
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_log_created ON credit_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_usage_log_user_created ON credit_usage_log (user_id, created_at DESC);

INSERT OR IGNORE INTO credit_usage_log (id, user_id, credits, reason, metadata, created_at)
SELECT 'tts_history:' || rowid, user_id, credits, 'tts_history_backfill', NULL, created_at
FROM tts_history
WHERE credits > 0;
