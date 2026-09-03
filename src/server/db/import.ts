import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseClient, getDatabaseClient } from './client.js';
import {
  TalentGraphSeed,
  SeedPerson,
  ImportResult,
  StalePurgeSummary,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const BUNDLED_SEED_PATH = path.resolve(__dirname, '../../../talent-graph-seed.json');

export function normalizeCompany(company: string): string {
  return company.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeSkill(skill: string): string {
  return skill.trim().toLowerCase();
}

export function getCurrentUtcMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  canonicalSeed: TalentGraphSeed;
}

export function validateAndCanonicalizeSeed(
  raw: any,
  asOfMonth: string
): { canonicalSeed: TalentGraphSeed; warnings: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Seed data must be a JSON object');
  }

  if (!Array.isArray(raw.people)) {
    throw new Error('Seed data must contain a "people" array');
  }

  const dateRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  const warnings: string[] = [];

  const seenPersonIds = new Set<string>();
  const rawPeople: any[] = raw.people;

  // Step 1: Preliminary pass to gather valid person IDs
  const validIds = new Set<string>();
  for (let i = 0; i < rawPeople.length; i++) {
    const p = rawPeople[i];
    if (typeof p?.id === 'string' && p.id.trim() !== '') {
      validIds.add(p.id.trim());
    }
  }

  const processedPeople: SeedPerson[] = [];

  for (let i = 0; i < rawPeople.length; i++) {
    const p = rawPeople[i];
    if (!p || typeof p !== 'object') {
      throw new Error(`Person at index ${i} must be an object`);
    }

    if (typeof p.id !== 'string' || p.id.trim() === '') {
      throw new Error(`Person at index ${i} must have a non-empty string "id"`);
    }
    const id = p.id.trim();

    if (seenPersonIds.has(id)) {
      throw new Error(`Duplicate person id: "${id}"`);
    }
    seenPersonIds.add(id);

    if (typeof p.name !== 'string' || p.name.trim() === '') {
      throw new Error(`Person "${id}" must have a non-empty string "name"`);
    }
    const name = p.name.trim();
    const location = typeof p.location === 'string' ? p.location.trim() : null;

    // Validate skills
    if (!Array.isArray(p.skills)) {
      throw new Error(`Person "${id}" must have a "skills" array`);
    }

    const seenNormSkills = new Set<string>();
    const cleanedSkills: string[] = [];

    for (let sIdx = 0; sIdx < p.skills.length; sIdx++) {
      const s = p.skills[sIdx];
      if (typeof s !== 'string' || s.trim() === '') {
        throw new Error(`Person "${id}" has invalid or empty skill at index ${sIdx}`);
      }
      const trimmedSkill = s.trim();
      const normSkill = normalizeSkill(trimmedSkill);
      if (seenNormSkills.has(normSkill)) {
        throw new Error(`Person "${id}" has duplicate skill "${trimmedSkill}"`);
      }
      seenNormSkills.add(normSkill);
      cleanedSkills.push(trimmedSkill);
    }

    // Validate employment
    if (!Array.isArray(p.employment)) {
      throw new Error(`Person "${id}" must have an "employment" array`);
    }

    const seenEmploymentKeys = new Set<string>();
    const cleanedEmployment = [];

    for (let eIdx = 0; eIdx < p.employment.length; eIdx++) {
      const e = p.employment[eIdx];
      if (!e || typeof e !== 'object') {
        throw new Error(`Person "${id}" has invalid employment at index ${eIdx}`);
      }
      if (typeof e.company !== 'string' || e.company.trim() === '') {
        throw new Error(`Person "${id}" employment index ${eIdx} must have non-empty "company"`);
      }
      if (typeof e.title !== 'string' || e.title.trim() === '') {
        throw new Error(`Person "${id}" employment index ${eIdx} must have non-empty "title"`);
      }
      if (typeof e.from !== 'string' || !dateRegex.test(e.from)) {
        throw new Error(`Person "${id}" employment index ${eIdx} has invalid "from" date: "${e.from}"`);
      }
      const from = e.from;
      let to: string | null = null;
      if (e.to !== null && e.to !== undefined) {
        if (typeof e.to !== 'string' || !dateRegex.test(e.to)) {
          throw new Error(`Person "${id}" employment index ${eIdx} has invalid "to" date: "${e.to}"`);
        }
        if (e.to < from) {
          throw new Error(`Person "${id}" employment "to" date (${e.to}) precedes "from" date (${from})`);
        }
        to = e.to;
      } else {
        // Ongoing record: cannot start after asOfMonth
        if (from > asOfMonth) {
          throw new Error(`Person "${id}" ongoing employment cannot start in future month (${from} > ${asOfMonth})`);
        }
      }

      const normComp = normalizeCompany(e.company);
      const naturalKey = `${normComp}:::${from}`;
      if (seenEmploymentKeys.has(naturalKey)) {
        throw new Error(`Person "${id}" has duplicate employment for company "${e.company}" from "${from}"`);
      }
      seenEmploymentKeys.add(naturalKey);

      cleanedEmployment.push({
        company: e.company.trim(),
        title: e.title.trim(),
        from,
        to,
      });
    }

    // Validate referral
    let referredBy: string | null = null;
    if (p.referred_by !== undefined && p.referred_by !== null && String(p.referred_by).trim() !== '') {
      const rawRef = String(p.referred_by).trim();
      if (rawRef === id) {
        throw new Error(`Self-referral rejected: Person "${id}" cannot be referred by self`);
      }
      if (!validIds.has(rawRef)) {
        warnings.push(`Dangling referral from person "${id}" to missing person "${rawRef}" cleared`);
        referredBy = null;
      } else {
        referredBy = rawRef;
      }
    }

    processedPeople.push({
      id,
      name,
      location,
      skills: cleanedSkills,
      employment: cleanedEmployment,
      referred_by: referredBy,
    });
  }

  // Canonical sorting
  processedPeople.sort((a, b) => a.id.localeCompare(b.id));

  for (const person of processedPeople) {
    person.skills.sort((a, b) => normalizeSkill(a).localeCompare(normalizeSkill(b)));
    person.employment.sort((a, b) => {
      const cmp = a.from.localeCompare(b.from);
      if (cmp !== 0) return cmp;
      return normalizeCompany(a.company).localeCompare(normalizeCompany(b.company));
    });
  }

  return {
    canonicalSeed: { people: processedPeople },
    warnings,
  };
}

export function computeHashes(
  canonicalSeed: TalentGraphSeed,
  asOfMonth: string
): { inputHash: string; effectiveSnapshotHash: string } {
  const inputPayload = JSON.stringify(canonicalSeed.people);
  const inputHash = crypto.createHash('sha256').update(inputPayload, 'utf8').digest('hex');
  const effectivePayload = `${inputHash}:${asOfMonth}`;
  const effectiveSnapshotHash = crypto.createHash('sha256').update(effectivePayload, 'utf8').digest('hex');

  return { inputHash, effectiveSnapshotHash };
}

export interface StintOverlap {
  overlapFrom: string;
  overlapTo: string | null;
  overlapMonths: number;
}

export function calculateOverlap(
  fromA: string,
  toA: string | null,
  fromB: string,
  toB: string | null,
  asOfMonth: string
): StintOverlap | null {
  const effectiveToA = toA || asOfMonth;
  const effectiveToB = toB || asOfMonth;

  const overlapStart = fromA > fromB ? fromA : fromB;
  const overlapEnd = effectiveToA < effectiveToB ? effectiveToA : effectiveToB;

  if (overlapStart > overlapEnd) {
    return null;
  }

  const [y1, m1] = overlapStart.split('-').map(Number);
  const [y2, m2] = overlapEnd.split('-').map(Number);
  const overlapMonths = (y2 - y1) * 12 + (m2 - m1) + 1;

  // If both were ongoing, overlapTo is null per contract
  const overlapTo = toA === null && toB === null ? null : overlapEnd;

  return {
    overlapFrom: overlapStart,
    overlapTo,
    overlapMonths,
  };
}

export async function importTalentGraph(options?: {
  seedData?: any;
  asOfMonth?: string;
  client?: DatabaseClient;
}): Promise<ImportResult> {
  const db = options?.client || (await getDatabaseClient());
  const asOfMonth = options?.asOfMonth || getCurrentUtcMonth();

  let rawData = options?.seedData;
  if (rawData === undefined) {
    const content = fs.readFileSync(BUNDLED_SEED_PATH, 'utf-8');
    rawData = JSON.parse(content);
  }

  const { canonicalSeed, warnings } = validateAndCanonicalizeSeed(rawData, asOfMonth);
  const { inputHash, effectiveSnapshotHash } = computeHashes(canonicalSeed, asOfMonth);

  return await db.transaction(async (tx) => {
    // Check previous import state
    const priorState = await tx.query(
      'SELECT input_hash, effective_snapshot_hash, as_of_month FROM import_state WHERE singleton = TRUE;'
    );
    const idempotentCheckPassed =
      priorState.rows.length > 0 &&
      priorState.rows[0].effective_snapshot_hash === effectiveSnapshotHash;

    // Create temporary staging tables
    await tx.exec(`
      CREATE TEMP TABLE stage_people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        referred_by TEXT
      ) ON COMMIT DROP;

      CREATE TEMP TABLE stage_skills (
        person_id TEXT NOT NULL,
        skill TEXT NOT NULL,
        normalized_skill TEXT NOT NULL,
        PRIMARY KEY (person_id, normalized_skill)
      ) ON COMMIT DROP;

      CREATE TEMP TABLE stage_employment (
        person_id TEXT NOT NULL,
        company TEXT NOT NULL,
        normalized_company TEXT NOT NULL,
        title TEXT NOT NULL,
        from_date TEXT NOT NULL,
        to_date TEXT,
        PRIMARY KEY (person_id, normalized_company, from_date)
      ) ON COMMIT DROP;
    `);

    // Populate staging tables
    for (const p of canonicalSeed.people) {
      await tx.query(
        'INSERT INTO stage_people (id, name, location, referred_by) VALUES ($1, $2, $3, $4);',
        [p.id, p.name, p.location, p.referred_by]
      );

      for (const skill of p.skills) {
        await tx.query(
          'INSERT INTO stage_skills (person_id, skill, normalized_skill) VALUES ($1, $2, $3);',
          [p.id, skill, normalizeSkill(skill)]
        );
      }

      for (const emp of p.employment) {
        await tx.query(
          'INSERT INTO stage_employment (person_id, company, normalized_company, title, from_date, to_date) VALUES ($1, $2, $3, $4, $5, $6);',
          [p.id, emp.company, normalizeCompany(emp.company), emp.title, emp.from, emp.to]
        );
      }
    }

    // Compute stale records before purging
    const peopleToDeleteRes = await tx.query(
      'SELECT count(*)::int as count FROM people WHERE id NOT IN (SELECT id FROM stage_people);'
    );
    const peopleDeleted = peopleToDeleteRes.rows[0].count;

    const skillsToDeleteRes = await tx.query(`
      SELECT count(*)::int as count FROM skills s
      WHERE s.person_id IN (SELECT id FROM stage_people)
      AND NOT EXISTS (
        SELECT 1 FROM stage_skills ss
        WHERE ss.person_id = s.person_id AND ss.normalized_skill = s.normalized_skill
      );
    `);
    const skillsDeleted = skillsToDeleteRes.rows[0].count;

    const empToDeleteRes = await tx.query(`
      SELECT count(*)::int as count FROM employment e
      WHERE e.person_id IN (SELECT id FROM stage_people)
      AND NOT EXISTS (
        SELECT 1 FROM stage_employment se
        WHERE se.person_id = e.person_id
          AND se.normalized_company = e.normalized_company
          AND se.from_date = e.from_date
      );
    `);
    const employmentDeleted = empToDeleteRes.rows[0].count;

    const referralsClearedRes = await tx.query(`
      SELECT count(*)::int as count FROM people p
      JOIN stage_people sp ON p.id = sp.id
      WHERE p.referred_by IS NOT NULL AND sp.referred_by IS NULL;
    `);
    const referralsCleared = referralsClearedRes.rows[0].count;

    // Reconcile People:
    // 1. Delete people absent from staging (cascades to skills, employment, connections)
    await tx.exec('DELETE FROM people WHERE id NOT IN (SELECT id FROM stage_people);');

    // 2. Upsert all people with referred_by temporarily null to resolve forward references
    await tx.exec(`
      INSERT INTO people (id, name, location, referred_by, updated_at)
      SELECT id, name, location, NULL, NOW() FROM stage_people
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        location = EXCLUDED.location,
        updated_at = NOW();
    `);

    // 3. Update referred_by now that all person records are guaranteed to exist
    await tx.exec(`
      UPDATE people p
      SET referred_by = s.referred_by, updated_at = NOW()
      FROM stage_people s
      WHERE p.id = s.id AND (p.referred_by IS DISTINCT FROM s.referred_by);
    `);

    // Reconcile Skills:
    await tx.exec(`
      DELETE FROM skills s
      WHERE NOT EXISTS (
        SELECT 1 FROM stage_skills ss
        WHERE ss.person_id = s.person_id AND ss.normalized_skill = s.normalized_skill
      );
    `);

    await tx.exec(`
      INSERT INTO skills (person_id, skill)
      SELECT person_id, skill FROM stage_skills
      ON CONFLICT (person_id, normalized_skill)
      DO UPDATE SET skill = EXCLUDED.skill;
    `);

    // Reconcile Employment:
    await tx.exec(`
      DELETE FROM employment e
      WHERE NOT EXISTS (
        SELECT 1 FROM stage_employment se
        WHERE se.person_id = e.person_id
          AND se.normalized_company = e.normalized_company
          AND se.from_date = e.from_date
      );
    `);

    await tx.exec(`
      INSERT INTO employment (person_id, company, title, from_date, to_date)
      SELECT person_id, company, title, from_date, to_date FROM stage_employment
      ON CONFLICT (person_id, normalized_company, from_date)
      DO UPDATE SET
        company = EXCLUDED.company,
        title = EXCLUDED.title,
        to_date = EXCLUDED.to_date;
    `);

    // Rebuild Connections:
    await tx.exec('DELETE FROM connections;');

    // 1. Employment Overlaps (WORKED_WITH)
    const allEmployments = await tx.query(`
      SELECT id, person_id, normalized_company, from_date, to_date
      FROM employment
      ORDER BY id ASC;
    `);

    let logicalEmploymentConnections = 0;
    const empRows = allEmployments.rows;

    for (let i = 0; i < empRows.length; i++) {
      for (let j = i + 1; j < empRows.length; j++) {
        const e1 = empRows[i];
        const e2 = empRows[j];

        if (e1.person_id === e2.person_id) continue;
        if (e1.normalized_company !== e2.normalized_company) continue;

        const overlap = calculateOverlap(e1.from_date, e1.to_date, e2.from_date, e2.to_date, asOfMonth);
        if (overlap) {
          logicalEmploymentConnections++;

          // Insert directed edge e1 -> e2
          await tx.query(
            `INSERT INTO connections (
              source_id, target_id, connection_type,
              source_employment_id, target_employment_id,
              overlap_from, overlap_to, overlap_months,
              as_of_month, referrer_id, referee_id, traversal_direction
            ) VALUES ($1, $2, 'WORKED_WITH', $3, $4, $5, $6, $7, $8, NULL, NULL, 'SYMMETRIC');`,
            [e1.person_id, e2.person_id, e1.id, e2.id, overlap.overlapFrom, overlap.overlapTo, overlap.overlapMonths, asOfMonth]
          );

          // Insert symmetric edge e2 -> e1
          await tx.query(
            `INSERT INTO connections (
              source_id, target_id, connection_type,
              source_employment_id, target_employment_id,
              overlap_from, overlap_to, overlap_months,
              as_of_month, referrer_id, referee_id, traversal_direction
            ) VALUES ($1, $2, 'WORKED_WITH', $3, $4, $5, $6, $7, $8, NULL, NULL, 'SYMMETRIC');`,
            [e2.person_id, e1.person_id, e2.id, e1.id, overlap.overlapFrom, overlap.overlapTo, overlap.overlapMonths, asOfMonth]
          );
        }
      }
    }

    // 2. Referrals (REFERRED)
    const referrals = await tx.query(`
      SELECT id as referee_id, referred_by as referrer_id
      FROM people
      WHERE referred_by IS NOT NULL
      ORDER BY id ASC;
    `);

    let logicalReferrals = referrals.rows.length;

    for (const r of referrals.rows) {
      // Forward: referrer -> referee ("referred")
      await tx.query(
        `INSERT INTO connections (
          source_id, target_id, connection_type,
          source_employment_id, target_employment_id,
          overlap_from, overlap_to, overlap_months,
          as_of_month, referrer_id, referee_id, traversal_direction
        ) VALUES ($1, $2, 'REFERRED', NULL, NULL, NULL, NULL, NULL, $3, $4, $5, 'FORWARD');`,
        [r.referrer_id, r.referee_id, asOfMonth, r.referrer_id, r.referee_id]
      );

      // Reverse: referee -> referrer ("referred by")
      await tx.query(
        `INSERT INTO connections (
          source_id, target_id, connection_type,
          source_employment_id, target_employment_id,
          overlap_from, overlap_to, overlap_months,
          as_of_month, referrer_id, referee_id, traversal_direction
        ) VALUES ($1, $2, 'REFERRED', NULL, NULL, NULL, NULL, NULL, $3, $4, $5, 'REVERSE');`,
        [r.referee_id, r.referrer_id, asOfMonth, r.referrer_id, r.referee_id]
      );
    }

    // Update import state
    await tx.query(
      `INSERT INTO import_state (singleton, input_hash, effective_snapshot_hash, as_of_month, committed_at)
       VALUES (TRUE, $1, $2, $3, NOW())
       ON CONFLICT (singleton) DO UPDATE SET
         input_hash = EXCLUDED.input_hash,
         effective_snapshot_hash = EXCLUDED.effective_snapshot_hash,
         as_of_month = EXCLUDED.as_of_month,
         committed_at = NOW();`,
      [inputHash, effectiveSnapshotHash, asOfMonth]
    );

    // Fetch counts
    const peopleCountRes = await tx.query('SELECT count(*)::int as count FROM people;');
    const skillsCountRes = await tx.query('SELECT count(*)::int as count FROM skills;');
    const empCountRes = await tx.query('SELECT count(*)::int as count FROM employment;');
    const connCountRes = await tx.query('SELECT count(*)::int as count FROM connections;');

    const peopleCount = peopleCountRes.rows[0].count;
    const skillsCount = skillsCountRes.rows[0].count;
    const employmentCount = empCountRes.rows[0].count;
    const storedDirectedRowsCount = connCountRes.rows[0].count;
    const logicalConnectionsCount = logicalEmploymentConnections + logicalReferrals;

    const staleDetails: StalePurgeSummary = {
      peopleDeleted,
      skillsDeleted,
      employmentDeleted,
      referralsCleared,
      total: peopleDeleted + skillsDeleted + employmentDeleted + referralsCleared,
    };

    return {
      ok: true,
      inputHash,
      effectiveSnapshotHash,
      asOfMonth,
      idempotentCheckPassed,
      peopleCount,
      skillsCount,
      employmentCount,
      logicalConnectionsCount,
      storedDirectedRowsCount,
      staleRecordsPurged: staleDetails.total,
      staleDetails,
      warnings,
    };
  });
}
