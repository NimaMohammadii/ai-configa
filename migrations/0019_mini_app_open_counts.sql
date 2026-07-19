ALTER TABLE bot_users ADD COLUMN mini_app_open_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_users ADD COLUMN last_mini_app_opened_at TEXT;
CREATE INDEX IF NOT EXISTS idx_bot_users_mini_app_open_count ON bot_users (mini_app_open_count DESC, last_mini_app_opened_at DESC);
