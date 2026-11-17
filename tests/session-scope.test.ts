import { describe, expect, it } from 'vitest';
import { activeUserFor, withActiveUser } from '../lib/session-scope';
import { StateSchema } from '../lib/schema';

const state = StateSchema.parse({
  activeProjectId: 'app',
  activeUserByProject: { app: 'legacy-user' },
  projects: [{ id: 'app', name: 'App', origins: ['http://localhost:3000'] }],
});

describe('active user by window context', () => {
  it('falls back to the legacy/global map when no scoped value exists', () => {
    expect(activeUserFor(state, 'app', 'normal')).toBe('legacy-user');
    expect(activeUserFor(state, 'app', 'private')).toBe('legacy-user');
    expect(activeUserFor(state, undefined, 'normal')).toBeUndefined();
  });

  it('stores a private active user without changing the normal one', () => {
    const next = withActiveUser(state, 'app', 'private-user', 'private');
    expect(activeUserFor(next, 'app', 'private')).toBe('private-user');
    expect(activeUserFor(next, 'app', 'normal')).toBe('legacy-user');
    expect(next.activeUserByProject.app).toBe('legacy-user');
  });

  it('mirrors a normal active user into the legacy map and does not mutate the input', () => {
    const next = withActiveUser(state, 'app', 'normal-user', 'normal');
    expect(activeUserFor(next, 'app', 'normal')).toBe('normal-user');
    expect(next.activeUserByProject.app).toBe('normal-user');
    expect(state.activeUserByProject.app).toBe('legacy-user');
    expect(state.activeUserByScope.normal.app).toBeUndefined();
  });
});
