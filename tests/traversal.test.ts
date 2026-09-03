import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabaseClient, DatabaseClient } from '../src/server/db/client.js';
import { importTalentGraph } from '../src/server/db/import.js';
import { searchTalentNetwork } from '../src/server/graph/traversal.js';

describe('Story 2: Connection Derivation & 2-Hop Graph Traversal Engine', () => {
  let client: DatabaseClient;

  beforeEach(async () => {
    client = await createDatabaseClient({ inMemory: true });
    await importTalentGraph({ client, asOfMonth: '2026-09' });
  });

  it('verifies Primary Acceptance Test: Dana Ravid + Neo4j returns exactly 3 candidates with verified chains', async () => {
    const res = await searchTalentNetwork({
      personId: 'p1',
      skill: 'Neo4j',
      client,
    });

    expect(res.resultsCount).toBe(3);
    expect(res.results.length).toBe(3);

    const [cand1, cand2, cand3] = res.results;

    // 1. Yossi Bar-Lev at depth 1
    expect(cand1.person.id).toBe('p2');
    expect(cand1.person.name).toBe('Yossi Bar-Lev');
    expect(cand1.depth).toBe(1);
    expect(cand1.primaryChain.display).toBe(
      'Dana Ravid → worked with at Helix Robotics (2021-03 to 2023-05) → Yossi Bar-Lev'
    );
    expect(cand1.alternativeChains).toEqual([]);
    expect(cand1.totalAlternativeChains).toBe(0);

    // 2. Noa Frisch at depth 2 (Primary via Yossi forward referral; Alternative via Maya reverse referral)
    expect(cand2.person.id).toBe('p7');
    expect(cand2.person.name).toBe('Noa Frisch');
    expect(cand2.depth).toBe(2);
    expect(cand2.primaryChain.display).toBe(
      'Dana Ravid → worked with at Helix Robotics (2021-03 to 2023-05) → Yossi Bar-Lev → referred → Noa Frisch'
    );
    expect(cand2.totalAlternativeChains).toBe(1);
    expect(cand2.alternativeChains.length).toBe(1);
    expect(cand2.alternativeChains[0].display).toBe(
      'Dana Ravid → worked with at Helix Robotics (2023-09 to 2024-08) → Maya Tsur → referred by → Noa Frisch'
    );

    // 3. Shira Levko at depth 2 (via Efrat Solomon)
    expect(cand3.person.id).toBe('p11');
    expect(cand3.person.name).toBe('Shira Levko');
    expect(cand3.depth).toBe(2);
    expect(cand3.primaryChain.display).toBe(
      'Dana Ravid → worked with at Helix Robotics (2024-02 to 2024-08) → Efrat Solomon → worked with at Orenda Labs (2022-01 to 2024-01) → Shira Levko'
    );
  });

  it('performs reverse traversal from referee to referrer', async () => {
    const res = await searchTalentNetwork({
      personId: 'p7', // Noa Frisch
      skill: 'Kubernetes', // Dana Ravid has Kubernetes
      client,
    });

    expect(res.resultsCount).toBe(1);
    const dana = res.results[0];
    expect(dana.person.id).toBe('p1');
    expect(dana.person.name).toBe('Dana Ravid');
    expect(dana.depth).toBe(2);
    expect(dana.primaryChain.display).toBe(
      'Noa Frisch → referred by → Yossi Bar-Lev → worked with at Helix Robotics (2021-03 to 2023-05) → Dana Ravid'
    );
  });

  it('excludes the searcher from candidate results', async () => {
    // Dana Ravid has Postgres, TypeScript, and Kubernetes
    const res = await searchTalentNetwork({
      personId: 'p1',
      skill: 'Postgres',
      client,
    });

    const returnedIds = res.results.map((r) => r.person.id);
    expect(returnedIds).not.toContain('p1');
    expect(res.results.every((r) => r.depth > 0)).toBe(true);
  });

  it('enforces exact skill matching and forbids substring matching', async () => {
    // Exact match with different casing and whitespace
    const resExact = await searchTalentNetwork({
      personId: 'p1',
      skill: '   neo4j   ',
      client,
    });
    expect(resExact.resultsCount).toBe(3);

    // Substring should return zero results
    const resSub = await searchTalentNetwork({
      personId: 'p1',
      skill: 'Neo',
      client,
    });
    expect(resSub.resultsCount).toBe(0);
    expect(resSub.results).toEqual([]);
  });

  it('returns empty results array when no candidate matches skill within 2 hops', async () => {
    const res = await searchTalentNetwork({
      personId: 'p1',
      skill: 'Haskell',
      client,
    });

    expect(res.resultsCount).toBe(0);
    expect(res.results).toEqual([]);
  });

  it('throws INVALID_PERSON_ID when starting person does not exist', async () => {
    await expect(
      searchTalentNetwork({
        personId: 'non_existent_id',
        skill: 'React',
        client,
      })
    ).rejects.toThrow('Person with id "non_existent_id" not found');
  });

  it('handles compound edges when two people have both employment overlap and referral', async () => {
    // Custom seed: Alice and Bob worked together AND Alice referred Bob
    const compoundSeed = {
      people: [
        {
          id: 'u1',
          name: 'Alice',
          skills: ['TypeScript'],
          employment: [{ company: 'TestCo', title: 'Eng', from: '2020-01', to: '2023-01' }],
          referred_by: null,
        },
        {
          id: 'u2',
          name: 'Bob',
          skills: ['Rust'],
          employment: [{ company: 'TestCo', title: 'Eng', from: '2021-01', to: '2022-01' }],
          referred_by: 'u1', // Alice referred Bob
        },
      ],
    };

    await importTalentGraph({ client, seedData: compoundSeed, asOfMonth: '2026-09' });

    const searchRes = await searchTalentNetwork({
      personId: 'u1',
      skill: 'Rust',
      client,
    });

    expect(searchRes.resultsCount).toBe(1);
    const bob = searchRes.results[0];
    expect(bob.person.id).toBe('u2');
    expect(bob.depth).toBe(1);

    // Compound edge has 2 reasons, primary is forward referral ("referred")
    const step = bob.primaryChain.steps[0];
    expect(step.type).toBe('REFERRED');
    expect(step.text).toBe('referred');
    expect(step.reasons.length).toBe(2);
    expect(step.reasons[0].type).toBe('REFERRED');
    expect(step.reasons[1].type).toBe('WORKED_WITH');
  });

  it('verifies total ordering tie-breaker: forward referral outranks reverse referral which outranks coworker', async () => {
    // Path ending with forward referral vs reverse referral
    const rankingSeed = {
      people: [
        { id: 'start', name: 'Start User', skills: [], employment: [{ company: 'C1', title: 'Dev', from: '2020-01', to: '2022-01' }], referred_by: null },
        { id: 'mid_a', name: 'Aaron Mid', skills: [], employment: [{ company: 'C1', title: 'Dev', from: '2020-01', to: '2022-01' }], referred_by: null },
        { id: 'mid_b', name: 'Brian Mid', skills: [], employment: [{ company: 'C1', title: 'Dev', from: '2020-01', to: '2022-01' }], referred_by: null },
        // Target is referred by mid_a (so mid_a -> target is FORWARD referral)
        // Target referred mid_b (so mid_b -> target is REVERSE referral)
        {
          id: 'target',
          name: 'Target User',
          skills: ['SpecialSkill'],
          employment: [],
          referred_by: 'mid_a',
        },
      ],
    };
    // Make mid_b referred by target:
    rankingSeed.people[2].referred_by = 'target';

    await importTalentGraph({ client, seedData: rankingSeed, asOfMonth: '2026-09' });

    const res = await searchTalentNetwork({
      personId: 'start',
      skill: 'SpecialSkill',
      client,
    });

    expect(res.resultsCount).toBe(1);
    const cand = res.results[0];
    // Primary path must be via mid_a (forward referral "referred")
    expect(cand.primaryChain.display).toContain('Aaron Mid → referred → Target User');
    // Alternative path is via mid_b (reverse referral "referred by")
    expect(cand.alternativeChains[0].display).toContain('Brian Mid → referred by → Target User');
  });
});
