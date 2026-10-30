-- Add manual review for new student and faculty accounts.
-- Existing users stay active; new signups are marked pending by the API.
USE campus_os;

ALTER TABLE users
  ADD COLUMN account_status ENUM('pending','active','rejected') NOT NULL DEFAULT 'active'
  AFTER role;
