---
id: SPEC-talent-network-search
companions:
  - data-schema.md
  - connection-rules.md
  - api-spec.md
sources:
  - ../../../talent-graph-seed.json
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source files are retained for traceability only.

# Talent Network Search

## Contract map

- `data-schema.md` defines relational storage, validation, and authoritative snapshot reconciliation.
- `connection-rules.md` defines connection evidence, traversal, path ranking, and explanation rules.
- `api-spec.md` defines endpoints, errors, deterministic ordering, and UI-facing response shapes.

## Why

Skill-only candidate search does not produce actionable hiring leads. Recruiters need to find people with a required skill within their close professional circle—up to 2 hops away—and see the exact, verifiable connection chain that makes an introduction possible.

## Capabilities

- **CAP-1**
  - **intent:** The system imports a validated talent snapshot containing people, employment histories, skills, and referrals, then fully reconciles stored state to that snapshot.
  - **success:** Re-importing the same effective snapshot produces identical source and derived logical state with zero source-record mutations; importing a changed or empty explicit snapshot removes every record no longer present. The bundled seed produces 14 people, 16 employments, 38 skills, 20 logical connection reasons, and 40 directed evidence rows.
- **CAP-2**
  - **intent:** The system derives professional connections from verified overlapping employment at the same normalized company and referral facts that can be traversed in either direction.
  - **success:** Every returned logical edge contains only valid typed evidence. Forward referral traversal renders `referred`, reverse traversal renders `referred by`, and concurrent evidence between the same people is exposed as one compound logical edge.
- **CAP-3**
  - **intent:** A user selects a starting person and exact target skill to find qualified contacts within 2 professional connections.
  - **success:** The search returns each matching person once at a depth of 1 or 2, excludes the starting person, prevents repeated people within a path, and returns an empty array with HTTP 200 when no candidate matches.
- **CAP-4**
  - **intent:** The system presents a deterministic, human-readable connection chain for every candidate and preserves additional valid chains for progressive disclosure.
  - **success:** For Dana Ravid plus Neo4j, the result contains Yossi Bar-Lev, Noa Frisch, and Shira Levko; Noa's primary chain runs through Yossi and the chain through Maya Tsur remains available as an alternative.

## Constraints

- Traversal depth is capped at 2 hops and no person ID may repeat within a path.
- The starting person is excluded from results.
- Self-referrals are rejected. Reciprocal referrals between two different people remain valid independent facts.
- Employment intervals use `YYYY-MM`; equal boundary months overlap, and one import-wide UTC `asOfMonth` bounds ongoing intervals.
- Company identity uses the canonical normalization in `connection-rules.md`; skill matching is exact after trimming and case normalization, never a substring match.
- Explicit import data is an authoritative full snapshot. A deliberate empty `people` array clears the graph.
- Imports are atomic and serialized. Caller-controlled filesystem paths are prohibited, and bodies larger than 1 MiB are rejected.
- Connection evidence uses stable business identities; regenerated serial database IDs never participate in ranking.
- Candidate, path, people, role, and skill ordering follow the total orders in the companion contracts.

## Non-goals

- Multi-tenant authentication, authorization, or role-based access control.
- External social-media or live LinkedIn profile scraping.
- Arbitrary path exploration beyond 2 hops.
- Semantic or vector-based skill similarity.
- Real-time CDC or event-driven streaming synchronization.

## Success signal

- **CAP-1:** Repeated bundled-seed imports return the same canonical snapshot hash and zero source mutations on the second import. Removing a person, employment, skill, or referral from an explicit snapshot removes its stored and derived effects atomically.
- **CAP-2:** The bundled seed produces 14 employment reasons and 6 referral reasons, represented symmetrically as 40 directed evidence rows with no invalid field combinations.
- **CAP-3:** Dana Ravid plus Neo4j returns exactly Yossi Bar-Lev at depth 1 and Noa Frisch and Shira Levko at depth 2. Noa Frisch plus Kubernetes reaches Dana Ravid through reverse-referral and coworker evidence.
- **CAP-4:** Noa Frisch's primary chain from Dana Ravid is selected through Yossi Bar-Lev; Maya Tsur appears in the alternatives. Re-importing the same snapshot does not change candidate or path order.
- **Import behavior:** A forward reference from Dana Ravid to `p4` succeeds; invalid request modes fail atomically; dangling referral targets are cleared with a warning; and an explicit empty snapshot clears all graph tables.
- **UI behavior:** Loading uses skeleton cards; valid empty searches name the selected skill and person; failures appear in a non-blocking banner or toast; a one-click Dana Ravid plus Neo4j preset renders the verified results; candidate cards show the primary chain and the true alternative count; and the Reagraph visualization has an equivalent textual chain list.
