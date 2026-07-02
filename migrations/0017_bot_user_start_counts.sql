ALTER TABLE bot_users ADD COLUMN start_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_users ADD COLUMN last_started_at TEXT;
