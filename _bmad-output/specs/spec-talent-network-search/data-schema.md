# Data schema and ingestion contract

## 1. Relational schema

Target database: PostgreSQL 16.

```sql
CREATE TABLE people (
  id TEXT PRIMARY KEY CHECK (BTRIM(id) <> ''),
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  location TEXT,
  referred_by TEXT REFERENCES people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (referred_by IS NULL OR referred_by <> id)
);

CREATE TABLE skills (
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  skill TEXT NOT NULL CHECK (BTRIM(skill) <> ''),
  normalized_skill TEXT GENERATED ALWAYS AS (LOWER(BTRIM(skill))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (person_id, skill)
);

CREATE UNIQUE INDEX idx_skills_normalized_unique
  ON skills (person_id, normalized_skill);

CREATE TABLE employment (
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

CREATE INDEX idx_employment_company
  ON employment (normalized_company, from_date, to_date);

CREATE TABLE connections (
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

CREATE UNIQUE INDEX idx_connections_employment_reason
  ON connections
    (source_id, target_id, source_employment_id, target_employment_id)
  WHERE connection_type = 'WORKED_WITH';

CREATE UNIQUE INDEX idx_connections_referral_reason
  ON connections (source_id, target_id, referrer_id, referee_id)
  WHERE connection_type = 'REFERRED';

CREATE INDEX idx_connections_traversal
  ON connections (source_id, target_id);

CREATE TABLE import_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  input_hash TEXT NOT NULL,
  effective_snapshot_hash TEXT NOT NULL,
  as_of_month TEXT NOT NULL CHECK (as_of_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  committed_at TIMESTAMPTZ NOT NULL
);
```

Connection explanations and company identity are derived from the referenced employment rows; there is no duplicated writable company key or `edge_details` value in `connections`.

## 2. Input validation

The accepted snapshot shape is:

```ts
type TalentGraphSeed = {
  _readme?: string;
  companies?: Array<{
    name: string;
    industry?: string;
    headcount?: number;
    hq?: string;
  }>;
  people: Array<{
    id: string;
    name: string;
    location?: string | null;
    skills: string[];
    employment: Array<{
      company: string;
      title: string;
      from: string;
      to: string | null;
    }>;
    referred_by?: string | null;
  }>;
};
```

`_readme` and `companies` are accepted for compatibility with the bundled source but are not persisted or used to authorize employment company names. Validate the complete payload before mutating durable tables:

- The root is an object with a `people` array and only the fields defined above.
- Person IDs are unique, trimmed, and non-empty.
- Names, companies, titles, and skills are non-empty after trimming.
- Each person's skills are unique after normalization.
- Each person's employments are unique by normalized company and `from` month.
- Dates match `YYYY-MM`, `to >= from`, and an ongoing record cannot start after the import's `asOfMonth`.
- `referred_by == id` is rejected.
- A referral to an ID absent from the same snapshot becomes null and creates a warning; reciprocal referrals between two present people are valid.
- The raw request body cannot exceed 1 MiB and is rejected before JSON parsing.

Any validation error rejects the complete request before staging. An explicit `{ "data": { "people": [] } }` is valid and intentionally clears the graph.

## 3. Authoritative snapshot transaction

One import performs this sequence in a single transaction:

```text
Acquire transaction advisory lock
Capture UTC asOfMonth
Validate and canonicalize request
Populate temporary stage_people, stage_skills, and stage_employment
Upsert all people with referred_by temporarily null
Delete people absent from stage_people
Apply normalized referral values after all people exist
Delete and upsert skills against normalized identity
Delete and upsert employment against its natural key
Delete and rebuild all directed connection evidence
Write import_state hashes and asOfMonth
Commit
```

Use `pg_try_advisory_xact_lock` with one application-defined import key. Failure to acquire it returns `409 IMPORT_IN_PROGRESS`; imports never interleave.

### People and referrals

The incoming `people` array is the complete authoritative set. Deleting absent people cascades through skills, employment, and derived evidence. Referral assignment happens afterward, so forward references are valid. Dangling targets were already converted to null during validation and reported as warnings.

### Skills

Reconcile by `(person_id, normalized_skill)`. The payload rejects duplicate normalized skills for one person. On a normalized conflict, update `skill` to the incoming trimmed spelling so case-only changes reconcile exactly.

```sql
INSERT INTO skills (person_id, skill)
SELECT person_id, skill FROM stage_skills
ON CONFLICT (person_id, normalized_skill)
DO UPDATE SET skill = EXCLUDED.skill;
```

### Employment

Reconcile by `(person_id, normalized_company, from_date)`. The generated company key cannot diverge from display text. Update `company`, `title`, and `to_date` on conflict, and delete natural keys missing from staging.

### Connection rebuild

Rebuild from reconciled source tables using the rules in `connection-rules.md`:

- Write both directed employment reasons for every qualifying stint pair.
- Write forward and reverse directed reasons for every referral fact.
- Preserve concurrent reasons as separate evidence rows.
- Store the single captured `asOfMonth` and calculated overlap duration on each row.

For `talent-graph-seed.json`, the rebuild produces 14 logical employment reasons and 6 logical referral reasons: 20 reasons and 40 directed evidence rows.

## 4. Canonical hashes and statistics

Canonical input hashing sorts object keys and source arrays by their identities after trimming and normalization. `inputHash` covers canonical user data. `effectiveSnapshotHash` covers `inputHash` plus `asOfMonth`, because ongoing overlap duration can change at a month boundary.

`idempotentCheckPassed` is true when the newly calculated effective hash equals the previously committed effective hash. It is false on the first import and whenever data or `asOfMonth` changes.

`staleRecordsPurged` is the sum of deleted people, skills, employments, and referral values cleared by reconciliation. Deleting and rebuilding derived connection rows is excluded. The response also reports each component separately.
