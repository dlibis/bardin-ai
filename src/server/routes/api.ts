import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseClient, getDatabaseClient } from '../db/client.js';
import { importTalentGraph } from '../db/import.js';
import { searchTalentNetwork, normalizeName, normalizeSkill } from '../graph/traversal.js';

export function createApiRouter(clientGetter?: () => Promise<DatabaseClient>): Router {
  const router = Router();
  const getClient = clientGetter || getDatabaseClient;

  // GET /api/people
  router.get('/people', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = await getClient();

      const [peopleRes, skillsRes, empRes] = await Promise.all([
        db.query('SELECT id, name, location FROM people;'),
        db.query('SELECT person_id, skill, normalized_skill FROM skills;'),
        db.query('SELECT id, person_id, company, normalized_company, title, from_date, to_date FROM employment;'),
      ]);

      const personSkills = new Map<string, string[]>();
      for (const s of skillsRes.rows) {
        const list = personSkills.get(s.person_id) || [];
        list.push(s.skill);
        personSkills.set(s.person_id, list);
      }

      const personEmployment = new Map<string, any[]>();
      for (const e of empRes.rows) {
        const list = personEmployment.get(e.person_id) || [];
        list.push(e);
        personEmployment.set(e.person_id, list);
      }

      const people = peopleRes.rows.map((p) => {
        // Sort skills by normalized token
        const rawSkills = personSkills.get(p.id) || [];
        const sortedSkills = rawSkills.slice().sort((a, b) =>
          normalizeSkill(a).localeCompare(normalizeSkill(b))
        );

        // Compute latestRole:
        // 1. from descending
        // 2. effective to descending (null is later than any closed date)
        // 3. normalized company ascending
        // 4. title ascending
        // 5. employment id ascending
        const employments = personEmployment.get(p.id) || [];
        let latestRole: any = null;

        if (employments.length > 0) {
          const sortedEmp = employments.slice().sort((a, b) => {
            if (a.from_date !== b.from_date) {
              return b.from_date.localeCompare(a.from_date);
            }
            // null to_date is later than any closed date
            if (a.to_date === null && b.to_date !== null) return -1;
            if (a.to_date !== null && b.to_date === null) return 1;
            if (a.to_date !== null && b.to_date !== null && a.to_date !== b.to_date) {
              return b.to_date.localeCompare(a.to_date);
            }
            if (a.normalized_company !== b.normalized_company) {
              return a.normalized_company.localeCompare(b.normalized_company);
            }
            if (a.title !== b.title) {
              return a.title.localeCompare(b.title);
            }
            return a.id - b.id;
          });

          const r = sortedEmp[0];
          latestRole = {
            company: r.company,
            title: r.title,
            from: r.from_date,
            to: r.to_date,
            isCurrent: r.to_date === null,
          };
        }

        return {
          id: p.id,
          name: p.name,
          location: p.location,
          skills: sortedSkills,
          latestRole,
        };
      });

      // Sort people by normalized name, then person ID
      people.sort((a, b) => {
        const nameCmp = normalizeName(a.name).localeCompare(normalizeName(b.name));
        if (nameCmp !== 0) return nameCmp;
        return a.id.localeCompare(b.id);
      });

      res.status(200).json({ people });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/skills
  router.get('/skills', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = await getClient();
      const skillsRes = await db.query(`
        SELECT DISTINCT normalized_skill, MIN(BTRIM(skill) COLLATE "C") AS display_skill
        FROM skills
        GROUP BY normalized_skill
        ORDER BY normalized_skill ASC;
      `);

      const skills = skillsRes.rows.map((r: any) => r.display_skill);
      res.status(200).json({ skills });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/search
  router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = await getClient();
      const personId = req.query.personId;
      const skill = req.query.skill;

      if (typeof personId !== 'string' || personId.trim() === '') {
        res.status(400).json({
          error: 'INVALID_PERSON_ID',
          message: 'personId query parameter is required and must be a non-empty string',
        });
        return;
      }

      if (typeof skill !== 'string' || skill.trim() === '') {
        res.status(400).json({
          error: 'INVALID_SKILL',
          message: 'skill query parameter is required and must be a non-empty string',
        });
        return;
      }

      try {
        const result = await searchTalentNetwork({
          personId: personId.trim(),
          skill: skill.trim(),
          client: db,
        });
        res.status(200).json(result);
      } catch (err: any) {
        if (err.code === 'INVALID_PERSON_ID') {
          res.status(400).json({
            error: 'INVALID_PERSON_ID',
            message: err.message,
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  // POST /api/import
  router.post('/import', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = await getClient();
      const body = req.body || {};

      // Validate top-level keys
      const keys = Object.keys(body);
      const allowedKeys = ['useDefaultSeed', 'data'];
      const hasDisallowed = keys.some((k) => !allowedKeys.includes(k));

      if (hasDisallowed) {
        res.status(400).json({
          error: 'INVALID_IMPORT_MODE',
          message: `Unexpected request fields: ${keys.filter((k) => !allowedKeys.includes(k)).join(', ')}`,
        });
        return;
      }

      if (keys.includes('useDefaultSeed') && keys.includes('data')) {
        res.status(400).json({
          error: 'INVALID_IMPORT_MODE',
          message: 'Cannot supply both "useDefaultSeed" and "data" in request',
        });
        return;
      }

      if (keys.includes('useDefaultSeed') && body.useDefaultSeed !== true) {
        res.status(400).json({
          error: 'INVALID_IMPORT_MODE',
          message: '"useDefaultSeed" must be true if supplied',
        });
        return;
      }

      let seedData: any = undefined;
      if (body.data !== undefined) {
        if (!body.data || typeof body.data !== 'object') {
          res.status(400).json({
            error: 'INVALID_SNAPSHOT',
            message: '"data" must be an object containing a "people" array',
          });
          return;
        }
        seedData = body.data;
      }

      try {
        const importResult = await importTalentGraph({
          client: db,
          seedData,
        });

        res.status(200).json({
          success: true,
          warnings: importResult.warnings,
          stats: {
            peopleCount: importResult.peopleCount,
            employmentCount: importResult.employmentCount,
            skillsCount: importResult.skillsCount,
            logicalConnectionReasonsCount: importResult.logicalConnectionsCount,
            storedDirectedEvidenceRowsCount: importResult.storedDirectedRowsCount,
            asOfMonth: importResult.asOfMonth,
            inputHash: importResult.inputHash,
            effectiveSnapshotHash: importResult.effectiveSnapshotHash,
            idempotentCheckPassed: importResult.idempotentCheckPassed,
            reconciliation: {
              peoplePurged: importResult.staleDetails.peopleDeleted,
              skillsPurged: importResult.staleDetails.skillsDeleted,
              employmentPurged: importResult.staleDetails.employmentDeleted,
              referralsCleared: importResult.staleDetails.referralsCleared,
              totalPurged: importResult.staleRecordsPurged,
            },
          },
        });
      } catch (err: any) {
        res.status(400).json({
          error: 'INVALID_SNAPSHOT',
          message: err.message,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}
