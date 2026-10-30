-- Add university-scoped administration to an existing Campus OS database.
-- Run against the existing campus_os database; this migration does not erase data.
USE campus_os;

CREATE TABLE IF NOT EXISTS admin_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  university_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE
);
