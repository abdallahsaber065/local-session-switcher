import { describe, expect, it } from 'vitest';
import { detectActiveUser, matchCookieClear, originOf, planSwitch } from '../lib/planner';
import { ProjectSchema, UserSchema } from '../lib/schema';

const project = ProjectSchema.parse({
  id: 'p1',
  name: 'My App',
  origins: ['http://localhost:3000'],
  clear: {
    cookies: { prefixes: ['next-auth'] },
    localStorage: { mode: 'all', exclude: ['theme'] },
    sessionStorage: 'all',
  },
  reload: 'matching-tabs',
});

const user = UserSchema.parse({
  id: 'u1',
  name: 'Admin',
  cookies: [
    { name: 'next-auth.session-token', value: 'abc', path: '/' },
    { name: 'other-app', value: 'zzz', path: '/' },
  ],
  storage: { 'http://localhost:3000': { localStorage: { token: 't1' }, sessionStorage: {} } },
});

describe('originOf', () => {
  it('extracts the origin including port', () => {
    expect(originOf('http://localhost:3000/dashboard?x=1')).toBe('http://localhost:3000');
    expect(originOf('https://127.0.0.1:8443/')).toBe('https://127.0.0.1:8443');
  });

  it('rejects non-http and invalid urls', () => {
    expect(originOf('chrome://extensions')).toBeNull();
    expect(originOf('file:///tmp/index.html')).toBeNull();
    expect(originOf('not a url')).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });
});

describe('matchCookieClear', () => {
  it('handles all / names / prefixes', () => {
    expect(matchCookieClear('anything', 'all')).toBe(true);
    expect(matchCookieClear('session', { names: ['session'] })).toBe(true);
    expect(matchCookieClear('session', { names: ['other'] })).toBe(false);
    expect(matchCookieClear('next-auth.session-token', { prefixes: ['next-auth'] })).toBe(true);
    expect(matchCookieClear('sb-token', { prefixes: ['next-auth'] })).toBe(false);
  });
});

describe('planSwitch', () => {
  it('sets the user cookies, prunes matching leftovers, keeps the rest and applies storage', () => {
    const plan = planSwitch({
      project,
      user,
      tabs: [{ id: 1, url: 'http://localhost:3000/dashboard', active: true }],
      cookiesByHost: {
        localhost: [
          { name: 'next-auth.session-token', path: '/' },
          { name: 'next-auth.csrf-token', path: '/' },
          { name: 'theme', path: '/' },
        ],
      },
    });

    expect(plan.cookieOps).toHaveLength(1);
    const op = plan.cookieOps[0]!;
    expect(op.set.map((cookie) => cookie.name)).toEqual(['next-auth.session-token', 'other-app']);
    expect(op.remove.map((cookie) => cookie.name)).toEqual(['next-auth.csrf-token']);

    expect(plan.storageTabs).toEqual([
      {
        tabId: 1,
        origin: 'http://localhost:3000',
        apply: {
          write: { localStorage: { token: 't1' }, sessionStorage: {} },
          clear: {
            localStorage: { mode: 'all', exclude: ['theme'] },
            sessionStorage: 'all',
          },
        },
      },
    ]);
    expect(plan.pending).toEqual([]);
    expect(plan.reloadTabIds).toEqual([1]);
  });

  it('queues a pending injection when no tab is open for the origin', () => {
    const plan = planSwitch({
      project,
      user,
      tabs: [{ id: 1, url: 'http://localhost:4000/other', active: true }],
      cookiesByHost: { localhost: [] },
    });

    expect(plan.storageTabs).toEqual([]);
    expect(plan.pending).toHaveLength(1);
    expect(plan.pending[0]?.origin).toBe('http://localhost:3000');
    expect(plan.reloadTabIds).toEqual([]);
  });

  it('reloads only the active tab when configured', () => {
    const activeTabProject = ProjectSchema.parse({
      ...project,
      reload: 'active-tab',
    });

    const plan = planSwitch({
      project: activeTabProject,
      user,
      tabs: [
        { id: 1, url: 'http://localhost:3000/a', active: false },
        { id: 2, url: 'http://localhost:3000/b', active: true },
      ],
      cookiesByHost: { localhost: [] },
    });

    expect(plan.reloadTabIds).toEqual([2]);
  });

  it('does not reload when configured to none', () => {
    const plan = planSwitch({
      project: ProjectSchema.parse({ ...project, reload: 'none' }),
      user,
      tabs: [{ id: 1, url: 'http://localhost:3000/a', active: true }],
      cookiesByHost: { localhost: [] },
    });

    expect(plan.reloadTabIds).toEqual([]);
  });

  it('applies domain-scoped cookies only to matching hosts', () => {
    const multiOrigin = ProjectSchema.parse({
      ...project,
      origins: ['http://localhost:3000', 'http://127.0.0.1:8000'],
    });
    const scopedUser = UserSchema.parse({
      ...user,
      cookies: [
        { name: 'scoped', value: 'a', domain: '127.0.0.1', hostOnly: false },
        { name: 'everywhere', value: 'b' },
      ],
    });

    const plan = planSwitch({
      project: multiOrigin,
      user: scopedUser,
      tabs: [],
      cookiesByHost: {},
    });

    const localhostOp = plan.cookieOps.find((op) => op.origin === 'http://localhost:3000');
    const ipOp = plan.cookieOps.find((op) => op.origin === 'http://127.0.0.1:8000');
    expect(localhostOp?.set.map((cookie) => cookie.name)).toEqual(['everywhere']);
    expect(ipOp?.set.map((cookie) => cookie.name)).toEqual(['scoped', 'everywhere']);
  });
});

describe('detectActiveUser', () => {
  const admin = UserSchema.parse({
    id: 'admin',
    name: 'Admin',
    cookies: [
      { name: 'session', value: 'abc' },
      { name: 'csrf', value: 'xyz' },
    ],
  });
  const empty = UserSchema.parse({ id: 'empty', name: 'Empty', cookies: [] });

  it('detects the user whose cookies all match the live session', () => {
    const current = [
      { name: 'session', value: 'abc' },
      { name: 'csrf', value: 'xyz' },
      { name: 'theme', value: 'dark' },
    ];
    expect(detectActiveUser([admin, empty], current)).toBe('admin');
  });

  it('returns null when any captured cookie value differs', () => {
    const current = [
      { name: 'session', value: 'abc' },
      { name: 'csrf', value: 'changed' },
    ];
    expect(detectActiveUser([admin, empty], current)).toBeNull();
  });

  it('ignores users with no captured cookies', () => {
    expect(detectActiveUser([empty], [])).toBeNull();
  });
});
