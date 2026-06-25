CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('language_prompt_enabled', '1');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('language_command_enabled', '1');
