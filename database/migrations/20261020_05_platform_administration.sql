-- Allow platform-wide administrator accounts.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN role SET DEFAULT 'student';
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'faculty', 'admin', 'platform_admin'));
