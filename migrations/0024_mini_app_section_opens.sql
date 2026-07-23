CREATE TABLE IF NOT EXISTS mini_app_section_opens (
  user_id TEXT NOT NULL,
  section TEXT NOT NULL,
  open_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, section)
);

CREATE INDEX IF NOT EXISTS idx_mini_app_section_opens_section
  ON mini_app_section_opens (section, open_count DESC, last_opened_at DESC);
