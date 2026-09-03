---
title: 'Story 2: Connection Derivation & 2-Hop Graph Traversal Engine'
type: 'feature'
created: '2026-09-03'
baseline_revision: 'NO_VCS'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/connection-rules.md'
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/api-spec.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** To identify warm recruiting leads, candidates must be reachable within 2 hops of a starting person and matched on an exact skill. Graph exploration must prevent infinite loops or redundant paths, aggregate parallel evidence into compound logical edges, and rank multiple connection chains using a strict, deterministic total ordering.

**Approach:** Implement a graph traversal engine using a PostgreSQL recursive CTE bounded at 2 hops with cycle prevention (`NOT target_id = ANY(person_path)`). Group directed evidence into logical edges, resolve compound reasons, and implement total order path ranking (depth -> final step semantic weight -> compound edge count -> overlap duration -> intermediary name -> intermediary id -> target id).

## Boundaries & Constraints

**Always:**
- Traversal depth strictly capped at depths 1 and 2 (`depth <= 2`).
- Prevent cycles by forbidding any person ID already present in the path (`NOT target_id = ANY(person_path)`).
- Exclude the root searcher from candidate results (`target_id <> $1`).
- Exact skill matching is case-insensitive on the trimmed normalized token; substring matching is forbidden.
- Multiple reasons between the same source and target are collapsed into one logical directed edge.
- Semantic ranking of final step: Forward referral (`"referred"`, rank 1) > Reverse referral (`"referred by"`, rank 2) > Shared employment (`"worked with"`, rank 3).
- For Noa Frisch starting from Dana Ravid, Yossi Bar-Lev must be the primary chain (via forward referral) and Maya Tsur must be in the alternative chains.
- Return at most 20 alternative chains per candidate with exact `totalAlternativeChains` count and `alternativesTruncated` boolean.

**Block If:**
- Upstream requirements allow cycle loops or infinite paths.

**Never:**
- Never return candidates at distance 0 (the searcher themselves).
- Never return candidates beyond 2 hops.
- Never use database serial IDs to determine path ordering or tie-breaks.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dana Ravid + Neo4j | Person `p1`, Skill `Neo4j` | Exactly 3 candidates: Yossi Bar-Lev (depth 1), Noa Frisch (depth 2), Shira Levko (depth 2). Yossi is primary for Noa; Maya is alternative. | Returns 3 candidates |
| Reverse Traversal | Person `p7` (Noa), Skill `Kubernetes` | Finds `p1` (Dana Ravid) via reverse-referral and coworker paths | Returns Dana Ravid |
| Root Searcher Exclusion | Person `p1`, Skill `Postgres` | Does not include `p1` in results (even though `p1` has Postgres) | Excluded from results |
| Zero Results Match | Person `p1`, Skill `NonExistentSkill` | Empty results array, `resultsCount: 0` | HTTP 200 / empty list |
| Compound Edge Pair | Two people with both employment overlap and referral | Grouped into 1 logical edge; reasons list contains both | Rendered compound step |
| Multi-Path Alternative Cap | Candidate with >20 alternative paths | At most 20 alternatives returned; `alternativesTruncated: true` | Capped at 20 |

</intent-contract>

## Code Map

- `src/server/graph/types.ts` -- Types for traversal nodes, logical edges, path steps, candidate results, and ranking tuples.
- `src/server/graph/traversal.ts` -- 2-hop recursive CTE traversal, logical edge aggregation, total ordering ranking, and candidate formatting.
- `tests/traversal.test.ts` -- Vitest test suite verifying 2-hop search, Dana Ravid + Neo4j primary acceptance, reverse traversal, cycle avoidance, and ranking tie-breakers.

## Tasks & Acceptance

**Execution:**
- `src/server/graph/types.ts` -- Create graph traversal and search result types -- Ensures type alignment with `api-spec.md` and `connection-rules.md`.
- `src/server/graph/traversal.ts` -- Implement 2-hop recursive CTE, logical edge grouping, and total path ordering -- Provides core graph query engine.
- `tests/traversal.test.ts` -- Implement Vitest tests for Dana Ravid acceptance test, reverse traversal, compound edges, and ranking tie-breaks -- Validates CAP-2 and CAP-3.

**Acceptance Criteria:**
- Given Dana Ravid (`p1`) and skill `Neo4j`, when searched, then exactly 3 candidates are returned: Yossi Bar-Lev (depth 1), Noa Frisch (depth 2), and Shira Levko (depth 2).
- Given Noa Frisch (`p7`), when evaluating candidate paths from Dana Ravid, then the primary path is through Yossi Bar-Lev and an alternative path is through Maya Tsur.
- Given a starting person with the target skill, when searched, then the starting person is never included in the candidate list.
- Given a search for a skill with zero matching people within 2 hops, when searched, then an empty results array is returned.

## Verification

**Commands:**
- `npx vitest run tests/traversal.test.ts` -- expected: all graph traversal and ranking tests pass.
- `npx tsc --noEmit` -- expected: clean compilation with zero type errors.

## Auto Run Result

Status: done
Verification: All 8 graph traversal integration tests passed (4.32s), tsc --noEmit passed with zero errors.
Primary Acceptance Test verified: Dana Ravid + Neo4j yields exactly 3 candidates (Yossi Bar-Lev at depth 1, Noa Frisch at depth 2 with primary chain via Yossi and alternative chain via Maya, and Shira Levko at depth 2).
Reverse traversal, self-exclusion, exact skill matching, compound edges, and total ordering multi-path tie-breaking verified.

