import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProjectSchema, SeedSchema, StateSchema, errorLines } from '../lib/schema';
import { mergeSeed } from '../lib/seed';

// Opt-in regression fixture: points at a real seed file OUTSIDE this repo
// (path via env so no machine- or client-specific path lives in the source).
// CI skips when unset:  SEED_FIXTURE_PATH=/path/to/project.seed.json pnpm test
const FIXTURE = process.env.SEED_FIXTURE_PATH ?? '';
const hasSeed = FIXTURE !== '' && existsSync(FIXTURE);
// describe bodies run during collection even when skipped — read defensively.
const seedText = hasSeed ? readFileSync(FIXTURE, 'utf8') : '';

describe.runIf(hasSeed)('external seed fixture (regression)', () => {

  it('parses as a seed document', () => {
    const seed = SeedSchema.parse(JSON.parse(seedText));
    expect(seed.projects.length).toBeGreaterThan(0);
    expect(seed.projects[0]?.users.length).toBeGreaterThan(0);
  });

  it('merges into an empty state', () => {
    const seed = SeedSchema.parse(JSON.parse(seedText));
    const { state, result } = mergeSeed(StateSchema.parse({}), seed);
    expect(result.projectsAdded).toBeGreaterThan(0);
    expect(result.usersAdded).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
    expect(state.projects[0]?.auth).toBeDefined();
    expect(state.projects[0]?.auth?.login.url).toMatch(/^https?:\/\//);
  });

  it('merges into a state that already has an unrelated project', () => {
    const seed = SeedSchema.parse(JSON.parse(seedText));
    const base = StateSchema.parse({
      projects: [{ id: 'other', name: 'Other', origins: ['http://localhost:3000'] }],
    });
    const { result } = mergeSeed(base, seed);
    expect(result.projectsAdded).toBeGreaterThanOrEqual(1);
    expect(result.errors).toEqual([]);
  });

  it('upserts the auth recipe into an already-imported copy of the project', () => {
    const seed = SeedSchema.parse(JSON.parse(seedText));
    const first = mergeSeed(StateSchema.parse({}), seed).state;
    expect(first.projects[0]?.auth).toBeDefined();

    // A previously imported copy that (due to the old bug) has no recipe:
    first.projects[0]!.auth = undefined;
    const again = mergeSeed(first, seed);
    expect(again.state.projects[0]?.auth).toBeDefined();
    expect(again.result.usersAdded + again.result.usersUpdated).toBeGreaterThan(0);
  });
});

describe('error signature reported by the user', () => {
  it('root-level ProjectSchema.parse of a seed file yields exactly id/name/origins', () => {
    const sample = { schemaVersion: 1, projects: [{ name: 'X', origins: ['http://localhost:1'] }] };
    let lines: string[] = [];
    try {
      ProjectSchema.parse(sample);
    } catch (error) {
      lines = errorLines(error);
    }
    expect(lines).toEqual([
      'id: Invalid input: expected string, received undefined',
      'name: Invalid input: expected string, received undefined',
      'origins: Invalid input: expected array, received undefined',
    ]);
  });
});
