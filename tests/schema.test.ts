import { describe, expect, it } from 'vitest';
import { ProjectSchema, SeedSchema, StateSchema } from '../lib/schema';

describe('StateSchema', () => {
  it('fills defaults from an empty object', () => {
    const state = StateSchema.parse({});
    expect(state.schemaVersion).toBe(1);
    expect(state.activeProjectId).toBeNull();
    expect(state.projects).toEqual([]);
  });
});

describe('ProjectSchema', () => {
  it('normalizes trailing slashes on origins', () => {
    const project = ProjectSchema.parse({
      id: 'p',
      name: 'P',
      origins: ['http://localhost:3000/'],
    });
    expect(project.origins).toEqual(['http://localhost:3000']);
  });

  it('rejects origins with a path', () => {
    const result = ProjectSchema.safeParse({
      id: 'p',
      name: 'P',
      origins: ['http://localhost:3000/api'],
    });
    expect(result.success).toBe(false);
  });

  it('defaults clear config and reload behavior', () => {
    const project = ProjectSchema.parse({ id: 'p', name: 'P', origins: ['http://localhost:3000'] });
    expect(project.clear.cookies).toBe('all');
    expect(project.clear.localStorage).toEqual({ mode: 'all', exclude: [] });
    expect(project.reload).toBe('matching-tabs');
  });
});

describe('SeedSchema', () => {
  it('accepts a minimal seed and generates user defaults', () => {
    const seed = SeedSchema.parse({
      projects: [{ name: 'My App', origins: ['http://localhost:3000'], users: [{ name: 'Admin' }] }],
    });
    const seedUser = seed.projects[0]?.users[0];
    expect(seedUser?.cookies).toEqual([]);
    expect(seedUser?.storage).toEqual({});
    expect(seedUser?.id).toBeUndefined();
  });

  it('rejects a seed project without a name', () => {
    const result = SeedSchema.safeParse({ projects: [{ origins: ['http://localhost:3000'] }] });
    expect(result.success).toBe(false);
  });
});
