USE campus_os;

CREATE TABLE academic_calendar_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  university_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  category ENUM('Term dates','Examination','Registration','Holiday','Other') NOT NULL DEFAULT 'Other',
  starts_on DATE NOT NULL,
  ends_on DATE NULL,
  description TEXT,
  audience ENUM('everyone','students','faculty') NOT NULL DEFAULT 'everyone',
  eligible_program_id INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_calendar_university_dates (university_id, starts_on, ends_on),
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE,
  FOREIGN KEY (eligible_program_id) REFERENCES programs(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
