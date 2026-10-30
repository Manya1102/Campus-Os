-- Make sharing scope explicit for campus events, resources and opportunities.
-- Existing resources and opportunities keep their previous cross-campus visibility.
USE campus_os;

ALTER TABLE events
  ADD COLUMN visibility ENUM('university','cross_campus') NOT NULL DEFAULT 'university'
  AFTER ends_at;

ALTER TABLE resources
  ADD COLUMN university_id INT NULL AFTER id,
  ADD COLUMN visibility ENUM('university','cross_campus') NOT NULL DEFAULT 'cross_campus' AFTER university_id,
  ADD CONSTRAINT fk_resources_university
    FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE;

ALTER TABLE opportunities
  ADD COLUMN university_id INT NULL AFTER id,
  ADD COLUMN visibility ENUM('university','cross_campus') NOT NULL DEFAULT 'cross_campus' AFTER university_id,
  ADD COLUMN application_url VARCHAR(500) NULL AFTER skills,
  ADD CONSTRAINT fk_opportunities_university
    FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE;
