import type { CachedSession, Credentials, User } from '../schema';
import { jwtExpMs } from '../jwt';
import { errMsg, hostOf } from '../util';
import { extractValue } from './extract';
import { decideSessionAction } from './lifecycle';
import type { AuthRecipe, AuthStep, SameSite, Sink } from './schema';
import { interpolate, interpolateDeep } from './template';

export type AuthDeps = {
  fetch: typeof fetch;
  readCookie: (origin: string, name: string) => Promise<string | null>;
  now: () => number;
};

export type ResolvedSink =
  | {
      kind: 'cookie';
      name: string;
      value: string;
      origin: string;
      path: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: SameSite;
      expirationDate?: number;
    }
  | { kind: 'localStorage' | 'sessionStorage'; key: string; value: string; origin: string };

export type AuthRun = {
  ok: boolean;
  action: 'reuse' | 'refresh' | 'login' | 'none';
  session: CachedSession;
  sinks: ResolvedSink[];
  log: string[];
  error?: string;
};

/** Every URL in the recipe must live on one of the project's origins (seed-file exfiltration guard). */
export function assertRecipeOrigins(recipe: AuthRecipe, origins: string[]): void {
  const allowed = new Set(origins);
  const urls: string[] = [
    ...recipe.preflight.map((step) => step.url),
    recipe.login.url,
    ...(recipe.refresh ? [recipe.refresh.url] : []),
    ...(recipe.session.verify ? [recipe.session.verify.url] : []),
  ];
  for (const raw of urls) {
    let origin: string;
    try {
      origin = new URL(raw).origin;
    } catch {
      throw new Error(`Invalid auth URL: ${raw}`);
    }
    if (!allowed.has(origin)) {
      throw new Error(`Auth URL ${origin} is not one of the project origins (${origins.join(', ')})`);
    }
  }
}

export function resolveSinks(sinks: Sink[], vars: Record<string, string>, defaultOrigin: string): ResolvedSink[] {
  return sinks.map((sink) => {
    if (sink.kind === 'cookie') {
      return {
        kind: 'cookie' as const,
        name: sink.name,
        value: interpolate(sink.value, vars),
        origin: sink.origin ?? defaultOrigin,
        path: sink.path,
        httpOnly: sink.httpOnly,
        secure: sink.secure,
        sameSite: sink.sameSite,
        ...(sink.expirationDate ? { expirationDate: sink.expirationDate } : {}),
      };
    }
    return {
      kind: sink.kind,
      key: sink.key,
      value: interpolate(sink.value, vars),
      origin: sink.origin ?? defaultOrigin,
    };
  });
}

function buildRequest(step: AuthStep, vars: Record<string, string>): { url: string; init: RequestInit } {
  const url = interpolate(step.url, vars);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(step.headers)) headers[name] = interpolate(value, vars);

  let body: BodyInit | undefined;
  if (step.body !== undefined && step.method !== 'GET') {
    const resolved = interpolateDeep(step.body, vars);
    if (step.bodyType === 'json') {
      headers['Content-Type'] ??= 'application/json';
      body = JSON.stringify(resolved);
    } else if (step.bodyType === 'form') {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(resolved as Record<string, unknown>)) params.set(key, String(value));
      headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
      body = params;
    } else {
      body = String(resolved);
    }
  }

  return {
    url,
    init: {
      method: step.method,
      headers,
      body,
      credentials: step.credentials,
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    },
  };
}

async function runStep(
  step: AuthStep,
  vars: Record<string, string>,
  deps: AuthDeps,
  log: string[],
): Promise<Record<string, string>> {
  const { url, init } = buildRequest(step, vars);
  log.push(`${step.method} ${url}`);
  const response = await deps.fetch(url, init);
  const bodyText = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(bodyText);
  } catch {
    // not JSON (HTML or empty) — regex/header extraction can still work
  }

  const ok = step.expectStatus ? step.expectStatus.includes(response.status) : response.ok;
  log.push(`  → ${response.status}`);
  if (!ok) throw new Error(`${step.method} ${url} → HTTP ${response.status}`);

  const next: Record<string, string> = { ...vars };
  for (const [name, rule] of Object.entries(step.extract)) {
    const value = await extractValue(rule, {
      bodyText,
      json,
      header: (headerName) => response.headers.get(headerName),
      cookie: (cookieName) => deps.readCookie(new URL(url).origin, cookieName),
    });
    if (value === null) throw new Error(`Could not extract "${name}" from ${url}`);
    next[name] = value;
    log.push(`  extracted ${name} (${value.length} chars)`);
  }
  return next;
}

async function runFlow(
  preflight: AuthStep[],
  main: AuthStep,
  vars: Record<string, string>,
  deps: AuthDeps,
  log: string[],
): Promise<Record<string, string>> {
  let current = vars;
  for (const step of preflight) current = await runStep(step, current, deps, log);
  return await runStep(main, current, deps, log);
}

function pickSessionVars(vars: Record<string, string>, credentials: Credentials): Record<string, string> {
  const secretKeys = new Set(['username', 'password', ...Object.keys(credentials.extra)]);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (!secretKeys.has(key)) out[key] = value;
  }
  return out;
}

/**
 * Runs the recipe lifecycle: reuse cached tokens, refresh them, or log in.
 * Never touches browser state itself — the caller applies the returned sinks.
 */
export async function runAuth(args: {
  recipe: AuthRecipe;
  credentials: Credentials;
  session: CachedSession;
  origins: string[];
  deps: AuthDeps;
  force?: 'login' | 'refresh';
}): Promise<AuthRun> {
  const { recipe, credentials, session, origins, deps, force } = args;
  const log: string[] = [];
  const defaultOrigin = origins[0];
  if (!defaultOrigin) return { ok: false, action: 'none', session, sinks: [], log, error: 'Project has no origins' };

  try {
    assertRecipeOrigins(recipe, origins);

    const vars: Record<string, string> = {
      username: credentials.username,
      password: credentials.password,
      ...credentials.extra,
      accessToken: session.accessToken ?? '',
      refreshToken: session.refreshToken ?? '',
      ...session.vars,
    };

    let action = force ?? decideSessionAction({ session, recipe, now: deps.now() });
    if (action === 'refresh' && !recipe.refresh) action = 'login';
    log.push(`action: ${action}`);

    if (action === 'reuse') {
      const verify = recipe.session.verify;
      if (verify) {
        const url = interpolate(verify.url, vars);
        log.push(`${verify.method} ${url} (verify)`);
        const response = await deps.fetch(url, {
          method: verify.method,
          credentials: 'include',
          redirect: 'follow',
          signal: AbortSignal.timeout(10_000),
        });
        log.push(`  → ${response.status}`);
        if (response.status !== verify.expectStatus) {
          log.push('cached session failed verification');
          action = recipe.refresh && session.refreshToken ? 'refresh' : 'login';
        }
      }
    }

    if (action === 'reuse') {
      return { ok: true, action, session, sinks: resolveSinks(recipe.outputs, vars, defaultOrigin), log };
    }

    let nextVars = vars;
    if (action === 'refresh') {
      try {
        nextVars = await runFlow([], recipe.refresh as AuthStep, vars, deps, log);
      } catch (error) {
        log.push(`refresh failed (${errMsg(error)}); falling back to login`);
        action = 'login';
      }
    }
    if (action === 'login') {
      nextVars = await runFlow(recipe.preflight, recipe.login, vars, deps, log);
    }

    const accessToken = nextVars.accessToken || session.accessToken;
    const refreshToken = nextVars.refreshToken || session.refreshToken;
    const now = deps.now();
    const jwtExpiry = accessToken ? jwtExpMs(accessToken) : null;
    const ttl = recipe.session.ttlMinutes;
    const expiresAt = jwtExpiry
      ? new Date(jwtExpiry).toISOString()
      : ttl
        ? new Date(now + ttl * 60_000).toISOString()
        : undefined;

    const nextSession: CachedSession = {
      ...(accessToken ? { accessToken } : {}),
      ...(refreshToken ? { refreshToken } : {}),
      vars: pickSessionVars(nextVars, credentials),
      obtainedAt: new Date(now).toISOString(),
      ...(expiresAt ? { expiresAt } : {}),
      source: action,
    };

    const outputSinks = action === 'refresh' && recipe.refresh?.outputs ? recipe.refresh.outputs : recipe.outputs;
    return { ok: true, action, session: nextSession, sinks: resolveSinks(outputSinks, nextVars, defaultOrigin), log };
  } catch (error) {
    return { ok: false, action: 'none', session, sinks: [], log, error: errMsg(error) };
  }
}

/** Merges resolved sinks into a user profile (auth values win over captured ones). */
export function applySinksToUser(user: User, sinks: ResolvedSink[]): User {
  const byIdentity = new Map(user.cookies.map((cookie) => [`${cookie.name}\u0000${cookie.path}`, cookie]));
  const storage = structuredClone(user.storage);

  for (const sink of sinks) {
    if (sink.kind === 'cookie') {
      byIdentity.set(`${sink.name}\u0000${sink.path}`, {
        name: sink.name,
        value: sink.value,
        domain: hostOf(sink.origin),
        path: sink.path,
        hostOnly: true,
        httpOnly: sink.httpOnly,
        secure: sink.secure,
        sameSite: sink.sameSite,
        ...(sink.expirationDate ? { expirationDate: sink.expirationDate } : {}),
      });
    } else {
      const bucket = storage[sink.origin] ?? { localStorage: {}, sessionStorage: {} };
      bucket[sink.kind][sink.key] = sink.value;
      storage[sink.origin] = bucket;
    }
  }

  return { ...user, cookies: [...byIdentity.values()], storage };
}
