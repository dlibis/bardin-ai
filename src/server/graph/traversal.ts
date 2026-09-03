import { DatabaseClient, getDatabaseClient } from '../db/client.js';
import {
  CandidateChain,
  CandidatePerson,
  ConnectionReason,
  LogicalStep,
  SearchCandidate,
  SearchResult,
} from './types.js';

export function normalizeSkill(skill: string): string {
  return skill.trim().toLowerCase();
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

interface DBPerson {
  id: string;
  name: string;
  location: string | null;
}

interface DBEmployment {
  id: number;
  person_id: string;
  company: string;
  normalized_company: string;
  title: string;
  from_date: string;
  to_date: string | null;
}

interface DBConnection {
  id: number;
  source_id: string;
  target_id: string;
  connection_type: 'WORKED_WITH' | 'REFERRED';
  source_employment_id: number | null;
  target_employment_id: number | null;
  overlap_from: string | null;
  overlap_to: string | null;
  overlap_months: number | null;
  as_of_month: string;
  referrer_id: string | null;
  referee_id: string | null;
  traversal_direction: 'FORWARD' | 'REVERSE' | 'SYMMETRIC';
  company: string | null;
}

interface LogicalEdge {
  sourceId: string;
  targetId: string;
  reasons: ConnectionReason[];
  primaryReason: ConnectionReason;
}

function buildReason(row: DBConnection, empMap: Map<number, DBEmployment>): ConnectionReason {
  if (row.connection_type === 'REFERRED') {
    const isForward = row.traversal_direction === 'FORWARD';
    return {
      type: 'REFERRED',
      traversalDirection: row.traversal_direction,
      text: isForward ? 'referred' : 'referred by',
      evidenceKey: `REFERRED:${row.referrer_id}:${row.referee_id}:${row.source_id}:${row.target_id}`,
    };
  }

  // WORKED_WITH
  const srcEmp = row.source_employment_id ? empMap.get(row.source_employment_id) : null;
  const tgtEmp = row.target_employment_id ? empMap.get(row.target_employment_id) : null;
  const companyName = srcEmp?.company || tgtEmp?.company || 'Company';
  const normComp = srcEmp?.normalized_company || tgtEmp?.normalized_company || '';

  const overlapToStr = row.overlap_to ? row.overlap_to : 'present';
  const text = `worked with at ${companyName} (${row.overlap_from} to ${overlapToStr})`;

  const srcKey = srcEmp ? `${srcEmp.person_id}:::${normComp}:::${srcEmp.from_date}` : '';
  const tgtKey = tgtEmp ? `${tgtEmp.person_id}:::${normComp}:::${tgtEmp.from_date}` : '';
  const evidenceKey = `WORKED_WITH:${normComp}:${srcKey}:${tgtKey}`;

  return {
    type: 'WORKED_WITH',
    company: companyName,
    overlapFrom: row.overlap_from || undefined,
    overlapTo: row.overlap_to,
    overlapMonths: row.overlap_months || 0,
    traversalDirection: 'SYMMETRIC',
    text,
    evidenceKey,
  };
}

export function getSemanticRank(reason: ConnectionReason): number {
  if (reason.type === 'REFERRED') {
    return reason.traversalDirection === 'FORWARD' ? 1 : 2;
  }
  return 3; // WORKED_WITH
}

function compareReasons(a: ConnectionReason, b: ConnectionReason): number {
  const rankA = getSemanticRank(a);
  const rankB = getSemanticRank(b);
  if (rankA !== rankB) return rankA - rankB;

  if (a.type === 'WORKED_WITH' && b.type === 'WORKED_WITH') {
    const monthsA = a.overlapMonths || 0;
    const monthsB = b.overlapMonths || 0;
    if (monthsA !== monthsB) return monthsB - monthsA; // descending
  }

  return a.evidenceKey.localeCompare(b.evidenceKey);
}

export interface InternalPath {
  candidateId: string;
  depth: number;
  personPath: string[];
  edges: LogicalEdge[];
  steps: LogicalStep[];
  evidenceKeys: string[];
}

export interface PathRankingTuple {
  depth: number;
  finalSemanticRank: number;
  finalReasonCount: number;
  finalOverlapMonths: number;
  intermediaryNormalizedName: string;
  intermediaryId: string;
  personPathStr: string;
  evidenceKeyStr: string;
}

export function computePathRankingTuple(
  path: InternalPath,
  personMap: Map<string, DBPerson>
): PathRankingTuple {
  const lastEdge = path.edges[path.edges.length - 1];
  const primaryReason = lastEdge.primaryReason;
  const finalSemanticRank = getSemanticRank(primaryReason);
  const finalReasonCount = lastEdge.reasons.length;
  const finalOverlapMonths = primaryReason.type === 'WORKED_WITH' ? primaryReason.overlapMonths || 0 : 0;

  let intermediaryNormalizedName = '';
  let intermediaryId = '';
  if (path.depth === 2 && path.personPath.length > 2) {
    const interId = path.personPath[1];
    const interPerson = personMap.get(interId);
    intermediaryId = interId;
    intermediaryNormalizedName = interPerson ? normalizeName(interPerson.name) : interId.toLowerCase();
  }

  const personPathStr = path.personPath.join(':::');
  const evidenceKeyStr = path.evidenceKeys.join(':::');

  return {
    depth: path.depth,
    finalSemanticRank,
    finalReasonCount,
    finalOverlapMonths,
    intermediaryNormalizedName,
    intermediaryId,
    personPathStr,
    evidenceKeyStr,
  };
}

export function comparePathTuples(a: PathRankingTuple, b: PathRankingTuple): number {
  // 1. depth ascending
  if (a.depth !== b.depth) return a.depth - b.depth;

  // 2. final logical edge primary semantic rank ascending
  if (a.finalSemanticRank !== b.finalSemanticRank) return a.finalSemanticRank - b.finalSemanticRank;

  // 3. final logical edge reason count descending
  if (a.finalReasonCount !== b.finalReasonCount) return b.finalReasonCount - a.finalReasonCount;

  // 4. final primary employment overlapMonths descending
  if (a.finalOverlapMonths !== b.finalOverlapMonths) return b.finalOverlapMonths - a.finalOverlapMonths;

  // 5. intermediary normalized name ascending
  if (a.intermediaryNormalizedName !== b.intermediaryNormalizedName) {
    return a.intermediaryNormalizedName.localeCompare(b.intermediaryNormalizedName);
  }

  // 6. intermediary ID ascending
  if (a.intermediaryId !== b.intermediaryId) {
    return a.intermediaryId.localeCompare(b.intermediaryId);
  }

  // 7. complete person-ID path lexicographically ascending
  if (a.personPathStr !== b.personPathStr) {
    return a.personPathStr.localeCompare(b.personPathStr);
  }

  // 8. complete ordered logical-edge evidence-key sequence ascending
  return a.evidenceKeyStr.localeCompare(b.evidenceKeyStr);
}

export async function searchTalentNetwork(options: {
  personId: string;
  skill: string;
  client?: DatabaseClient;
}): Promise<SearchResult> {
  const db = options.client || (await getDatabaseClient());
  const personId = options.personId.trim();
  const rawSkill = options.skill.trim();
  const normalizedTargetSkill = normalizeSkill(rawSkill);

  // Check starting person exists
  const startPersonRes = await db.query('SELECT id, name FROM people WHERE id = $1;', [personId]);
  if (startPersonRes.rows.length === 0) {
    const err: any = new Error(`Person with id "${personId}" not found`);
    err.code = 'INVALID_PERSON_ID';
    throw err;
  }
  const startingPerson = startPersonRes.rows[0];

  // Load all people, employments, and connections
  const [peopleRes, empRes, connRes, skillsRes] = await Promise.all([
    db.query<DBPerson>('SELECT id, name, location FROM people;'),
    db.query<DBEmployment>('SELECT id, person_id, company, normalized_company, title, from_date, to_date FROM employment;'),
    db.query<DBConnection>('SELECT * FROM connections;'),
    db.query<{ person_id: string; skill: string; normalized_skill: string }>('SELECT person_id, skill, normalized_skill FROM skills;'),
  ]);

  const personMap = new Map<string, DBPerson>();
  for (const p of peopleRes.rows) {
    personMap.set(p.id, p);
  }

  const empMap = new Map<number, DBEmployment>();
  for (const e of empRes.rows) {
    empMap.set(e.id, e);
  }

  const personSkillsMap = new Map<string, string[]>();
  const skilledPersonIds = new Set<string>();
  for (const s of skillsRes.rows) {
    const list = personSkillsMap.get(s.person_id) || [];
    list.push(s.skill);
    personSkillsMap.set(s.person_id, list);

    if (s.normalized_skill === normalizedTargetSkill) {
      skilledPersonIds.add(s.person_id);
    }
  }

  // Build logical directed edges
  const edgeMap = new Map<string, LogicalEdge>();
  for (const row of connRes.rows) {
    const key = `${row.source_id}:::${row.target_id}`;
    let edge = edgeMap.get(key);
    if (!edge) {
      edge = {
        sourceId: row.source_id,
        targetId: row.target_id,
        reasons: [],
        primaryReason: null as any,
      };
      edgeMap.set(key, edge);
    }
    const reason = buildReason(row, empMap);
    edge.reasons.push(reason);
  }

  // Sort reasons and assign primaryReason
  for (const edge of edgeMap.values()) {
    edge.reasons.sort(compareReasons);
    edge.primaryReason = edge.reasons[0];
  }

  // Graph adjacency list of logical edges
  const adjacency = new Map<string, LogicalEdge[]>();
  for (const edge of edgeMap.values()) {
    const list = adjacency.get(edge.sourceId) || [];
    list.push(edge);
    adjacency.set(edge.sourceId, list);
  }

  // Bounded Traversal (depths 1 and 2, cycle prevention, exclude searcher)
  const paths: InternalPath[] = [];

  // Depth 1
  const d1Edges = adjacency.get(personId) || [];
  for (const e1 of d1Edges) {
    const target1 = e1.targetId;
    if (target1 === personId) continue;

    const fromPerson = personMap.get(e1.sourceId)!;
    const toPerson = personMap.get(e1.targetId)!;

    const step1: LogicalStep = {
      fromId: fromPerson.id,
      fromName: fromPerson.name,
      toId: toPerson.id,
      toName: toPerson.name,
      type: e1.primaryReason.type,
      traversalDirection: e1.primaryReason.traversalDirection,
      company: e1.primaryReason.company,
      overlapFrom: e1.primaryReason.overlapFrom,
      overlapTo: e1.primaryReason.overlapTo,
      overlapMonths: e1.primaryReason.overlapMonths,
      text: e1.primaryReason.text,
      reasons: e1.reasons,
    };

    if (skilledPersonIds.has(target1)) {
      paths.push({
        candidateId: target1,
        depth: 1,
        personPath: [personId, target1],
        edges: [e1],
        steps: [step1],
        evidenceKeys: [e1.primaryReason.evidenceKey],
      });
    }

    // Depth 2
    const d2Edges = adjacency.get(target1) || [];
    for (const e2 of d2Edges) {
      const target2 = e2.targetId;
      // Cycle prevention: cannot visit personId or target1
      if (target2 === personId || target2 === target1) continue;

      if (skilledPersonIds.has(target2)) {
        const toPerson2 = personMap.get(target2)!;
        const step2: LogicalStep = {
          fromId: toPerson.id,
          fromName: toPerson.name,
          toId: toPerson2.id,
          toName: toPerson2.name,
          type: e2.primaryReason.type,
          traversalDirection: e2.primaryReason.traversalDirection,
          company: e2.primaryReason.company,
          overlapFrom: e2.primaryReason.overlapFrom,
          overlapTo: e2.primaryReason.overlapTo,
          overlapMonths: e2.primaryReason.overlapMonths,
          text: e2.primaryReason.text,
          reasons: e2.reasons,
        };

        paths.push({
          candidateId: target2,
          depth: 2,
          personPath: [personId, target1, target2],
          edges: [e1, e2],
          steps: [step1, step2],
          evidenceKeys: [e1.primaryReason.evidenceKey, e2.primaryReason.evidenceKey],
        });
      }
    }
  }

  // Partition paths by candidate
  const candidatePathsMap = new Map<string, Array<{ path: InternalPath; tuple: PathRankingTuple }>>();
  for (const path of paths) {
    const tuple = computePathRankingTuple(path, personMap);
    const list = candidatePathsMap.get(path.candidateId) || [];
    list.push({ path, tuple });
    candidatePathsMap.set(path.candidateId, list);
  }

  // For each candidate, sort paths by total order tuple
  const candidateList: Array<{
    candidate: SearchCandidate;
    bestTuple: PathRankingTuple;
    normName: string;
    candId: string;
  }> = [];

  for (const [candId, pathEntries] of candidatePathsMap.entries()) {
    pathEntries.sort((a, b) => comparePathTuples(a.tuple, b.tuple));

    const bestEntry = pathEntries[0];
    const candidatePerson = personMap.get(candId)!;

    const formatChain = (entry: { path: InternalPath; tuple: PathRankingTuple }): CandidateChain => {
      const parts: string[] = [];
      for (let i = 0; i < entry.path.steps.length; i++) {
        const step = entry.path.steps[i];
        if (i === 0) {
          parts.push(step.fromName);
        }
        parts.push(step.text);
        parts.push(step.toName);
      }
      return {
        display: parts.join(' → '),
        steps: entry.path.steps,
      };
    };

    const primaryChain = formatChain(bestEntry);
    const rawAlternatives = pathEntries.slice(1);
    const totalAlternativeChains = rawAlternatives.length;
    const cappedAlternatives = rawAlternatives.slice(0, 20).map(formatChain);
    const alternativesTruncated = totalAlternativeChains > 20;

    // Skills sorted deterministically by normalized token
    const skills = (personSkillsMap.get(candId) || []).slice().sort((a, b) =>
      normalizeSkill(a).localeCompare(normalizeSkill(b))
    );

    const personObj: CandidatePerson = {
      id: candidatePerson.id,
      name: candidatePerson.name,
      location: candidatePerson.location,
      skills,
    };

    const searchCandidate: SearchCandidate = {
      person: personObj,
      depth: bestEntry.tuple.depth,
      primaryChain,
      alternativeChains: cappedAlternatives,
      totalAlternativeChains,
      alternativesTruncated,
    };

    candidateList.push({
      candidate: searchCandidate,
      bestTuple: bestEntry.tuple,
      normName: normalizeName(candidatePerson.name),
      candId,
    });
  }

  // Sort candidates by primary path's complete tuple, then normalized candidate name, then candidate ID
  candidateList.sort((a, b) => {
    const cmp = comparePathTuples(a.bestTuple, b.bestTuple);
    if (cmp !== 0) return cmp;
    const nameCmp = a.normName.localeCompare(b.normName);
    if (nameCmp !== 0) return nameCmp;
    return a.candId.localeCompare(b.candId);
  });

  const results = candidateList.map((c) => c.candidate);

  return {
    query: {
      personId: startingPerson.id,
      personName: startingPerson.name,
      skill: rawSkill,
    },
    resultsCount: results.length,
    results,
  };
}
