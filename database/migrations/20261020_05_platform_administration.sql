USE campus_os;
ALTER TABLE users MODIFY COLUMN role ENUM('student','faculty','admin','platform_admin') NOT NULL DEFAULT 'student';
