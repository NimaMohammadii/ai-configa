CREATE TABLE IF NOT EXISTS chatgpt_oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT,
  redirect_uris_json TEXT NOT NULL,
  grant_types_json TEXT NOT NULL,
  response_types_json TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chatgpt_oauth_login_sessions (
  session_id_hash TEXT PRIMARY KEY,
  browser_secret_hash TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  oauth_state TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  telegram_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  completion_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_oauth_login_expiry
  ON chatgpt_oauth_login_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_chatgpt_oauth_login_client
  ON chatgpt_oauth_login_sessions (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chatgpt_oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_oauth_code_expiry
  ON chatgpt_oauth_authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS chatgpt_oauth_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  access_expires_at TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  refresh_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_oauth_token_user
  ON chatgpt_oauth_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chatgpt_oauth_token_access_expiry
  ON chatgpt_oauth_tokens (access_expires_at);

CREATE INDEX IF NOT EXISTS idx_chatgpt_oauth_token_refresh_expiry
  ON chatgpt_oauth_tokens (refresh_expires_at);

CREATE TABLE IF NOT EXISTS chatgpt_audio_links (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  history_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_audio_links_expiry
  ON chatgpt_audio_links (expires_at);

CREATE INDEX IF NOT EXISTS idx_chatgpt_audio_links_history
  ON chatgpt_audio_links (history_id, user_id);
