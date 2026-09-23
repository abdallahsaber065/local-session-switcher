import { describe, expect, it } from 'vitest';
import { AuthRecipeSchema } from '../lib/auth/schema';
import { interpolate, interpolateDeep } from '../lib/auth/template';
import { extractValue, jsonPathGet } from '../lib/auth/extract';
import { decideSessionAction, sessionExpiryMs } from '../lib/auth/lifecycle';
import { applySinksToUser, assertRecipeOrigins, runAuth, type AuthDeps } from '../lib/auth/runner';
import { AUTH_PRESETS } from '../lib/auth/presets';
import { CredentialsSchema, UserSchema, type CachedSession } from '../lib/schema';

const ORIGIN = 'http://localhost:3000';
const NOW = 1_700_000_000_000; // 2023-11-14T22:13:20Z

function jwt(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}

const recipe = AuthRecipeSchema.parse({
  login: {
    method: 'POST',
    url: `${ORIGIN}/api/auth/login`,
    bodyType: 'json',
    headers: { 'Content-Type': 'application/json' },
    body: { email: '{{username}}', password: '{{password}}' },
    extract: {
      accessToken: { jsonPath: 'token' },
      refreshToken: { jsonPath: 'refreshToken' },
    },
  },
  outputs: [{ kind: 'localStorage', key: 'auth-token', value: '{{accessToken}}' }],
  refresh: {
    method: 'POST',
    url: `${ORIGIN}/api/auth/refresh`,
    bodyType: 'json',
    headers: { 'Content-Type': 'application/json' },
    body: { refreshToken: '{{refreshToken}}' },
    extract: { accessToken: { jsonPath: 'token' } },
  },
  session: { ttlMinutes: 15 },
});

const credentials = CredentialsSchema.parse({ username: 'alice@test.local', password: 'hunter2' });

function mockDeps(
  handler: (url: string, init: RequestInit | undefined) => { status?: number; json?: unknown; text?: string; headers?: Record<string, string> },
  calls: string[] = [],
): AuthDeps {
  return {
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      const result = handler(url, init);
      const body = result.text ?? JSON.stringify(result.json ?? {});
      return new Response(body, {
        status: result.status ?? 200,
        headers: result.headers ?? { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch,
    readCookie: async () => 'cookie-value',
    now: () => NOW,
  };
}

const emptySession: CachedSession = { vars: {} };

describe('template', () => {
  it('substitutes variables and rejects unknown ones', () => {
    expect(interpolate('hi {{name}}', { name: 'alice' })).toBe('hi alice');
    expect(() => interpolate('hi {{nope}}', {})).toThrow(/Unknown template variable/);
  });

  it('walks nested objects and arrays', () => {
    const input = { a: '{{x}}', list: ['{{x}}', 3], nested: { b: '{{y}}' } };
    expect(interpolateDeep(input, { x: '1', y: '2' })).toEqual({ a: '1', list: ['1', 3], nested: { b: '2' } });
  });
});

describe('extract', () => {
  it('reads json paths including array indexes', () => {
    const root = { data: { items: [{ id: 7 }] } };
    expect(jsonPathGet(root, 'data.items.0.id')).toBe(7);
    expect(jsonPathGet(root, '$.data.items.1.id')).toBeUndefined();
    expect(jsonPathGet(null, 'a.b')).toBeUndefined();
  });

  it('extracts from json, regex, headers and cookies', async () => {
    const source = {
      bodyText: 'name="csrf" value="tok-123"',
      json: { token: 'abc' },
      header: (name: string) => (name === 'x-token' ? 'hdr' : null),
      cookie: async () => 'a%20b',
    };
    expect(await extractValue({ jsonPath: 'token' }, source)).toBe('abc');
    expect(await extractValue({ regex: 'value="([^"]+)"', group: 1 }, source)).toBe('tok-123');
    expect(await extractValue({ header: 'x-token' }, source)).toBe('hdr');
    expect(await extractValue({ cookie: 'XSRF', decode: 'url' }, source)).toBe('a b');
  });
});

describe('lifecycle', () => {
  it('logs in when nothing is cached', () => {
    expect(decideSessionAction({ session: emptySession, recipe, now: NOW })).toBe('login');
  });

  it('reuses a session whose JWT is still valid', () => {
    const session: CachedSession = { vars: {}, accessToken: jwt(NOW / 1000 + 3600) };
    expect(decideSessionAction({ session, recipe, now: NOW })).toBe('reuse');
  });

  it('refreshes an expired JWT when a refresh token exists', () => {
    const session: CachedSession = { vars: {}, accessToken: jwt(NOW / 1000 - 10), refreshToken: 'r1' };
    expect(decideSessionAction({ session, recipe, now: NOW })).toBe('refresh');
  });

  it('logs in when the JWT is expired and there is nothing to refresh', () => {
    const session: CachedSession = { vars: {}, accessToken: jwt(NOW / 1000 - 10) };
    expect(decideSessionAction({ session, recipe, now: NOW })).toBe('login');
  });

  it('falls back to the ttl when the token is not a JWT', () => {
    const fresh: CachedSession = { vars: {}, accessToken: 'opaque', obtainedAt: new Date(NOW).toISOString() };
    const stale: CachedSession = { vars: {}, accessToken: 'opaque', obtainedAt: new Date(NOW - 20 * 60_000).toISOString() };
    expect(sessionExpiryMs(fresh, recipe)).toBe(NOW + 15 * 60_000);
    expect(decideSessionAction({ session: fresh, recipe, now: NOW })).toBe('reuse');
    expect(decideSessionAction({ session: stale, recipe, now: NOW })).toBe('login');
  });
});

describe('runAuth', () => {
  it('logs in, extracts tokens, and resolves sinks', async () => {
    const calls: string[] = [];
    const deps = mockDeps(
      (url, init) => {
        if (url.endsWith('/login')) {
          const body = JSON.parse(String(init?.body)) as { email: string; password: string };
          expect(body).toEqual({ email: 'alice@test.local', password: 'hunter2' });
          return { json: { token: jwt(NOW / 1000 + 3600), refreshToken: 'r1' } };
        }
        return { status: 404 };
      },
      calls,
    );

    const run = await runAuth({ recipe, credentials, session: emptySession, origins: [ORIGIN], deps });

    expect(run.ok).toBe(true);
    expect(run.action).toBe('login');
    expect(run.session.accessToken).toBeTruthy();
    expect(run.session.refreshToken).toBe('r1');
    expect(run.session.source).toBe('login');
    expect(run.session.vars.accessToken).toBeTruthy();
    expect(run.session.vars.username).toBeUndefined();
    expect(run.sinks).toEqual([
      { kind: 'localStorage', key: 'auth-token', value: run.session.accessToken, origin: ORIGIN },
    ]);
    expect(calls).toHaveLength(1);
  });

  it('reuses a valid cached session without any request', async () => {
    const calls: string[] = [];
    const deps = mockDeps(() => ({ status: 500 }), calls);
    const session: CachedSession = { vars: {}, accessToken: jwt(NOW / 1000 + 3600), refreshToken: 'r1' };

    const run = await runAuth({ recipe, credentials, session, origins: [ORIGIN], deps });

    expect(run.ok).toBe(true);
    expect(run.action).toBe('reuse');
    expect(calls).toHaveLength(0);
    expect(run.sinks[0]?.kind).toBe('localStorage');
  });

  it('refreshes an expired session and keeps the refresh token', async () => {
    const calls: string[] = [];
    const deps = mockDeps(
      (url) => (url.endsWith('/refresh') ? { json: { token: jwt(NOW / 1000 + 3600) } } : { status: 404 }),
      calls,
    );
    const session: CachedSession = { vars: {}, accessToken: jwt(NOW / 1000 - 10), refreshToken: 'r1' };

    const run = await runAuth({ recipe, credentials, session, origins: [ORIGIN], deps });

    expect(run.action).toBe('refresh');
    expect(run.session.source).toBe('refresh');
    expect(run.session.refreshToken).toBe('r1');
    expect(calls).toEqual([`POST ${ORIGIN}/api/auth/refresh`]);
  });

  it('falls back to a full login when refresh fails', async () => {
    const calls: string[] = [];
    const deps = mockDeps(
      (url) => {
        if (url.endsWith('/refresh')) return { status: 401 };
        if (url.endsWith('/login')) return { json: { token: jwt(NOW / 1000 + 3600), refreshToken: 'r2' } };
        return { status: 404 };
      },
      calls,
    );
    const session: CachedSession = { vars: {}, accessToken: jwt(NOW / 1000 - 10), refreshToken: 'r1' };

    const run = await runAuth({ recipe, credentials, session, origins: [ORIGIN], deps });

    expect(run.ok).toBe(true);
    expect(run.action).toBe('login');
    expect(calls).toHaveLength(2);
    expect(run.log.some((line) => line.includes('falling back to login'))).toBe(true);
  });

  it('passes preflight extractions into the login request', async () => {
    const csrfRecipe = AuthRecipeSchema.parse({
      preflight: [
        {
          method: 'GET',
          url: `${ORIGIN}/api/auth/csrf`,
          extract: { csrfToken: { jsonPath: 'csrfToken' } },
        },
      ],
      login: {
        method: 'POST',
        url: `${ORIGIN}/api/auth/callback/credentials`,
        bodyType: 'form',
        body: { csrfToken: '{{csrfToken}}', email: '{{username}}', password: '{{password}}' },
      },
      outputs: [],
    });
    const deps = mockDeps((url, init) => {
      if (url.endsWith('/csrf')) return { json: { csrfToken: 'tok-9' } };
      const body = String(init?.body);
      expect(body).toContain('csrfToken=tok-9');
      expect(body).toContain('email=alice%40test.local');
      return { json: { ok: true } };
    });

    const run = await runAuth({ recipe: csrfRecipe, credentials, session: emptySession, origins: [ORIGIN], deps });

    expect(run.ok).toBe(true);
    expect(run.session.vars.csrfToken).toBe('tok-9');
  });

  it('reports failures without mutating the session', async () => {
    const deps = mockDeps(() => ({ status: 401 }));
    const session: CachedSession = { vars: {}, accessToken: jwt(NOW / 1000 - 10) };

    const run = await runAuth({ recipe, credentials, session, origins: [ORIGIN], deps });

    expect(run.ok).toBe(false);
    expect(run.error).toContain('401');
    expect(run.session).toBe(session);
    expect(run.sinks).toEqual([]);
  });

  it('refuses recipe URLs outside the project origins', async () => {
    const evil = AuthRecipeSchema.parse({
      login: { method: 'POST', url: 'https://evil.example/login', body: { a: '{{username}}' } },
      outputs: [],
    });
    const run = await runAuth({ recipe: evil, credentials, session: emptySession, origins: [ORIGIN], deps: mockDeps(() => ({ json: {} })) });

    expect(run.ok).toBe(false);
    expect(run.error).toMatch(/not one of the project origins/);
  });

  it('forces a login when asked', async () => {
    const calls: string[] = [];
    const deps = mockDeps(
      (url) => (url.endsWith('/login') ? { json: { token: jwt(NOW / 1000 + 3600), refreshToken: 'r2' } } : { status: 404 }),
      calls,
    );
    const session: CachedSession = { vars: {}, accessToken: jwt(NOW / 1000 + 3600) };

    const run = await runAuth({ recipe, credentials, session, origins: [ORIGIN], deps, force: 'login' });

    expect(run.action).toBe('login');
    expect(calls).toHaveLength(1);
  });
});

describe('assertRecipeOrigins', () => {
  it('accepts every URL on the project origins', () => {
    expect(() => assertRecipeOrigins(recipe, [ORIGIN])).not.toThrow();
  });
});

describe('applySinksToUser', () => {
  it('adds auth cookies (auth wins over captured) and merges storage', () => {
    const user = UserSchema.parse({
      id: 'u1',
      name: 'Admin',
      cookies: [{ name: 'session', value: 'old', path: '/', domain: 'localhost' }],
      storage: {},
    });
    const next = applySinksToUser(user, [
      { kind: 'cookie', name: 'session', value: 'new', origin: ORIGIN, path: '/', httpOnly: true, secure: false, sameSite: 'lax' },
      { kind: 'localStorage', key: 'token', value: 't1', origin: ORIGIN },
    ]);

    expect(next.cookies).toHaveLength(1);
    expect(next.cookies[0]?.value).toBe('new');
    expect(next.cookies[0]?.domain).toBe('localhost');
    expect(next.storage[ORIGIN]?.localStorage.token).toBe('t1');
  });
});

describe('presets', () => {
  it('every preset validates as a recipe', () => {
    for (const preset of AUTH_PRESETS) {
      expect(() => AuthRecipeSchema.parse(preset.recipe)).not.toThrow();
    }
  });
});
