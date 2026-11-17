import type { AppState } from './schema';

export type SessionScope = 'normal' | 'private';

/** Active user for a project in a given window context, with legacy-state fallback. */
export function activeUserFor(
  state: AppState,
  projectId: string | null | undefined,
  scope: SessionScope,
): string | undefined {
  if (!projectId) return undefined;
  return state.activeUserByScope[scope][projectId] ?? state.activeUserByProject[projectId];
}

/** Records the active user for one context (normal also mirrors into the legacy map). */
export function withActiveUser(
  state: AppState,
  projectId: string,
  userId: string,
  scope: SessionScope,
): AppState {
  return {
    ...state,
    activeUserByScope: {
      ...state.activeUserByScope,
      [scope]: { ...state.activeUserByScope[scope], [projectId]: userId },
    },
    ...(scope === 'normal'
      ? { activeUserByProject: { ...state.activeUserByProject, [projectId]: userId } }
      : {}),
  };
}
