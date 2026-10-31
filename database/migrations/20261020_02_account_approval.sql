-- Add manual review status for newly created accounts.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status varchar(20) NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND conname = 'users_account_status_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_account_status_check
      CHECK (account_status IN ('pending', 'active', 'rejected'));
  END IF;
END $$;
