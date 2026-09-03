import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseClient, DatabaseClient } from '../src/server/db/client.js';
import { importTalentGraph, validateAndCanonicalizeSeed } from '../src/server/db/import.js';

describe('Story 1: Data Model, Constraints & Ingestion Engine', () => {
  let client: DatabaseClient;

  beforeEach(async () => {
    client = await createDatabaseClient({ inMemory: true });
  });

  it('creates all tables, constraints, and indexes without error', async () => {
    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tableNames = tablesRes.rows.map((r: any) => r.table_name);
    expect(tableNames).toContain('people');
    expect(tableNames).toContain('skills');
    expect(tableNames).toContain('employment');
    expect(tableNames).toContain('connections');
    expect(tableNames).toContain('import_state');
  });

  it('imports bundled seed data with exact expected counts and 40 directed rows', async () => {
    const res = await importTalentGraph({ client, asOfMonth: '2026-09' });

    expect(res.ok).toBe(true);
    expect(res.peopleCount).toBe(14);
    expect(res.skillsCount).toBe(38);
    expect(res.employmentCount).toBe(16);
    expect(res.logicalConnectionsCount).toBe(20);
    expect(res.storedDirectedRowsCount).toBe(40);
    expect(res.idempotentCheckPassed).toBe(false);
    expect(res.warnings).toEqual([]);

    // Check p1 forward reference to p4
    const p1 = await client.query('SELECT id, name, referred_by FROM people WHERE id = $1;', ['p1']);
    expect(p1.rows[0].referred_by).toBe('p4');

    // Check connections distribution: 28 WORKED_WITH, 12 REFERRED
    const workedWith = await client.query(
      "SELECT count(*)::int as count FROM connections WHERE connection_type = 'WORKED_WITH';"
    );
    expect(workedWith.rows[0].count).toBe(28);

    const referred = await client.query(
      "SELECT count(*)::int as count FROM connections WHERE connection_type = 'REFERRED';"
    );
    expect(referred.rows[0].count).toBe(12);
  });

  it('guarantees idempotency on immediate re-import of identical seed', async () => {
    const firstRun = await importTalentGraph({ client, asOfMonth: '2026-09' });
    expect(firstRun.idempotentCheckPassed).toBe(false);

    const secondRun = await importTalentGraph({ client, asOfMonth: '2026-09' });
    expect(secondRun.idempotentCheckPassed).toBe(true);
    expect(secondRun.inputHash).toBe(firstRun.inputHash);
    expect(secondRun.effectiveSnapshotHash).toBe(firstRun.effectiveSnapshotHash);
    expect(secondRun.staleRecordsPurged).toBe(0);
    expect(secondRun.peopleCount).toBe(14);
    expect(secondRun.storedDirectedRowsCount).toBe(40);
  });

  it('handles forward references where person A references person B defined later', async () => {
    const customSeed = {
      people: [
        {
          id: 'person_a',
          name: 'Person A',
          skills: ['TypeScript'],
          employment: [],
          referred_by: 'person_b', // defined next
        },
        {
          id: 'person_b',
          name: 'Person B',
          skills: ['Go'],
          employment: [],
          referred_by: null,
        },
      ],
    };

    const res = await importTalentGraph({ client, seedData: customSeed, asOfMonth: '2026-09' });
    expect(res.ok).toBe(true);
    expect(res.peopleCount).toBe(2);

    const a = await client.query('SELECT referred_by FROM people WHERE id = $1;', ['person_a']);
    expect(a.rows[0].referred_by).toBe('person_b');

    // Check connections: person_b -> person_a (FORWARD), person_a -> person_b (REVERSE)
    const conns = await client.query(
      'SELECT source_id, target_id, traversal_direction FROM connections ORDER BY traversal_direction ASC;'
    );
    expect(conns.rows).toEqual([
      { source_id: 'person_b', target_id: 'person_a', traversal_direction: 'FORWARD' },
      { source_id: 'person_a', target_id: 'person_b', traversal_direction: 'REVERSE' },
    ]);
  });

  it('clears dangling referrals to absent people with a warning', async () => {
    const customSeed = {
      people: [
        {
          id: 'p1',
          name: 'Dana Ravid',
          skills: ['Postgres'],
          employment: [],
          referred_by: 'p999', // does not exist in seed
        },
      ],
    };

    const res = await importTalentGraph({ client, seedData: customSeed, asOfMonth: '2026-09' });
    expect(res.warnings.length).toBe(1);
    expect(res.warnings[0]).toContain('Dangling referral from person "p1" to missing person "p999" cleared');

    const p = await client.query('SELECT referred_by FROM people WHERE id = $1;', ['p1']);
    expect(p.rows[0].referred_by).toBeNull();
  });

  it('rejects self-referrals atomically', async () => {
    const invalidSeed = {
      people: [
        {
          id: 'p1',
          name: 'Dana Ravid',
          skills: ['Postgres'],
          employment: [],
          referred_by: 'p1', // self-referral
        },
      ],
    };

    await expect(importTalentGraph({ client, seedData: invalidSeed, asOfMonth: '2026-09' })).rejects.toThrow(
      'Self-referral rejected'
    );
  });

  it('rejects invalid date formats and chronology violations', async () => {
    const invalidDateFormat = {
      people: [
        {
          id: 'p1',
          name: 'Dana',
          skills: ['Postgres'],
          employment: [{ company: 'Acme', title: 'Eng', from: '2021/05', to: null }],
        },
      ],
    };
    await expect(importTalentGraph({ client, seedData: invalidDateFormat, asOfMonth: '2026-09' })).rejects.toThrow(
      'invalid "from" date'
    );

    const chronologicalViolation = {
      people: [
        {
          id: 'p1',
          name: 'Dana',
          skills: ['Postgres'],
          employment: [{ company: 'Acme', title: 'Eng', from: '2023-05', to: '2022-01' }],
        },
      ],
    };
    await expect(
      importTalentGraph({ client, seedData: chronologicalViolation, asOfMonth: '2026-09' })
    ).rejects.toThrow('precedes "from" date');
  });

  it('reconciles deleted records: removing an employment deletes record and connection row', async () => {
    // Initial seed with two overlapping employees at Helix Robotics
    const seed1 = {
      people: [
        {
          id: 'p1',
          name: 'Dana',
          skills: ['TypeScript'],
          employment: [{ company: 'Helix Robotics', title: 'Eng', from: '2021-03', to: '2024-08' }],
        },
        {
          id: 'p2',
          name: 'Yossi',
          skills: ['Go'],
          employment: [{ company: 'Helix Robotics', title: 'Eng', from: '2020-01', to: '2023-05' }],
        },
      ],
    };

    const res1 = await importTalentGraph({ client, seedData: seed1, asOfMonth: '2026-09' });
    expect(res1.storedDirectedRowsCount).toBe(2);
    expect(res1.employmentCount).toBe(2);

    // Seed 2: Yossi leaves company (employment removed)
    const seed2 = {
      people: [
        {
          id: 'p1',
          name: 'Dana',
          skills: ['TypeScript'],
          employment: [{ company: 'Helix Robotics', title: 'Eng', from: '2021-03', to: '2024-08' }],
        },
        {
          id: 'p2',
          name: 'Yossi',
          skills: ['Go'],
          employment: [], // removed!
        },
      ],
    };

    const res2 = await importTalentGraph({ client, seedData: seed2, asOfMonth: '2026-09' });
    expect(res2.employmentCount).toBe(1);
    expect(res2.staleDetails.employmentDeleted).toBe(1);
    expect(res2.storedDirectedRowsCount).toBe(0); // connection row cleansed!
  });

  it('clears all tables when explicit empty people array is supplied', async () => {
    // First import bundled seed
    await importTalentGraph({ client, asOfMonth: '2026-09' });

    // Explicit empty snapshot
    const res = await importTalentGraph({ client, seedData: { people: [] }, asOfMonth: '2026-09' });
    expect(res.ok).toBe(true);
    expect(res.peopleCount).toBe(0);
    expect(res.skillsCount).toBe(0);
    expect(res.employmentCount).toBe(0);
    expect(res.storedDirectedRowsCount).toBe(0);
    expect(res.staleDetails.peopleDeleted).toBe(14);
  });
});
