CREATE TABLE IF NOT EXISTS user_state (
  user_id TEXT PRIMARY KEY,
  voice TEXT NOT NULL DEFAULT 'Nora',
  output TEXT NOT NULL DEFAULT 'MP3',
  page INTEGER NOT NULL DEFAULT 0,
  menu_message_id INTEGER,
  language TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demo_cache (
  voice TEXT PRIMARY KEY,
  audio_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demo_cache_v2 (
  cache_key TEXT PRIMARY KEY,
  voice TEXT NOT NULL,
  language TEXT NOT NULL,
  audio_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bot_users (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  return_count INTEGER NOT NULL DEFAULT 0,
  last_returned_at TEXT,
  mini_app_open_count INTEGER NOT NULL DEFAULT 0,
  last_mini_app_opened_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_voice_settings (
  user_id TEXT PRIMARY KEY,
  stability REAL NOT NULL DEFAULT 0.5,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_credits (
  user_id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_payments (
  user_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS pending_star_credit_inputs (
  user_id TEXT PRIMARY KEY,
  message_id INTEGER NOT NULL,
  credits INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS star_payments (
  charge_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tts_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  voice TEXT NOT NULL,
  language TEXT NOT NULL,
  credits INTEGER NOT NULL,
  audio_base64 TEXT NOT NULL DEFAULT '',
  file_id TEXT,
  file_type TEXT,
  telegram_message_id INTEGER,
  source TEXT NOT NULL DEFAULT 'chatbot',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tts_history_user_created ON tts_history (user_id, created_at DESC);


CREATE TABLE IF NOT EXISTS credit_usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'tts',
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bot_users_return_count ON bot_users (return_count DESC, last_returned_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_users_mini_app_open_count ON bot_users (mini_app_open_count DESC, last_mini_app_opened_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_credit_usage_log_created ON credit_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_usage_log_user_created ON credit_usage_log (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_actions (
  admin_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_user_id TEXT,
  page INTEGER NOT NULL DEFAULT 0,
  chat_id TEXT,
  message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS fa_join_bonuses (
  user_id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);



CREATE TABLE IF NOT EXISTS initial_start_bonuses (
  user_id TEXT PRIMARY KEY,
  credits INTEGER NOT NULL,
  language TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mini_app_wheel_spins (
  user_id TEXT PRIMARY KEY,
  last_spin_at INTEGER NOT NULL DEFAULT 0,
  reward INTEGER NOT NULL DEFAULT 0,
  spin_id TEXT,
  spin_count INTEGER NOT NULL DEFAULT 0,
  total_reward INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
