-- Campus OS database schema (MySQL 8+)
-- Run with:  mysql -u root -p --default-character-set=utf8mb4 < database/schema.sql
--
-- DEVELOPMENT ONLY: the next line wipes and recreates the database every time this file runs.
-- Remove it once you have real data you want to keep.
DROP DATABASE IF EXISTS campus_os;

CREATE DATABASE campus_os CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE campus_os;

-- ---------- Hierarchy: university -> college -> department ----------
CREATE TABLE universities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  city VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE colleges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  university_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE
);

CREATE TABLE departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  college_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE
);

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

-- ---------- People ----------
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role ENUM('student','faculty','admin','platform_admin') NOT NULL DEFAULT 'student',
  account_status ENUM('pending','active','rejected') NOT NULL DEFAULT 'active',
  affiliation_verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  department_id INT NOT NULL,
  roll_number VARCHAR(50) NOT NULL,
  program VARCHAR(100) NOT NULL DEFAULT 'B.Tech',
  program_id INT NULL,
  class_section_id INT NULL,
  year TINYINT NOT NULL,
  semester TINYINT NOT NULL,
  UNIQUE KEY uq_roll_in_department (department_id, roll_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL,
  FOREIGN KEY (class_section_id) REFERENCES class_sections(id) ON DELETE SET NULL
);

CREATE TABLE faculty (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  department_id INT NOT NULL,
  designation VARCHAR(100),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- Institution administrators are provisioned by trusted operators, not public signup.
CREATE TABLE admin_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  university_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE
);

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

-- ---------- Academics ----------
CREATE TABLE subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department_id INT NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(150) NOT NULL,
  semester TINYINT NOT NULL,
  faculty_id INT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (faculty_id) REFERENCES faculty(id) ON DELETE SET NULL
);

CREATE TABLE enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  UNIQUE KEY uq_enrollment (student_id, subject_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

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

CREATE TABLE timetable (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  day_of_week ENUM('Mon','Tue','Wed','Thu','Fri','Sat') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(50),
  class_type ENUM('Lecture','Practical','Tutorial') NOT NULL DEFAULT 'Lecture',
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  priority ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Per-student progress on each assignment
CREATE TABLE assignment_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  status ENUM('Pending','Completed') NOT NULL DEFAULT 'Pending',
  completed_at DATETIME NULL,
  UNIQUE KEY uq_submission (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  class_date DATE NOT NULL,
  status ENUM('present','absent','late') NOT NULL,
  marked_by INT NULL,
  UNIQUE KEY uq_attendance (student_id, subject_id, class_date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL
);

-- ---------- Campus life ----------
-- NULL college/department = visible to everyone in the university (or college)
CREATE TABLE announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  university_id INT NOT NULL,
  college_id INT NULL,
  department_id INT NULL,
  category ENUM('Academic','Event','Department','General') NOT NULL DEFAULT 'General',
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  audience VARCHAR(100) NOT NULL DEFAULT 'All Students',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  posted_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE,
  FOREIGN KEY (college_id) REFERENCES colleges(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  university_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  location VARCHAR(150),
  seats_info VARCHAR(100),
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  visibility ENUM('university','cross_campus') NOT NULL DEFAULT 'university',
  audience ENUM('everyone','students','faculty') NOT NULL DEFAULT 'everyone',
  eligible_program_id INT NULL,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE,
  FOREIGN KEY (eligible_program_id) REFERENCES programs(id) ON DELETE SET NULL
);

CREATE TABLE event_registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_registration (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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

CREATE TABLE resources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  university_id INT NULL,
  visibility ENUM('university','cross_campus') NOT NULL DEFAULT 'cross_campus',
  audience ENUM('everyone','students','faculty') NOT NULL DEFAULT 'everyone',
  eligible_program_id INT NULL,
  title VARCHAR(200) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  type ENUM('Notes','Practice','Tutorial') NOT NULL,
  format VARCHAR(50) NOT NULL,
  description TEXT,
  author VARCHAR(150),
  icon VARCHAR(16),
  url VARCHAR(500) NULL,
  uploaded_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (eligible_program_id) REFERENCES programs(id) ON DELETE SET NULL
);

CREATE TABLE opportunities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  university_id INT NULL,
  visibility ENUM('university','cross_campus') NOT NULL DEFAULT 'cross_campus',
  audience ENUM('everyone','students','faculty') NOT NULL DEFAULT 'students',
  eligible_program_id INT NULL,
  title VARCHAR(200) NOT NULL,
  company VARCHAR(150) NOT NULL,
  type ENUM('Internship','Training','Competition') NOT NULL,
  mode VARCHAR(30) NOT NULL,
  location VARCHAR(100) NOT NULL,
  stipend VARCHAR(100),
  deadline DATE NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  skills JSON NOT NULL,
  application_url VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE,
  FOREIGN KEY (eligible_program_id) REFERENCES programs(id) ON DELETE SET NULL
);

-- Each user's favourite resources and saved opportunities
CREATE TABLE saved_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  item_type ENUM('resource','event','opportunity') NOT NULL,
  item_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_saved (user_id, item_type, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================================
-- Sample data (development only): the same data your pages used to hardcode.
-- DEMO LOGINS (all three use the password  Campus@123 ):
--   alex.morgan@university.edu   student, Computer Science
--   faculty@university.edu       faculty, Computer Science (teaches CS201-CS205)
--   riya.patel@university.edu    student, Electronics and Communication
-- Riya exists so you can check that students in one department cannot see another
-- department's notices or data. Delete these accounts before a real launch.
-- =====================================================================
INSERT INTO universities (name, city) VALUES ('Campus University', 'Pune');
INSERT INTO colleges (university_id, name) VALUES (1, 'College of Engineering');
INSERT INTO departments (college_id, name) VALUES
  (1, 'Computer Science'),
  (1, 'Electronics and Communication');

INSERT INTO users (email, password_hash, full_name, role) VALUES
  ('alex.morgan@university.edu', 'a0da0b5c1bcd4351110327238bd1db40$e83529df2a606fad0def71a21b1e2fcf4d860391d339cc51a04894fad1c2174ae1b830f12ae7e33f51cf74072fff83fde191fcf23e133653cc60d4ccc21fa4d2', 'Alex Morgan', 'student'),
  ('faculty@university.edu',     '42fdcf8d672fe40bd63513f0080a945b$54a65478b6281ebc28db3716f59928acf1cdd458a890581a891b77391010ab096ab5c7877a73c0f6481e1b28e1202a9cdfd60e2ba05e70c80931550747dd5526', 'Dr. Meera Iyer', 'faculty'),
  ('riya.patel@university.edu',  '236f3ac2c92e83695bde1a885e5bfbe1$430329c9be3248a36d48a1798afd7f0cedae0c3ab0884d1d9f0e147eae72c238e2947ae5a9182b905173cc0dc0b4e80e27443bef695986e80caf0554978ab26b', 'Riya Patel', 'student');

INSERT INTO students (user_id, department_id, roll_number, program, year, semester) VALUES
  (1, 1, 'STU2026001', 'B.Tech', 2, 3),
  (3, 2, 'STU2026101', 'B.Tech', 2, 3);
INSERT INTO faculty (user_id, department_id, designation) VALUES (2, 1, 'Associate Professor');

INSERT INTO programs (department_id, name) VALUES (1, 'B.Tech'), (2, 'B.Tech');
INSERT INTO class_sections (program_id, year, semester, section_name)
SELECT p.id, 2, 3, 'A' FROM programs p WHERE p.name = 'B.Tech';
UPDATE students st JOIN programs p ON p.department_id = st.department_id AND p.name = st.program
JOIN class_sections cs ON cs.program_id = p.id AND cs.year = st.year AND cs.semester = st.semester AND cs.section_name = 'A'
SET st.program_id = p.id, st.class_section_id = cs.id;

INSERT INTO subjects (department_id, code, name, semester, faculty_id) VALUES
  (1, 'CS201', 'Data Structures',      3, 1),
  (1, 'CS202', 'Database Management',  3, 1),
  (1, 'CS203', 'Web Development',      3, 1),
  (1, 'CS204', 'Operating Systems',    3, 1),
  (1, 'CS205', 'Computer Networks',    3, 1),
  (2, 'EC201', 'Digital Electronics',  3, NULL),
  (2, 'EC202', 'Signals and Systems',  3, NULL);

INSERT INTO enrollments (student_id, subject_id) VALUES (1,1),(1,2),(1,3),(1,4),(1,5),(2,6),(2,7);
INSERT INTO subject_offerings (subject_id, class_section_id, faculty_id)
SELECT DISTINCT e.subject_id, st.class_section_id, sub.faculty_id
FROM enrollments e JOIN students st ON st.id = e.student_id
JOIN subjects sub ON sub.id = e.subject_id;

-- Timetable: the same four classes every weekday (Mon-Fri)
INSERT INTO timetable (subject_id, day_of_week, start_time, end_time, room, class_type)
SELECT sub.id, d.day_of_week, c.start_time, c.end_time, c.room, c.class_type
FROM (
  SELECT 'CS201' AS code, '09:00:00' AS start_time, '10:00:00' AS end_time, 'Room 301' AS room, 'Lecture'   AS class_type UNION ALL
  SELECT 'CS202',         '10:15:00',               '11:15:00',             'Lab 2',            'Practical'                UNION ALL
  SELECT 'CS203',         '11:30:00',               '12:30:00',             'Room 204',         'Lecture'                  UNION ALL
  SELECT 'CS204',         '14:00:00',               '15:00:00',             'Room 105',         'Lecture'
) c
JOIN subjects sub ON sub.code = c.code
CROSS JOIN (
  SELECT 'Mon' AS day_of_week UNION ALL SELECT 'Tue' UNION ALL SELECT 'Wed' UNION ALL SELECT 'Thu' UNION ALL SELECT 'Fri'
) d;

-- Assignments
INSERT INTO assignments (subject_id, title, due_date, priority, created_by) VALUES
  (1, 'Binary Search Tree Implementation', '2026-10-16', 'High',   2),
  (2, 'Database Normalization',            '2026-10-18', 'Medium', 2),
  (3, 'Responsive Landing Page',           '2026-10-20', 'High',   2),
  (4, 'Process Scheduling Algorithms',     '2026-10-14', 'Low',    2);

INSERT INTO assignment_submissions (assignment_id, student_id, status, completed_at) VALUES
  (1, 1, 'Pending', NULL),
  (2, 1, 'Pending', NULL),
  (3, 1, 'Pending', NULL),
  (4, 1, 'Completed', '2026-10-13 18:00:00');

-- Attendance: one record per past class, matching the totals your page showed
-- (CS201 24/28, CS202 21/25, CS203 27/30, CS204 18/24, CS205 20/22)
INSERT INTO attendance (student_id, subject_id, class_date, status, marked_by)
WITH RECURSIVE n AS (
  SELECT 1 AS i UNION ALL SELECT i + 1 FROM n WHERE i < 30
)
SELECT 1, s.subject_id, DATE_SUB('2026-10-14', INTERVAL n.i DAY),
       IF(n.i <= s.attended, 'present', 'absent'), 2
FROM n
JOIN (
  SELECT 1 AS subject_id, 28 AS total, 24 AS attended UNION ALL
  SELECT 2, 25, 21 UNION ALL
  SELECT 3, 30, 27 UNION ALL
  SELECT 4, 24, 18 UNION ALL
  SELECT 5, 22, 20
) s ON n.i <= s.total;

-- Announcements
INSERT INTO announcements (university_id, college_id, department_id, category, title, body, audience, pinned, posted_by, created_at) VALUES
  (1, NULL, NULL, 'Academic',   'Mid-semester examination schedule',
   'The mid-semester examination timetable will be shared by each department. Check your department notice board for updates.',
   'All Departments', TRUE, 2, '2026-10-12 10:00:00'),
  (1, NULL, NULL, 'Event',      'Annual Campus Hackathon',
   'Registrations are open for the upcoming campus hackathon. Form your teams and prepare your project ideas.',
   'All Students', TRUE, 2, '2026-10-11 10:00:00'),
  (1, 1, 1,       'Department', 'Web Development Lab Submission',
   'Students should ensure that all pending web development lab exercises are completed before the next practical session.',
   'Computer Science', FALSE, 2, '2026-10-10 10:00:00'),
  (1, NULL, NULL, 'General',    'Library timings update',
   'Please check the library notice board for the latest opening hours and study room availability.',
   'All Students', FALSE, 2, '2026-10-09 10:00:00'),
  (1, 1, 2,       'Department', 'Electronics Lab Safety Briefing',
   'All Electronics and Communication students must attend the lab safety briefing before using the lab equipment.',
   'Electronics and Communication', FALSE, NULL, '2026-10-08 10:00:00');

-- Events
INSERT INTO events (university_id, title, category, description, location, seats_info, starts_at) VALUES
  (1, 'Campus Innovation Hackathon', 'Technology',
   'Collaborate with students to build creative solutions to real campus and community problems.',
   'Innovation Lab', 'Team registration', '2026-10-20 09:00:00'),
  (1, 'Career Preparation Workshop', 'Career',
   'Learn about resumes, technical interviews, communication, and internship preparation.',
   'Seminar Hall A', 'Open to all students', '2026-10-23 11:00:00'),
  (1, 'Web Development Bootcamp', 'Workshop',
   'Practice building responsive interfaces and learn how to organize a modern web project.',
   'Computer Lab 2', 'Limited seats', '2026-10-27 10:00:00'),
  (1, 'Inter-Department Sports Meet', 'Sports',
   'Participate in friendly competitions and represent your department in the annual sports meet.',
   'University Sports Ground', 'Registration required', '2026-11-02 08:30:00');

-- Resources
INSERT INTO resources (title, subject, type, format, description, author, icon) VALUES
  ('Binary Trees — Complete Notes', 'Data Structures', 'Notes', 'PDF',
   'Revision notes covering tree terminology, traversals, binary search trees, and common operations.',
   'Computer Science Department', '📘'),
  ('SQL Practice Workbook', 'Database Management', 'Practice', 'Exercises',
   'Practice SELECT queries, joins, grouping, subqueries, and database constraints.',
   'Database Faculty', '🗃️'),
  ('React Fundamentals', 'Web Development', 'Tutorial', 'Guide',
   'Learn components, props, state, events, lists, and how to organize a React application.',
   'Web Development Department', '⚛️'),
  ('Operating Systems Revision Sheet', 'Operating Systems', 'Notes', 'PDF',
   'Quick revision of processes, threads, scheduling, synchronization, and deadlocks.',
   'Computer Science Department', '💻'),
  ('Data Structures Interview Problems', 'Data Structures', 'Practice', 'Problem Set',
   'A practice collection covering arrays, linked lists, stacks, queues, trees, and searching.',
   'Campus Coding Club', '🧩'),
  ('Computer Networks — Unit 1', 'Computer Networks', 'Notes', 'PDF',
   'Study network fundamentals, layered architecture, transmission media, and network devices.',
   'Computer Science Department', '🌐'),
  ('Python for Data Analysis', 'Programming', 'Tutorial', 'Guide',
   'An introductory learning guide to Python data handling and basic analysis workflows.',
   'Student Learning Community', '🐍');

-- Career opportunities
INSERT INTO opportunities (title, company, type, mode, location, stipend, deadline, category, description, skills) VALUES
  ('Frontend Developer Intern', 'Campus Tech Labs', 'Internship', 'Hybrid', 'Bengaluru', '₹15,000/month', '2026-10-25', 'Development',
   'Build responsive interfaces using React, JavaScript, and CSS while working with a product team.',
   JSON_ARRAY('React', 'JavaScript', 'CSS')),
  ('Software Engineer Intern', 'CodeSphere', 'Internship', 'Remote', 'Remote', '₹20,000/month', '2026-10-28', 'Development',
   'Practice data structures, problem solving, and software development on real-world projects.',
   JSON_ARRAY('Java', 'DSA', 'Git')),
  ('Data Analytics Trainee', 'InsightWorks', 'Training', 'On-site', 'Pune', 'Certificate program', '2026-11-02', 'Data',
   'Learn how to clean, explore, and communicate data through practical guided exercises.',
   JSON_ARRAY('Python', 'SQL', 'Excel')),
  ('UI/UX Design Intern', 'Pixel Studio', 'Internship', 'Hybrid', 'Mumbai', '₹12,000/month', '2026-11-05', 'Design',
   'Help create user flows, wireframes, and accessible interfaces for digital products.',
   JSON_ARRAY('Figma', 'Prototyping', 'Design')),
  ('Campus Product Challenge', 'University Innovation Cell', 'Competition', 'On-campus', 'Your university', 'Prizes and mentorship', '2026-11-10', 'Other',
   'Pitch a student-focused product idea and work with a team to develop a prototype.',
   JSON_ARRAY('Teamwork', 'Problem solving', 'Presentation'));
