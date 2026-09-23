import { browser } from 'wxt/browser';
import type { AppState, User } from './schema';
import type { StorageApply } from './planner';
import type { SwitchReport } from './executor';

export type TabStorageSnapshot = {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
};

export type CurrentSession = {
  cookies: { host: string; name: string; value: string }[];
  userId: string | null;
};

/** Messages sent to the background service worker. */
export type BgRequest =
  | { type: 'getState' }
  | { type: 'saveState'; state: AppState }
  | { type: 'switchUser'; projectId: string; userId: string }
  | { type: 'captureCurrent'; projectId: string; tabId: number; name: string; tags: string[] }
  | { type: 'getCurrentSession'; projectId: string }
  | { type: 'takePendingInjection'; origin: string }
  | { type: 'runAuthTest'; projectId: string; userId: string }
  | { type: 'renewSession'; projectId: string; userId: string }
  | { type: 'refreshSession'; projectId: string; userId: string };

export type AuthTestResult = { ok: boolean; action: string; log: string[]; error?: string };

/** Messages sent from the background to a content script. */
export type TabRequest = { type: 'applyStorage'; apply: StorageApply } | { type: 'readStorage' };

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string };
export type BgResponse<T> = Ok<T> | Err;

async function send<T>(request: BgRequest): Promise<T> {
  const response = (await browser.runtime.sendMessage(request)) as BgResponse<T> | undefined;
  if (!response) throw new Error('No response from the extension background');
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export const bg = {
  getState: () => send<AppState>({ type: 'getState' }),
  saveState: (state: AppState) => send<AppState>({ type: 'saveState', state }),
  switchUser: (projectId: string, userId: string) => send<SwitchReport>({ type: 'switchUser', projectId, userId }),
  captureCurrent: (projectId: string, tabId: number, name: string, tags: string[]) =>
    send<User>({ type: 'captureCurrent', projectId, tabId, name, tags }),
  getCurrentSession: (projectId: string) => send<CurrentSession>({ type: 'getCurrentSession', projectId }),
  takePendingInjection: (origin: string) => send<{ apply: StorageApply | null }>({ type: 'takePendingInjection', origin }),
  runAuthTest: (projectId: string, userId: string) => send<AuthTestResult>({ type: 'runAuthTest', projectId, userId }),
  renewSession: (projectId: string, userId: string) => send<AuthTestResult>({ type: 'renewSession', projectId, userId }),
  refreshSession: (projectId: string, userId: string) => send<SwitchReport>({ type: 'refreshSession', projectId, userId }),
};
