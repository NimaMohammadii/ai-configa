-- Retire receipts left pending before this release so they cannot block or
-- credit a user's next Toman purchase. New receipts remain protected against
-- duplicate submissions by the application-level pending check.
UPDATE payment_receipts
SET status = 'superseded', reviewed_at = CURRENT_TIMESTAMP
WHERE status = 'pending';

DELETE FROM pending_payments;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_one_pending_per_user
ON payment_receipts (user_id)
WHERE status = 'pending';
