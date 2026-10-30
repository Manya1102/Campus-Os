USE campus_os;

-- Structured academic hierarchy. The legacy students.program column is retained
-- during migration so existing profile consumers continue to work.
CREATE TABLE programs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_program_department_name (department_id, name),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
);

CREATE TABLE class_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id INT NOT NULL,
  year TINYINT NOT NULL,
  semester TINYINT NOT NULL,
  section_name VARCHAR(30) NOT NULL DEFAULT 'A',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_section (program_id, year, semester, section_name),
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

ALTER TABLE students
  MODIFY COLUMN program VARCHAR(100) NOT NULL DEFAULT 'B.Tech',
  ADD COLUMN program_id INT NULL,
  ADD COLUMN class_section_id INT NULL,
  ADD CONSTRAINT fk_students_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_students_class_section FOREIGN KEY (class_section_id) REFERENCES class_sections(id) ON DELETE SET NULL;

INSERT IGNORE INTO programs (department_id, name)
SELECT DISTINCT department_id, program FROM students;
UPDATE students st JOIN programs p ON p.department_id = st.department_id AND p.name = st.program
SET st.program_id = p.id;
INSERT IGNORE INTO class_sections (program_id, year, semester, section_name)
SELECT DISTINCT program_id, year, semester, 'A' FROM students WHERE program_id IS NOT NULL;
UPDATE students st JOIN class_sections cs
  ON cs.program_id = st.program_id AND cs.year = st.year AND cs.semester = st.semester AND cs.section_name = 'A'
SET st.class_section_id = cs.id;

CREATE TABLE subject_offerings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  class_section_id INT NOT NULL,
  faculty_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_subject_section (subject_id, class_section_id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (class_section_id) REFERENCES class_sections(id) ON DELETE CASCADE,
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE SET NULL
);

INSERT IGNORE INTO subject_offerings (subject_id, class_section_id, faculty_id)
SELECT DISTINCT e.subject_id, st.class_section_id, sub.faculty_id
FROM enrollments e JOIN students st ON st.id = e.student_id
JOIN subjects sub ON sub.id = e.subject_id
WHERE st.class_section_id IS NOT NULL;

ALTER TABLE resources
  ADD COLUMN audience ENUM('everyone','students','faculty') NOT NULL DEFAULT 'everyone',
  ADD COLUMN eligible_program_id INT NULL,
  ADD CONSTRAINT fk_resources_program FOREIGN KEY (eligible_program_id) REFERENCES programs(id) ON DELETE SET NULL;
ALTER TABLE opportunities
  ADD COLUMN audience ENUM('everyone','students','faculty') NOT NULL DEFAULT 'students',
  ADD COLUMN eligible_program_id INT NULL,
  ADD CONSTRAINT fk_opportunities_program FOREIGN KEY (eligible_program_id) REFERENCES programs(id) ON DELETE SET NULL;
ALTER TABLE events
  ADD COLUMN audience ENUM('everyone','students','faculty') NOT NULL DEFAULT 'everyone',
  ADD COLUMN eligible_program_id INT NULL,
  ADD CONSTRAINT fk_events_program FOREIGN KEY (eligible_program_id) REFERENCES programs(id) ON DELETE SET NULL;

-- Administrators pre-load verified institutional identities. Signup must match
-- an unused roster record by institution, role and institutional identifier.
CREATE TABLE affiliation_roster (
  id INT AUTO_INCREMENT PRIMARY KEY,
  university_id INT NOT NULL,
  department_id INT NOT NULL,
  role ENUM('student','faculty') NOT NULL,
  institutional_id VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  program_id INT NULL,
  year TINYINT NULL,
  semester TINYINT NULL,
  section_name VARCHAR(30) NULL DEFAULT 'A',
  designation VARCHAR(100) NULL,
  invite_code_hash CHAR(64) NULL,
  claimed_by INT NULL,
  claimed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roster_identity (university_id, role, institutional_id),
  UNIQUE KEY uq_roster_email (university_id, email),
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
  FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE users ADD COLUMN affiliation_verified_at TIMESTAMP NULL;
