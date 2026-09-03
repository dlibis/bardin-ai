---
title: 'Story 3: REST API Service & Request Validation'
type: 'feature'
created: '2026-09-03'
baseline_revision: 'NO_VCS'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/api-spec.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Frontend and client callers require a REST API to query people, skills, search network candidates, and trigger idempotent imports. The endpoints must strictly validate inputs, reject filesystem paths to prevent security vulnerabilities, return deterministic ordering, and format error envelopes consistently.

**Approach:** Implement an Express router and server with routes for `GET /api/people` (with `latestRole` and `isCurrent`), `GET /api/skills`, `GET /api/search`, and `POST /api/import`. Enforce query validation, 1 MiB body limits, standard JSON error responses, and automated seed initialization.

## Boundaries & Constraints

**Always:**
- `GET /api/people` sorts people by normalized name then person ID, skills by normalized token, and computes `latestRole` with `isCurrent: boolean`.
- `GET /api/skills` groups distinct skills by normalized token, picks the binary-lowest trimmed spelling, and sorts by normalized token ascending.
- `GET /api/search` requires `personId` (existing person) and `skill` (non-empty string); returns HTTP 400 with `INVALID_PERSON_ID` or `INVALID_SKILL` on failure.
- `POST /api/import` accepts only `{ useDefaultSeed: true }` or `{ data: { people: [...] } }`, rejecting server file paths or mixed modes with `INVALID_IMPORT_MODE`.
- Body payload size capped at 1 MiB (`413 PAYLOAD_TOO_LARGE`).
- Standard error envelope: `{ error: string, message: string }`.

**Block If:**
- Upstream requirements require authentication or social scraping (explicit non-goals).

**Never:**
- Never accept a `seedFilePath` parameter or arbitrary server paths.
- Never return non-deterministic or un-sorted array elements.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GET /api/people | No params | All people sorted by normalized name, skills sorted, latestRole with isCurrent | 200 OK |
| GET /api/skills | No params | Distinct normalized skills list sorted ascending | 200 OK |
| GET /api/search (Happy) | `personId=p1&skill=Neo4j` | 200 OK, 3 candidates (Yossi, Noa, Shira) | No error |
| GET /api/search (Missing ID) | `skill=Neo4j` | 400 Bad Request `{ error: "INVALID_PERSON_ID" }` | JSON error envelope |
| GET /api/search (Unknown ID) | `personId=p999&skill=Neo4j` | 400 Bad Request `{ error: "INVALID_PERSON_ID" }` | JSON error envelope |
| GET /api/search (Missing Skill) | `personId=p1` | 400 Bad Request `{ error: "INVALID_SKILL" }` | JSON error envelope |
| POST /api/import (Default) | `{ "useDefaultSeed": true }` | 200 OK with import stats and counts | No error |
| POST /api/import (Invalid Mode) | `{ "seedFilePath": "/etc/passwd" }` | 400 Bad Request `{ error: "INVALID_IMPORT_MODE" }` | Security check passed |

</intent-contract>

## Code Map

- `src/server/routes/api.ts` -- Express API route definitions for people, skills, search, and import.
- `src/server/app.ts` -- Express application setup, middleware (cors, json parser with 1mb limit), error handler.
- `src/server/index.ts` -- Server runner with port listening and auto-import initialization.
- `tests/api.test.ts` -- Vitest integration suite testing all API endpoints, validation errors, and response structures.

## Tasks & Acceptance

**Execution:**
- `src/server/routes/api.ts` -- Implement GET /api/people, GET /api/skills, GET /api/search, POST /api/import -- Delivers CAP-3 HTTP layer.
- `src/server/app.ts` -- Create Express app with middleware and error handling -- Provides modular app for testing and server run.
- `src/server/index.ts` -- Create server entry point with startup seed import -- Allows npm run server execution.
- `tests/api.test.ts` -- Implement Vitest API test suite covering happy paths and edge cases -- Verifies API contract.

**Acceptance Criteria:**
- Given `GET /api/people`, then all people are returned with `latestRole` (including `isCurrent: false` for Dana Ravid and `isCurrent: true` for Maya Tsur).
- Given `GET /api/skills`, then distinct normalized skills are returned in ascending alphabetical order.
- Given `GET /api/search?personId=p1&skill=Neo4j`, then exactly 3 candidates are returned matching the primary acceptance criteria.
- Given `POST /api/import` with invalid fields or paths, then HTTP 400 `INVALID_IMPORT_MODE` is returned.

## Verification

**Commands:**
- `npx vitest run tests/api.test.ts` -- expected: all API integration tests pass.
- `npx tsc --noEmit` -- expected: clean TypeScript compilation.

## Auto Run Result

Status: done
Verification: All 10 API integration tests passed (1.1s), tsc --noEmit passed with zero errors. Total test suite: 27/27 tests passed.
Endpoints verified: GET /api/people (sorted, latestRole, isCurrent), GET /api/skills (distinct normalized, sorted), GET /api/search (Dana + Neo4j primary acceptance with 3 candidates, error validation), POST /api/import (secure mode validation, arbitrary path rejection, snapshot clearing).

