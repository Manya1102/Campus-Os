-- Make sharing scope explicit for events, resources, and opportunities.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS visibility varchar(20) NOT NULL DEFAULT 'university';

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS university_id integer,
  ADD COLUMN IF NOT EXISTS visibility varchar(20) NOT NULL DEFAULT 'cross_campus';

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS university_id integer,
  ADD COLUMN IF NOT EXISTS visibility varchar(20) NOT NULL DEFAULT 'cross_campus',
  ADD COLUMN IF NOT EXISTS application_url varchar(500);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'events'::regclass AND conname = 'events_visibility_check') THEN
    ALTER TABLE events ADD CONSTRAINT events_visibility_check CHECK (visibility IN ('university', 'cross_campus'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'resources'::regclass AND conname = 'resources_visibility_check') THEN
    ALTER TABLE resources ADD CONSTRAINT resources_visibility_check CHECK (visibility IN ('university', 'cross_campus'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'opportunities'::regclass AND conname = 'opportunities_visibility_check') THEN
    ALTER TABLE opportunities ADD CONSTRAINT opportunities_visibility_check CHECK (visibility IN ('university', 'cross_campus'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'resources'::regclass AND conname = 'fk_resources_university') THEN
    ALTER TABLE resources ADD CONSTRAINT fk_resources_university
      FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'opportunities'::regclass AND conname = 'fk_opportunities_university') THEN
    ALTER TABLE opportunities ADD CONSTRAINT fk_opportunities_university
      FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE;
  END IF;
END $$;
