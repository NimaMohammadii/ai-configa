CREATE TABLE IF NOT EXISTS referrals (
  referred_user_id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  source_section TEXT NOT NULL DEFAULT 'tts',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_created
  ON referrals (referrer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_rewards (
  referrer_user_id TEXT NOT NULL,
  milestone INTEGER NOT NULL,
  credits INTEGER NOT NULL DEFAULT 300,
  credited_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (referrer_user_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer
  ON referral_rewards (referrer_user_id, milestone DESC);
