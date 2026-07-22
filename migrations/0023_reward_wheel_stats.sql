CREATE TABLE IF NOT EXISTS mini_app_wheel_spins (
  user_id TEXT PRIMARY KEY,
  last_spin_at INTEGER NOT NULL DEFAULT 0,
  reward INTEGER NOT NULL DEFAULT 0,
  spin_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE mini_app_wheel_spins ADD COLUMN spin_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mini_app_wheel_spins ADD COLUMN total_reward INTEGER NOT NULL DEFAULT 0;
UPDATE mini_app_wheel_spins SET spin_count = 1 WHERE spin_count = 0 AND reward > 0;
UPDATE mini_app_wheel_spins SET total_reward = reward WHERE total_reward = 0 AND reward > 0;
