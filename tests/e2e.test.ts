import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../src/server/app.js';
import { createDatabaseClient, DatabaseClient } from '../src/server/db/client.js';
import { importTalentGraph } from '../src/server/db/import.js';

describe('Story 4: Recruiter Frontend & End-to-End Verification Suite', () => {
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

  // Case 1: Primary Acceptance Test (Dana Ravid + Neo4j)
  it('Case 1: Primary Acceptance Test — Dana Ravid + Neo4j returns exactly 3 candidates with verified chains', async () => {
    const res = await fetch(`${baseUrl}/api/search?personId=p1&skill=Neo4j`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.query.personId).toBe('p1');
    expect(data.query.personName).toBe('Dana Ravid');
    expect(data.query.skill).toBe('Neo4j');
    expect(data.resultsCount).toBe(3);
    expect(data.results.length).toBe(3);

    const [cand1, cand2, cand3] = data.results;

    // Candidate 1: Yossi Bar-Lev at depth 1
    expect(cand1.person.id).toBe('p2');
    expect(cand1.person.name).toBe('Yossi Bar-Lev');
    expect(cand1.depth).toBe(1);
    expect(cand1.primaryChain.display).toBe(
      'Dana Ravid → worked with at Helix Robotics (2021-03 to 2023-05) → Yossi Bar-Lev'
    );
    expect(cand1.totalAlternativeChains).toBe(0);
    expect(cand1.alternativeChains).toEqual([]);

    // Candidate 2: Noa Frisch at depth 2 (primary via Yossi forward referral)
    expect(cand2.person.id).toBe('p7');
    expect(cand2.person.name).toBe('Noa Frisch');
    expect(cand2.depth).toBe(2);
    expect(cand2.primaryChain.display).toBe(
      'Dana Ravid → worked with at Helix Robotics (2021-03 to 2023-05) → Yossi Bar-Lev → referred → Noa Frisch'
    );

    // Candidate 3: Shira Levko at depth 2 (via Efrat Solomon)
    expect(cand3.person.id).toBe('p11');
    expect(cand3.person.name).toBe('Shira Levko');
    expect(cand3.depth).toBe(2);
    expect(cand3.primaryChain.display).toBe(
      'Dana Ravid → worked with at Helix Robotics (2024-02 to 2024-08) → Efrat Solomon → worked with at Orenda Labs (2022-01 to 2024-01) → Shira Levko'
    );
  });

  // Case 2: Progressive Disclosure & True Alternative Path Count
  it('Case 2: Progressive Disclosure — Noa Frisch exposes true alternative count of 1 and secondary path via Maya Tsur', async () => {
    const res = await fetch(`${baseUrl}/api/search?personId=p1&skill=Neo4j`);
    const data = await res.json();
    const noa = data.results.find((r: any) => r.person.id === 'p7');

    expect(noa).toBeDefined();
    expect(noa.totalAlternativeChains).toBe(1);
    expect(noa.alternativesTruncated).toBe(false);
    expect(noa.alternativeChains.length).toBe(1);

    const altChain = noa.alternativeChains[0];
    expect(altChain.display).toBe(
      'Dana Ravid → worked with at Helix Robotics (2023-09 to 2024-08) → Maya Tsur → referred by → Noa Frisch'
    );
    expect(altChain.steps.length).toBe(2);
    expect(altChain.steps[1].type).toBe('REFERRED');
    expect(altChain.steps[1].traversalDirection).toBe('REVERSE');
    expect(altChain.steps[1].text).toBe('referred by');
  });

  // Case 3: Bidirectional Referral & Reverse Traversal
  it('Case 3: Reverse Traversal — Noa Frisch reaches Dana Ravid for Kubernetes via reverse referral', async () => {
    const res = await fetch(`${baseUrl}/api/search?personId=p7&skill=Kubernetes`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.resultsCount).toBe(1);

    const dana = data.results[0];
    expect(dana.person.id).toBe('p1');
    expect(dana.person.name).toBe('Dana Ravid');
    expect(dana.depth).toBe(2);
    expect(dana.primaryChain.display).toBe(
      'Noa Frisch → referred by → Yossi Bar-Lev → worked with at Helix Robotics (2021-03 to 2023-05) → Dana Ravid'
    );
  });

  // Case 4: Searcher Exclusion Constraint
  it('Case 4: Searcher Exclusion — Searcher is never returned in candidates even if possessing the target skill', async () => {
    // Dana Ravid has Postgres, TypeScript, and Kubernetes
    const res = await fetch(`${baseUrl}/api/search?personId=p1&skill=Postgres`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const candidateIds = data.results.map((r: any) => r.person.id);
    expect(candidateIds).not.toContain('p1');
    expect(data.results.every((r: any) => r.depth > 0)).toBe(true);
  });

  // Case 5: Exact Skill Matching Constraint
  it('Case 5: Exact Skill Matching — Case-insensitive & trimmed match succeeds, substring matches return 0', async () => {
    // Case-insensitive + whitespace match
    const resExact = await fetch(`${baseUrl}/api/search?personId=p1&skill=%20%20neo4j%20%20`);
    expect(resExact.status).toBe(200);
    const dataExact = await resExact.json();
    expect(dataExact.resultsCount).toBe(3);

    // Substring match attempt "Neo"
    const resSub = await fetch(`${baseUrl}/api/search?personId=p1&skill=Neo`);
    expect(resSub.status).toBe(200);
    const dataSub = await resSub.json();
    expect(dataSub.resultsCount).toBe(0);
    expect(dataSub.results).toEqual([]);
  });

  // Case 6: Valid Empty Search Results
  it('Case 6: Empty Search — Returns HTTP 200 with resultsCount: 0 for unreachable or absent skill', async () => {
    const res = await fetch(`${baseUrl}/api/search?personId=p1&skill=Haskell`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.query.personId).toBe('p1');
    expect(data.query.skill).toBe('Haskell');
    expect(data.resultsCount).toBe(0);
    expect(data.results).toEqual([]);
  });

  // Case 7: Compound Edge Handling & Evidence Preservation
  it('Case 7: Compound Edge — Preserves both employment and referral evidence between same people', async () => {
    // Custom seed snapshot with Alice and Bob having both employment overlap and referral
    const compoundSeed = {
      people: [
        {
          id: 'c_u1',
          name: 'Alice Cooper',
          skills: ['Go'],
          employment: [{ company: 'FinTech Corp', title: 'Tech Lead', from: '2020-01', to: '2023-01' }],
          referred_by: null,
        },
        {
          id: 'c_u2',
          name: 'Bob Marley',
          skills: ['Elixir'],
          employment: [{ company: 'FinTech Corp', title: 'Software Engineer', from: '2021-01', to: '2022-01' }],
          referred_by: 'c_u1', // Alice referred Bob
        },
      ],
    };

    const importRes = await fetch(`${baseUrl}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: compoundSeed }),
    });
    expect(importRes.status).toBe(200);

    const searchRes = await fetch(`${baseUrl}/api/search?personId=c_u1&skill=Elixir`);
    expect(searchRes.status).toBe(200);

    const data = await searchRes.json();
    expect(data.resultsCount).toBe(1);

    const bob = data.results[0];
    expect(bob.person.id).toBe('c_u2');
    expect(bob.depth).toBe(1);

    const step = bob.primaryChain.steps[0];
    expect(step.type).toBe('REFERRED');
    expect(step.text).toBe('referred');
    expect(step.reasons.length).toBe(2);
    expect(step.reasons[0].type).toBe('REFERRED');
    expect(step.reasons[1].type).toBe('WORKED_WITH');
  });

  // Case 8: Total Ordering Tie-Breaker
  it('Case 8: Total Ordering Tie-Breaker — Forward referral outranks reverse referral which outranks coworker', async () => {
    // Re-import default bundled seed to restore standard state
    const restoreRes = await fetch(`${baseUrl}/api/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useDefaultSeed: true }),
    });
    expect(restoreRes.status).toBe(200);

    // Verify ordering for Noa Frisch: primary path is forward referral via Yossi, alternative is reverse referral via Maya
    const res = await fetch(`${baseUrl}/api/search?personId=p1&skill=Neo4j`);
    const data = await res.json();
    const noa = data.results.find((r: any) => r.person.id === 'p7');

    expect(noa.primaryChain.steps[1].type).toBe('REFERRED');
    expect(noa.primaryChain.steps[1].traversalDirection).toBe('FORWARD');
    expect(noa.alternativeChains[0].steps[1].type).toBe('REFERRED');
    expect(noa.alternativeChains[0].steps[1].traversalDirection).toBe('REVERSE');
  });
});
