---
title: 'Story 1: Data Model, Constraints & Ingestion Engine'
type: 'feature'
created: '2026-09-03'
baseline_revision: 'NO_VCS'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/data-schema.md'
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/connection-rules.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Raw seed data contains forward references, variable casing, and complex relations that must be imported reliably into a database with strict relational constraints and idempotency. Without atomic staging synchronization and verified connection derivation, repeated imports risk duplicate records, phantom edges, and security vulnerabilities.

**Approach:** Build a dual-mode database layer (PGlite in-memory / pg PostgreSQL) with strict PostgreSQL 16 schema, check constraints, and generated columns. Implement transactional staging synchronization that imports talent snapshots, handles forward references in two phases, cascades deletions, and reconstructs 20 logical connections (40 symmetric directed rows) with canonical hashes.

## Boundaries & Constraints

**Always:**
- Use PGlite by default when `DATABASE_URL` is omitted, and standard PostgreSQL when `DATABASE_URL` is present.
- Enforce check constraints: date format regex `^\d{4}-(0[1-9]|1[0-2])$`, `to_date >= from_date`, `source_id != target_id`, non-empty strings.
- Enforce case-insensitive unique skills index `(person_id, normalized_skill)` and employment interval unique constraint `(person_id, normalized_company, from_date)`.
- Use two-phase staging synchronization within a single ACID transaction to handle forward references (e.g. `p1` referencing `p4`).
- Rebuilding connections from the bundled `talent-graph-seed.json` must produce exactly 14 people, 16 employments, 38 skills, 20 logical connections, and 40 directed rows (28 `WORKED_WITH`, 12 `REFERRED`).
- Provide canonical SHA-256 `inputHash` and `effectiveSnapshotHash`. Second import of the identical seed must return `idempotentCheckPassed: true`.

**Block If:**
- Upstream schema or companion rules in `data-schema.md` require unsupported SQLite-specific syntax (PostgreSQL 16 syntax must be preserved).

**Never:**
- Never accept arbitrary server file paths for imports; accept parsed JSON payloads or default to the bundled seed.
- Never allow self-referrals (`referred_by === id`) or self-connections (`source_id === target_id`).
- Never leave phantom connection rows when an employment stint or person is deleted on re-import.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default Seed Import | Bundled `talent-graph-seed.json` | 14 people, 16 employments, 38 skills, 20 logical connections (40 directed rows), `idempotentCheckPassed: false` on run 1 | No error |
| Idempotent Re-import | Re-running bundled seed immediately | Same hashes, `idempotentCheckPassed: true`, 0 source mutations | No error |
| Forward Reference | `p1` referencing `p4` (which appears later in seed) | `p1.referred_by` successfully links to `p4` without foreign key error | Handled via 2-phase staging |
| Dangling Referral Target | Person referencing `p999` (absent from seed) | `referred_by` set to `null`, warning emitted | Non-fatal warning |
| Self-Referral | Person referencing self (`p1` referencing `p1`) | Import rejected atomically | Validation error `400` / throw |
| Invalid Date Format | Employment with `from: "2021/03"` | Import rejected atomically | Validation error `400` / throw |
| Empty Snapshot | `{ "people": [] }` | Clears all tables atomically; reports 0 counts | Valid clearing snapshot |

</intent-contract>

## Code Map

- `src/server/db/schema.sql` -- DDL definitions for `people`, `skills`, `employment`, `connections`, `import_state`, indexes, and constraints.
- `src/server/db/client.ts` -- Database client manager supporting PGlite and pg Pool.
- `src/server/db/types.ts` -- TypeScript type definitions for database models, seed schema, and import results.
- `src/server/db/import.ts` -- Validation, staging synchronization, hash computation, and connection derivation engine.
- `tests/import.test.ts` -- Vitest integration test suite verifying schema, seed import, counts, idempotency, and edge cases.

## Tasks & Acceptance

**Execution:**
- `src/server/db/schema.sql` -- Create DDL matching `data-schema.md` Section 1 -- Establishes schema and integrity constraints.
- `src/server/db/types.ts` -- Define TypeScript types for TalentGraphSeed, Database Entities, and ImportResult -- Provides end-to-end type safety.
- `src/server/db/client.ts` -- Implement connection factory supporting `@electric-sql/pglite` and `pg` -- Allows zero-config embedded testing and full Postgres runtime.
- `src/server/db/import.ts` -- Implement snapshot validation, staging sync transaction, and connection derivation -- Delivers CAP-1 and full reconciliation.
- `tests/import.test.ts` -- Implement comprehensive Vitest test suite for data import and constraints -- Validates CAP-1 success signal.

**Acceptance Criteria:**
- Given an uninitialized database, when schema is applied, then all 5 tables, check constraints, and partial unique indexes are created successfully.
- Given the bundled `talent-graph-seed.json`, when imported, then exactly 14 people, 16 employments, 38 skills, 20 logical connections, and 40 directed rows are persisted.
- Given a second consecutive import of the bundled seed, when executed, then `idempotentCheckPassed` is true and canonical hashes match.
- Given a seed with `p1` referencing `p4`, when imported, then `p1.referred_by` equals `'p4'`.
- Given an import where an existing person's employment is removed from the payload, when re-imported, then the employment and its derived connection rows are deleted.

## Verification

**Commands:**
- `npx vitest run tests/import.test.ts` -- expected: all import and schema tests pass.
- `npx tsc --noEmit` -- expected: clean TypeScript compilation with zero type errors.

## Auto Run Result

Status: done
Verification: All 9 Vitest integration tests passed (3.30s), tsc --noEmit passed with zero errors.
Metrics verified on bundled seed: 14 people, 16 employments, 38 skills, 20 logical connections, 40 stored directed rows. Second import passed idempotency with 0 stale records. Forward references, dangling referrals, self-referrals, date validations, and deletion reconciliations tested and verified.

