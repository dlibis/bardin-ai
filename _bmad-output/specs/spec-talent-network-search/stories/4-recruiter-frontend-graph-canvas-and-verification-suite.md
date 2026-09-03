---
title: 'Story 4: Recruiter Frontend, Graph Canvas & Verification Suite'
type: 'feature'
created: '2026-09-03'
baseline_revision: 'NO_VCS'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/api-spec.md'
  - '{project-root}/_bmad-output/specs/spec-talent-network-search/connection-rules.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Recruiters currently have no visual interface to discover talent through mutual connections, inspect 2-hop introduction paths, or evaluate alternative referral routes. They need a responsive web application featuring person and skill selectors, a 1-click test preset, candidate cards with progressive disclosure, an accessible textual chain list, and a WebGL graph canvas.

**Approach:** Build a modern React + Tailwind web application backed by the REST API, integrating a Reagraph WebGL canvas, accessible textual chain fallback, skeleton loading states, and non-blocking error banners. Verify end-to-end acceptance, ranking, reverse traversal, and constraints with a comprehensive Vitest test suite.

## Boundaries & Constraints

**Always:**
- Provide both the interactive Reagraph WebGL canvas and an equivalent, fully accessible textual chain list.
- Include a 1-click preset button for "Dana Ravid + Neo4j" that immediately configures the search and displays verified results.
- Candidate cards must display the primary chain prominently and the true total count of alternative chains (`totalAlternativeChains`), never a hardcoded `+1`.
- Progressive disclosure: alternative paths remain collapsed by default and can be expanded individually.
- Valid empty searches must explicitly name both the selected person and skill in the empty state.
- Loading states must render skeleton cards matching candidate card dimensions.
- API and network failures must appear in a non-blocking banner or toast without breaking page layout.
- Preserve deterministic total ordering of candidates and connection paths matching `connection-rules.md`.

**Ask First:**
- Any change to existing database schemas or backend route contracts defined in `api-spec.md`.

**Never:**
- Never crash or render a blank page if WebGL is unavailable or fails to initialize in Reagraph; gracefully fall back to the accessible graph/text view.
- Never hardcode "+1" or static labels for alternative path counts.
- Never use substring matching or un-normalized tokens for skill filtering.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 1-Click Preset | Click "Preset: Dana Ravid + Neo4j" | Sets person to Dana Ravid (p1), skill to Neo4j, executes search; renders 3 candidates (Yossi, Noa, Shira) | Non-blocking banner on error |
| Candidate Card (Alternatives) | Result includes Noa Frisch (p7) | Primary chain via Yossi displayed; button displays "1 alternative path"; clicking expands Maya Tsur chain | N/A |
| Empty Search Result | Person: Dana Ravid, Skill: Haskell | Empty state displayed: "No candidates with skill 'Haskell' found within 2 hops of Dana Ravid" | 200 OK handled gracefully |
| Initial Page Load | Application mounted | Fetches GET /api/people and GET /api/skills; populates dropdowns with latest role badges | Non-blocking banner if fetch fails |
| API Error / Bad Input | Invalid query or network failure | Non-blocking alert banner displays error code and message; UI remains interactive | Banner with dismiss button |
| WebGL Canvas Interaction | Toggle Graph View / WebGL active | Reagraph canvas renders nodes for searcher, intermediaries, and candidates with colored edges | Fallback to textual view if WebGL fails |

</frozen-after-approval>

## Code Map

- `index.html` -- HTML entry point with viewport meta, fonts, and React root mount.
- `tailwind.config.js` -- Tailwind CSS configuration defining content paths and custom theme palette.
- `src/client/main.tsx` -- React 18 bootstrap mounting the application into `#root`.
- `src/client/index.css` -- Tailwind directives, custom scrollbars, and modern UI tokens.
- `src/client/types.ts` -- Frontend TypeScript definitions for Person, Skill, SearchResult, ChainStep, and API responses.
- `src/client/api.ts` -- Typed fetch API service wrapping `/api/people`, `/api/skills`, `/api/search`, and `/api/import`.
- `src/client/components/Header.tsx` -- Application header with branding, database connection badge, and default seed reset button.
- `src/client/components/SearchControls.tsx` -- Search form with person selector (including latest role badge), skill selector, 1-click preset button, and submit action.
- `src/client/components/CandidateCard.tsx` -- Candidate card showing name, location, skills, depth badge, primary chain breadcrumb, and expandable alternative paths.
- `src/client/components/CandidateList.tsx` -- Container for skeleton loading state, empty state with person & skill names, and candidate card list.
- `src/client/components/GraphCanvasView.tsx` -- Interactive Reagraph WebGL network canvas with depth-based node styling, edge labels, and error boundary fallback.
- `src/client/components/AccessibleChainList.tsx` -- Semantic, accessible textual chain list for screen readers and keyboard navigation.
- `src/client/components/ErrorBanner.tsx` -- Dismissible non-blocking error banner for network or validation failures.
- `src/client/App.tsx` -- Root application coordinating state, data fetching, view mode toggle (Cards / Graph / Split), and layout.
- `tests/e2e.test.ts` -- Comprehensive Vitest end-to-end suite verifying all 8 core acceptance criteria, API endpoints, ranking, and UI scenarios.

## Tasks & Acceptance

**Execution:**
- [x] `index.html` & `tailwind.config.js` -- Configure HTML shell and Tailwind styling tokens -- Provides modern base UI container.
- [x] `src/client/types.ts` & `src/client/api.ts` -- Implement frontend models and typed API client -- Establishes strong type safety for frontend-backend communication.
- [x] `src/client/components/SearchControls.tsx` -- Create search panel with 1-click Dana Ravid + Neo4j preset button -- Satisfies 1-click preset and filter requirements.
- [x] `src/client/components/CandidateCard.tsx` & `src/client/components/CandidateList.tsx` -- Implement candidate cards, skeleton loaders, and empty state naming query params -- Satisfies CAP-4 progressive disclosure and UI requirements.
- [x] `src/client/components/GraphCanvasView.tsx` -- Implement Reagraph WebGL visualization with safe fallback -- Provides interactive network canvas.
- [x] `src/client/components/AccessibleChainList.tsx` -- Build semantic textual chain view -- Ensures full accessibility compliance alongside WebGL canvas.
- [x] `src/client/App.tsx` -- Assemble recruiter UI with view toggles, error banner, and responsive layout -- Completes recruiter frontend interface.
- [x] `tests/e2e.test.ts` -- Implement comprehensive 8-case Vitest suite -- Validates end-to-end acceptance, ranking, reverse traversal, and constraints.

**Acceptance Criteria:**
- Given the user clicks the 1-click preset button, when search executes for Dana Ravid + Neo4j, then exactly 3 candidate cards are rendered (Yossi Bar-Lev at depth 1, Noa Frisch at depth 2, Shira Levko at depth 2).
- Given Noa Frisch's candidate card is rendered, when checking alternative paths, then the true count is 1 and expanding reveals the chain through Maya Tsur.
- Given a search with no matching contacts (e.g. Haskell for Dana Ravid), then the empty state explicitly displays "No candidates with skill 'Haskell' found within 2 hops of Dana Ravid".
- Given the graph view is enabled, then the Reagraph WebGL canvas renders nodes and edges for the network path, and the accessible textual chain list is available.
- Given an API or network error occurs, then a non-blocking error banner appears with the error message and the user can dismiss it.
- Given `npm test` is executed, then all test suites (including `tests/e2e.test.ts`, `tests/api.test.ts`, `tests/traversal.test.ts`, and `tests/import.test.ts`) pass cleanly.

## Design Notes

- **WebGL Fallback:** Reagraph uses `@react-three/fiber` and WebGL. In environments where WebGL is unsupported or encounters context loss, `GraphCanvasView` wraps rendering in an error boundary that automatically defaults to the clean 2D accessible SVG/text chain list.
- **Progressive Disclosure:** Each candidate card maintains local expand/collapse state for alternative paths. The toggle button explicitly displays `${candidate.totalAlternativeChains} alternative path${candidate.totalAlternativeChains > 1 ? 's' : ''}`.
- **Preset Mechanism:** The 1-click preset button sets `selectedPersonId = 'p1'` and `selectedSkill = 'Neo4j'`, immediately invoking search execution without requiring manual form interactions.

## Verification

**Commands:**
- `npm test` -- expected: all test suites (including e2e) pass with zero failures.
- `npx tsc --noEmit` -- expected: clean TypeScript compilation with zero type errors.
- `npm run build` -- expected: successful Vite client production bundle build.

## Auto Run Result

Status: done
Verification: All 35 Vitest tests across 4 test suites passed (4.77s), tsc --noEmit passed with zero errors, Vite production build succeeded.
- `tests/e2e.test.ts` (8/8 passed): End-to-end Dana Ravid + Neo4j primary acceptance, true alternative path progressive disclosure, reverse referral traversal, searcher exclusion, exact skill matching, empty search handling, compound edge multi-evidence preservation, and total ordering tie-breaking.
- `tests/api.test.ts` (10/10 passed)
- `tests/traversal.test.ts` (8/8 passed)
- `tests/import.test.ts` (9/9 passed)

## Suggested Review Order

**User Interface & Interaction Controls**

- Main recruiter search dashboard layout, state orchestration, and view mode switching
  [`App.tsx:14`](../../../../src/client/App.tsx#L14)

- Person & skill selector filters with 1-click Dana Ravid + Neo4j test preset
  [`SearchControls.tsx:18`](../../../../src/client/components/SearchControls.tsx#L18)

- Candidate card component displaying primary chain and progressive disclosure with true alternative counts
  [`CandidateCard.tsx:12`](../../../../src/client/components/CandidateCard.tsx#L12)

**Network Graph & Accessibility Visualizations**

- Interactive Reagraph WebGL canvas with node depth styling and hardware acceleration fallback
  [`GraphCanvasView.tsx:43`](../../../../src/client/components/GraphCanvasView.tsx#L43)

- Semantic, screen-reader accessible textual connection path list
  [`AccessibleChainList.tsx:11`](../../../../src/client/components/AccessibleChainList.tsx#L11)

**Backend Traversal & Edge Direction Fidelity**

- Propagate traversal direction on logical steps for forward and reverse referral fidelity
  [`traversal.ts:295`](../../../../src/server/graph/traversal.ts#L295)

**Verification & Peripherals**

- End-to-end 8-case verification suite validating acceptance criteria and edge cases
  [`e2e.test.ts:8`](../../../../tests/e2e.test.ts#L8)

- Frontend TypeScript models aligned with api-spec
  [`types.ts:1`](../../../../src/client/types.ts#L1)

