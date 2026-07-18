ALTER TABLE bot_users ADD COLUMN return_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_users ADD COLUMN last_returned_at TEXT;
CREATE INDEX IF NOT EXISTS idx_bot_users_return_count ON bot_users (return_count DESC, last_returned_at DESC);
