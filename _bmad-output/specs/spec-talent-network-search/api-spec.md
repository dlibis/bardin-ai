# API specification and request validation

## Shared conventions

All responses use JSON. Errors use:

```json
{
  "error": {
    "code": "INVALID_SNAPSHOT",
    "message": "Snapshot validation failed",
    "details": [
      { "path": "people[2].skills[1]", "message": "Duplicate normalized skill" }
    ]
  }
}
```

`details` is omitted when no safe field-level detail exists. Database internals, SQL, filesystem paths, and stack traces are never returned.

## Endpoints

### `GET /api/people`

**Purpose:** Return people for the starting-person selector.

**Request:** No parameters.

**Validation and errors:** No endpoint-specific validation. Unexpected failures use `500 INTERNAL_ERROR`.

**Success:** `200 OK`

```json
{
  "people": [
    {
      "id": "p1",
      "name": "Dana Ravid",
      "location": "Tel Aviv",
      "skills": ["Kubernetes", "Postgres", "TypeScript"],
      "latestRole": {
        "company": "Helix Robotics",
        "title": "Senior Backend Engineer",
        "from": "2021-03",
        "to": "2024-08",
        "isCurrent": false
      }
    }
  ]
}
```

Sort people by normalized name, then person ID. Sort each person's skills by normalized token. `latestRole` is null when the person has no employment. Otherwise select the first role ordered by:

1. `from` descending
2. Effective `to` descending, treating null as later than any closed date
3. Normalized company ascending
4. Title ascending
5. Employment ID ascending

The employment natural-key constraint makes the final key defensive rather than behavior-defining.

### `GET /api/skills`

**Purpose:** Return the network's distinct skills for the skill selector.

**Request:** No parameters.

**Validation and errors:** No endpoint-specific validation. Unexpected failures use `500 INTERNAL_ERROR`.

**Success:** `200 OK`

```json
{
  "skills": ["Airflow", "Go", "GraphQL", "Java", "Kubernetes", "Neo4j"]
}
```

Group by normalized skill. Choose the binary-lowest trimmed spelling under PostgreSQL `COLLATE "C"` as the display value, then sort groups by normalized token ascending.

### `GET /api/search`

**Purpose:** Return reachable people with an exact target skill within 2 hops.

**Request:**

- `personId`: required string identifying an existing person.
- `skill`: required non-empty string, trimmed and matched case-insensitively as a complete token.

**Validation and errors:**

- Missing, non-string, or unknown `personId`: `400 INVALID_PERSON_ID`.
- Missing, non-string, or blank `skill`: `400 INVALID_SKILL`.
- Unexpected failure: `500 INTERNAL_ERROR`.

**Success:** `200 OK`

```json
{
  "query": {
    "personId": "p1",
    "personName": "Dana Ravid",
    "skill": "Neo4j"
  },
  "resultsCount": 3,
  "results": [
    {
      "person": {
        "id": "p2",
        "name": "Yossi Bar-Lev",
        "location": "Tel Aviv",
        "skills": ["Go", "Neo4j", "Postgres"]
      },
      "depth": 1,
      "primaryChain": {
        "display": "Dana Ravid → worked with at Helix Robotics (2021-03 to 2023-05) → Yossi Bar-Lev",
        "steps": [
          {
            "fromId": "p1",
            "fromName": "Dana Ravid",
            "toId": "p2",
            "toName": "Yossi Bar-Lev",
            "type": "WORKED_WITH",
            "company": "Helix Robotics",
            "overlapFrom": "2021-03",
            "overlapTo": "2023-05",
            "overlapMonths": 29,
            "text": "worked with at Helix Robotics (2021-03 to 2023-05)",
            "reasons": [
              {
                "type": "WORKED_WITH",
                "company": "Helix Robotics",
                "overlapFrom": "2021-03",
                "overlapTo": "2023-05",
                "overlapMonths": 29,
                "text": "worked with at Helix Robotics (2021-03 to 2023-05)"
              }
            ]
          }
        ]
      },
      "alternativeChains": [],
      "totalAlternativeChains": 0,
      "alternativesTruncated": false
    }
  ]
}
```

`resultsCount` counts distinct candidates, never paths. Each candidate appears once. Candidate and path ordering follow `connection-rules.md`. Return no more than 20 alternatives per candidate.

### `POST /api/import`

**Purpose:** Atomically replace the talent graph from the bundled seed or an explicit validated snapshot. File-system paths supplied by callers are prohibited.

**Request:** Use exactly one mode:

```json
{ "useDefaultSeed": true }
```

or:

```json
{
  "data": {
    "people": []
  }
}
```

An omitted body is equivalent to `{ "useDefaultSeed": true }`. `useDefaultSeed: false`, mixed `useDefaultSeed` and `data`, unknown request-envelope fields, or a body without either mode is invalid. Snapshot fields are defined in `data-schema.md`; an explicit empty `people` array is valid and clears the graph.

**Validation and errors:**

- Malformed JSON: `400 INVALID_JSON`.
- Invalid mode or unknown top-level fields: `400 INVALID_IMPORT_MODE`.
- Snapshot validation failure: `400 INVALID_SNAPSHOT` with field details.
- Raw request body larger than 1 MiB: `413 PAYLOAD_TOO_LARGE`.
- Another import holds the advisory lock: `409 IMPORT_IN_PROGRESS`.
- Unexpected failure: `500 INTERNAL_ERROR`; the transaction rolls back.

**Success:** `200 OK`

```json
{
  "success": true,
  "warnings": [],
  "stats": {
    "peopleCount": 14,
    "employmentCount": 16,
    "skillsCount": 38,
    "logicalConnectionReasonsCount": 20,
    "storedDirectedEvidenceRowsCount": 40,
    "asOfMonth": "2026-09",
    "inputHash": "sha256:...",
    "effectiveSnapshotHash": "sha256:...",
    "idempotentCheckPassed": false,
    "reconciliation": {
      "peoplePurged": 0,
      "skillsPurged": 0,
      "employmentsPurged": 0,
      "referralsCleared": 0,
      "staleRecordsPurged": 0
    },
    "durationMs": 35
  }
}
```

Warnings use stable codes and contain no raw payload. A dangling referral produces:

```json
{
  "code": "DANGLING_REFERRAL_CLEARED",
  "personId": "p1",
  "targetId": "missing-id"
}
```

Counter and hash definitions are canonical in `data-schema.md`. On the second import of identical canonical input during the same UTC month, `idempotentCheckPassed` is true and source purge counters are zero.

## Response examples

### Complete chain step

Every step exposes its primary reason through compatibility fields and all supporting evidence through `reasons`:

```json
{
  "fromId": "p2",
  "fromName": "Yossi Bar-Lev",
  "toId": "p7",
  "toName": "Noa Frisch",
  "type": "REFERRED",
  "traversalDirection": "FORWARD",
  "text": "referred",
  "reasons": [
    {
      "type": "REFERRED",
      "traversalDirection": "FORWARD",
      "referrerId": "p2",
      "refereeId": "p7",
      "text": "referred"
    }
  ]
}
```

For `WORKED_WITH`, the primary reason and each reason include `company`, `overlapFrom`, `overlapTo`, `overlapMonths`, and `text`. `overlapTo` is null only when both contributing employments are ongoing.

### Noa Frisch multi-path result

For Dana Ravid plus Neo4j, Noa Frisch's result has depth 2. Its primary display is `Dana Ravid → worked with at Helix Robotics (2021-03 to 2023-05) → Yossi Bar-Lev → referred → Noa Frisch`. Its one alternative display is `Dana Ravid → worked with at Helix Robotics (2023-09 to 2024-08) → Maya Tsur → referred by → Noa Frisch`; therefore `totalAlternativeChains` is 1 and `alternativesTruncated` is false. Every included step uses the complete shape above.

Empty search results return `resultsCount: 0` and `results: []` with HTTP 200.
