-- Relational schema for Talent Network Search
-- Target database: PostgreSQL 16 / PGlite

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY CHECK (BTRIM(id) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  location TEXT,
  referred_by TEXT REFERENCES people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (referred_by IS NULL OR referred_by <> id)
);

CREATE TABLE IF NOT EXISTS skills (
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  skill TEXT NOT NULL CHECK (BTRIM(skill) <> ''),
  normalized_skill TEXT GENERATED ALWAYS AS (LOWER(BTRIM(skill))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (person_id, skill)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_normalized_unique
  ON skills (person_id, normalized_skill);

CREATE TABLE IF NOT EXISTS employment (
  id BIGSERIAL PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  company TEXT NOT NULL CHECK (BTRIM(company) <> ''),
  normalized_company TEXT GENERATED ALWAYS AS
    (LOWER(BTRIM(REGEXP_REPLACE(company, '\s+', ' ', 'g')))) STORED,
  title TEXT NOT NULL CHECK (BTRIM(title) <> ''),
  from_date TEXT NOT NULL CHECK (from_date ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  to_date TEXT CHECK (to_date IS NULL OR to_date ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CHECK (to_date IS NULL OR to_date >= from_date),
  UNIQUE (person_id, normalized_company, from_date)
);

CREATE INDEX IF NOT EXISTS idx_employment_company
  ON employment (normalized_company, from_date, to_date);

CREATE TABLE IF NOT EXISTS connections (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('WORKED_WITH', 'REFERRED')),
  source_employment_id BIGINT REFERENCES employment(id) ON DELETE CASCADE,
  target_employment_id BIGINT REFERENCES employment(id) ON DELETE CASCADE,
  overlap_from TEXT,
  overlap_to TEXT,
  overlap_months INTEGER,
  as_of_month TEXT NOT NULL CHECK (as_of_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  referrer_id TEXT REFERENCES people(id) ON DELETE CASCADE,
  referee_id TEXT REFERENCES people(id) ON DELETE CASCADE,
  traversal_direction TEXT NOT NULL CHECK
    (traversal_direction IN ('FORWARD', 'REVERSE', 'SYMMETRIC')),
  CHECK (source_id <> target_id),
  CHECK (overlap_from IS NULL OR overlap_from ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CHECK (overlap_to IS NULL OR overlap_to ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CHECK (overlap_to IS NULL OR (overlap_from IS NOT NULL AND overlap_to >= overlap_from)),
  CHECK (
    (connection_type = 'WORKED_WITH'
      AND source_employment_id IS NOT NULL
      AND target_employment_id IS NOT NULL
      AND overlap_from IS NOT NULL
      AND overlap_months > 0
      AND referrer_id IS NULL
      AND referee_id IS NULL
      AND traversal_direction = 'SYMMETRIC')
    OR
    (connection_type = 'REFERRED'
      AND source_employment_id IS NULL
      AND target_employment_id IS NULL
      AND overlap_from IS NULL
      AND overlap_to IS NULL
      AND overlap_months IS NULL
      AND referrer_id IS NOT NULL
      AND referee_id IS NOT NULL
      AND referrer_id <> referee_id
      AND traversal_direction IN ('FORWARD', 'REVERSE'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_employment_reason
  ON connections
    (source_id, target_id, source_employment_id, target_employment_id)
  WHERE connection_type = 'WORKED_WITH';

CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_referral_reason
  ON connections (source_id, target_id, referrer_id, referee_id)
  WHERE connection_type = 'REFERRED';

CREATE INDEX IF NOT EXISTS idx_connections_traversal
  ON connections (source_id, target_id);

CREATE TABLE IF NOT EXISTS import_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  input_hash TEXT NOT NULL,
  effective_snapshot_hash TEXT NOT NULL,
  as_of_month TEXT NOT NULL CHECK (as_of_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  committed_at TIMESTAMPTZ NOT NULL
);
