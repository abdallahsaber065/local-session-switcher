import type { CachedSession, Project, User } from '../schema';
import { jwtExpMs } from '../jwt';
import type { AuthRecipe } from './schema';

export type SessionAction = 'reuse' | 'refresh' | 'login';

/** Treat a session as stale slightly before it actually expires. */
export const EXPIRY_SKEW_MS = 30_000;

/** Best-known expiry: the access token's JWT exp wins, then obtainedAt + ttlMinutes. */
export function sessionExpiryMs(session: CachedSession, recipe: AuthRecipe): number | null {
  const jwtExpiry = session.accessToken ? jwtExpMs(session.accessToken) : null;
  if (jwtExpiry !== null) return jwtExpiry;
  const ttl = recipe.session.ttlMinutes;
  if (ttl && session.obtainedAt) {
    const obtained = new Date(session.obtainedAt).getTime();
    if (!Number.isNaN(obtained)) return obtained + ttl * 60_000;
  }
  return null;
}

export function decideSessionAction(args: { session: CachedSession; recipe: AuthRecipe; now: number }): SessionAction {
  const { session, recipe, now } = args;
  const hasSomething = Boolean(session.accessToken) || Object.keys(session.vars).length > 0;
  if (!hasSomething) return 'login';

  const expiry = sessionExpiryMs(session, recipe);
  if (expiry === null || expiry - EXPIRY_SKEW_MS > now) return 'reuse';
  if (recipe.refresh && session.refreshToken) return 'refresh';
  return 'login';
}

export type UserAuthStatus = { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'none' };

/** One-line session state for a user row ("valid 42m", "will refresh", "no credentials"). */
export function userAuthStatus(project: Project, user: User, now: number): UserAuthStatus {
  const recipe = project.auth;
  if (!recipe) return { label: '', tone: 'none' };

  const action = decideSessionAction({ session: user.session, recipe, now });
  if (action === 'reuse') {
    const expiry = sessionExpiryMs(user.session, recipe);
    if (expiry === null) return { label: 'session cached', tone: 'ok' };
    const minutes = Math.max(Math.round((expiry - now) / 60_000), 0);
    return minutes <= 5 ? { label: `expires ${minutes}m`, tone: 'warn' } : { label: `valid ${minutes}m`, tone: 'ok' };
  }
  if (action === 'refresh') return { label: 'will refresh', tone: 'info' };
  return user.credentials.username ? { label: 'will log in', tone: 'info' } : { label: 'no credentials', tone: 'warn' };
}
