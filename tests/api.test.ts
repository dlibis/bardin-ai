import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../src/server/app.js';
import { createDatabaseClient, DatabaseClient } from '../src/server/db/client.js';
import { importTalentGraph } from '../src/server/db/import.js';

describe('Story 3: REST API Service & Request Validation', () => {
  let client: DatabaseClient;
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    client = await createDatabaseClient({ inMemory: true });
    await importTalentGraph({ client, asOfMonth: '2026-09' });

    const app = createApp(async () => client);
    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('GET /api/people', () => {
    it('returns all people sorted by normalized name with latestRole and isCurrent', async () => {
      const res = await fetch(`${baseUrl}/api/people`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.people)).toBe(true);
      expect(data.people.length).toBe(14);

      // Verify sorting by normalized name
      for (let i = 1; i < data.people.length; i++) {
        const prev = data.people[i - 1].name.trim().toLowerCase();
        const curr = data.people[i].name.trim().toLowerCase();
        expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
      }

      // Check Dana Ravid (employment ended 2024-08, so isCurrent must be false)
      const dana = data.people.find((p: any) => p.id === 'p1');
      expect(dana).toBeDefined();
      expect(dana.name).toBe('Dana Ravid');
      expect(dana.skills).toEqual(['Kubernetes', 'Postgres', 'TypeScript']);
      expect(dana.latestRole).toEqual({
        company: 'Helix Robotics',
        title: 'Senior Backend Engineer',
        from: '2021-03',
        to: '2024-08',
        isCurrent: false,
      });

      // Check Maya Tsur (ongoing employment, to is null, so isCurrent must be true)
      const maya = data.people.find((p: any) => p.id === 'p3');
      expect(maya).toBeDefined();
      expect(maya.latestRole).toEqual({
        company: 'Helix Robotics',
        title: 'Frontend Engineer',
        from: '2023-09',
        to: null,
        isCurrent: true,
      });
    });
  });

  describe('GET /api/skills', () => {
    it('returns distinct skills sorted in ascending order', async () => {
      const res = await fetch(`${baseUrl}/api/skills`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.skills)).toBe(true);
      expect(data.skills.length).toBeGreaterThan(0);
      expect(data.skills).toContain('Neo4j');
      expect(data.skills).toContain('Postgres');
      expect(data.skills).toContain('TypeScript');

      // Verify ascending sorting
      for (let i = 1; i < data.skills.length; i++) {
        const prev = data.skills[i - 1].trim().toLowerCase();
        const curr = data.skills[i].trim().toLowerCase();
        expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
      }
    });
  });

  describe('GET /api/search', () => {
    it('returns all 3 candidates for Dana Ravid searching for Neo4j', async () => {
      const res = await fetch(`${baseUrl}/api/search?personId=p1&skill=Neo4j`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.query).toEqual({
        personId: 'p1',
        personName: 'Dana Ravid',
        skill: 'Neo4j',
      });
      expect(data.resultsCount).toBe(3);
      expect(data.results.length).toBe(3);

      const [c1, c2, c3] = data.results;
      expect(c1.person.id).toBe('p2'); // Yossi
      expect(c1.depth).toBe(1);

      expect(c2.person.id).toBe('p7'); // Noa
      expect(c2.depth).toBe(2);
      expect(c2.primaryChain.display).toContain('Yossi Bar-Lev → referred → Noa Frisch');
      expect(c2.alternativeChains[0].display).toContain('Maya Tsur → referred by → Noa Frisch');

      expect(c3.person.id).toBe('p11'); // Shira
      expect(c3.depth).toBe(2);
    });

    it('rejects request when personId parameter is missing', async () => {
      const res = await fetch(`${baseUrl}/api/search?skill=Neo4j`);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe('INVALID_PERSON_ID');
      expect(data.message).toContain('personId query parameter is required');
    });

    it('rejects request when personId does not exist in database', async () => {
      const res = await fetch(`${baseUrl}/api/search?personId=unknown_p999&skill=Neo4j`);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe('INVALID_PERSON_ID');
      expect(data.message).toContain('Person with id "unknown_p999" not found');
    });

    it('rejects request when skill parameter is missing or blank', async () => {
      const res = await fetch(`${baseUrl}/api/search?personId=p1&skill=%20%20`);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toBe('INVALID_SKILL');
      expect(data.message).toContain('skill query parameter is required');
    });
  });

  describe('POST /api/import', () => {
    it('successfully imports with { useDefaultSeed: true } mode', async () => {
      const res = await fetch(`${baseUrl}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useDefaultSeed: true }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.stats.peopleCount).toBe(14);
      expect(data.stats.logicalConnectionReasonsCount).toBe(20);
      expect(data.stats.storedDirectedEvidenceRowsCount).toBe(40);
    });

    it('rejects arbitrary server file paths with INVALID_IMPORT_MODE', async () => {
      const res = await fetch(`${baseUrl}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedFilePath: '/etc/passwd' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_IMPORT_MODE');
      expect(data.message).toContain('Unexpected request fields: seedFilePath');
    });

    it('rejects invalid snapshot schema with INVALID_SNAPSHOT', async () => {
      const invalidSnapshot = {
        data: {
          people: [
            {
              id: 'bad_p1',
              name: 'Bad Person',
              skills: ['Rust'],
              employment: [{ company: 'Test', title: 'Dev', from: '2024/05', to: null }],
            },
          ],
        },
      };

      const res = await fetch(`${baseUrl}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidSnapshot),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('INVALID_SNAPSHOT');
    });

    it('allows clearing the graph with explicit empty people array', async () => {
      const clearSnapshot = {
        data: {
          people: [],
        },
      };

      const res = await fetch(`${baseUrl}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clearSnapshot),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.stats.peopleCount).toBe(0);

      // Verify /api/people is now empty
      const peopleRes = await fetch(`${baseUrl}/api/people`);
      const peopleData = await peopleRes.json();
      expect(peopleData.people.length).toBe(0);

      // Re-import default seed to leave db in populated state
      await fetch(`${baseUrl}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useDefaultSeed: true }),
      });
    });
  });
});
