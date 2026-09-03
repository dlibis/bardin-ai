# Professional connection and traversal rules

## 1. Canonical normalization

Company identity is the stored generated value:

```sql
LOWER(TRIM(REGEXP_REPLACE(company, '\s+', ' ', 'g')))
```

Skill identity is `LOWER(TRIM(skill))`. Matching uses the complete normalized token; substring matching is prohibited.

## 2. Employment evidence

A `WORKED_WITH` reason exists between different people when two discrete employment stints share a normalized company and their inclusive month intervals intersect.

For an import, capture one UTC calendar month as `asOfMonth`. Interpret a null `to` as `asOfMonth` for comparison and duration; preserve `overlapTo: null` only when both source intervals are ongoing.

For intervals $I_A=[S_A,E_A]$ and $I_B=[S_B,E_B]$:

$$\max(S_A,S_B) \le \min(E_A,E_B)$$

Boundary equality represents one month of overlap. Derived values are:

- `overlapFrom = max(S_A, S_B)`
- `overlapTo = null` when both stints are ongoing; otherwise `min(E_A, E_B)`
- `overlapMonths = (endYear - startYear) * 12 + (endMonth - startMonth) + 1`, using `asOfMonth` when the effective end is ongoing

Each directed employment reason identifies both contributing employment rows. Distinct stint pairs remain distinct evidence even when they produce the same overlap bounds.

## 3. Referral evidence

When person B referred person A:

- B to A is a `REFERRED` reason with `traversalDirection: FORWARD` and text `referred`.
- A to B is a `REFERRED` reason with `traversalDirection: REVERSE` and text `referred by`.

Self-referrals are invalid. Reciprocal referrals between different people are two valid facts and therefore produce two reasons in each directed logical edge, one forward and one reverse.

A referral target missing from the same authoritative snapshot is normalized to null before foreign-key assignment and produces an import warning. It creates no connection evidence.

## 4. Logical directed edges

Storage retains one row per directed evidence reason. Search first groups all rows with the same `(sourceId, targetId)` into one logical directed edge:

```text
LogicalEdge {
  sourceId
  targetId
  reasons[]       // stable evidence-key order
  primaryReason   // lowest semantic rank, then stable evidence key
}
```

`reasons[]` contains typed evidence generated from relational columns; no independent JSON description is stored. `primaryReason` supplies the step's compatibility fields and human-readable text. A compound edge has more than one reason, regardless of reason type.

Semantic reason order is:

1. Forward referral
2. Reverse referral
3. Shared employment

Within shared-employment reasons, greater `overlapMonths` comes first, followed by the stable evidence key. Remaining ties use the evidence key.

## 5. Bounded traversal

Traversal starts from the selected person and follows logical directed edges with these normative rules:

- Emit only depths 1 and 2.
- Never append a person ID already present in the path.
- Exclude the starting person from candidate results.
- Retain every distinct person-ID path and every distinct ordered logical-edge evidence sequence until ranking.
- Apply the normalized exact-skill predicate to the final candidate, not to intermediaries.

An implementation may use this PostgreSQL Recursive CTE shape after constructing `logical_connections`:

```sql
WITH RECURSIVE network AS (
  SELECT
    lc.source_id,
    lc.target_id,
    1 AS depth,
    ARRAY[lc.source_id, lc.target_id] AS person_path,
    ARRAY[lc.edge_key] AS edge_path,
    jsonb_build_array(lc.edge_payload) AS edges
  FROM logical_connections lc
  WHERE lc.source_id = $1

  UNION ALL

  SELECT
    n.source_id,
    lc.target_id,
    n.depth + 1,
    n.person_path || lc.target_id,
    n.edge_path || lc.edge_key,
    n.edges || lc.edge_payload
  FROM network n
  JOIN logical_connections lc ON lc.source_id = n.target_id
  WHERE n.depth < 2
    AND NOT (lc.target_id = ANY(n.person_path))
)
SELECT n.*
FROM network n
JOIN skills s ON s.person_id = n.target_id
WHERE s.normalized_skill = LOWER(TRIM($2))
  AND n.target_id <> $1;
```

The CTE yields paths, not API results. The application partitions paths by target person, orders each partition, chooses the first as `primaryChain`, and places the rest in `alternativeChains`.

## 6. Total path order

Compare paths lexicographically by this complete tuple:

1. `depth` ascending.
2. Final logical edge's primary semantic reason rank ascending.
3. Final logical edge's reason count descending.
4. Final primary employment reason's `overlapMonths` descending, or `0` when it is not employment.
5. Intermediary normalized name ascending, using the empty string for a one-hop path.
6. Intermediary ID ascending, using the empty string for a one-hop path.
7. Complete person-ID path lexicographically ascending.
8. Complete ordered logical-edge evidence-key sequence lexicographically ascending.

Stable evidence keys contain only business identities:

- Employment: connection type, normalized company, source person's employment natural key, and target person's employment natural key.
- Referral: connection type, referrer ID, referee ID, source ID, and target ID.

Database serial IDs and insertion order never participate.

### Noa Frisch example

- Dana Ravid to Yossi Bar-Lev to Noa Frisch ends with a forward referral and ranks first.
- Dana Ravid to Maya Tsur to Noa Frisch ends with a reverse referral and remains an alternative.

## 7. Candidate and alternative aggregation

Return one result per candidate. Sort candidates by their primary path's complete tuple, then normalized candidate name and candidate ID.

Return at most 20 alternative chains per candidate in path order. Also return:

- `totalAlternativeChains`: total alternatives before the cap
- `alternativesTruncated`: whether the total exceeds the returned count

The UI must display the actual total rather than a fixed `+1` label.
