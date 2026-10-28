import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ProjectSchema, SeedProjectSchema, SeedSchema, StateSchema } from '../lib/schema';

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

  it('accepts Valet/Herd and LAN origins at the schema layer', () => {
    const project = ProjectSchema.parse({
      id: 'p',
      name: 'P',
      origins: ['http://myapp.test', 'http://192.168.1.20:8080'],
    });
    expect(project.origins).toEqual(['http://myapp.test', 'http://192.168.1.20:8080']);
  });
});

describe('SeedProjectSchema', () => {
  it('keeps origins, auth, clear, reload, tags, users (unknown keys stripped)', () => {
    const parsed = SeedProjectSchema.parse({
      name: 'Acme',
      origins: ['http://localhost:3000'],
      tags: [{ name: 'admin' }],
      auth: { login: { url: 'http://localhost:3000/login' } },
      clear: { cookies: 'all' },
      reload: 'active-tab',
      users: [{ name: 'Admin' }],
      extraUnknown: true,
    });
    expect(parsed.origins).toEqual(['http://localhost:3000']);
    expect(parsed.auth?.login.url).toBe('http://localhost:3000/login');
    expect(parsed.clear?.cookies).toBe('all');
    expect(parsed.reload).toBe('active-tab');
    expect(parsed.tags?.[0]?.name).toBe('admin');
    expect(parsed.users[0]?.name).toBe('Admin');
    expect((parsed as { extraUnknown?: unknown }).extraUnknown).toBeUndefined();
  });

  it('example.seed.json validates with the standalone script', () => {
    const out = execFileSync(
      process.execPath,
      ['skills/session-switcher-seed/scripts/validate-seed.mjs', 'skills/session-switcher-seed/assets/example.seed.json'],
      { encoding: 'utf8' },
    );
    expect(out).toMatch(/^OK /);
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
