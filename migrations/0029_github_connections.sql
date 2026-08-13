CREATE TABLE IF NOT EXISTS github_connections (
  user_id TEXT PRIMARY KEY,
  github_user_id TEXT NOT NULL,
  github_login TEXT NOT NULL,
  selected_installation_id TEXT,
  selected_repo_id TEXT,
  selected_repo_full_name TEXT,
  selected_default_branch TEXT,
  connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_github_connections_github_user
  ON github_connections (github_user_id, user_id);

CREATE TABLE IF NOT EXISTS github_user_installations (
  user_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  account_login TEXT,
  account_type TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, installation_id)
);

CREATE INDEX IF NOT EXISTS idx_github_installations_installation
  ON github_user_installations (installation_id);

CREATE TABLE IF NOT EXISTS github_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_github_oauth_states_expiry
  ON github_oauth_states (expires_at);
