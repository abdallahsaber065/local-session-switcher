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
  | { type: 'switchUser'; projectId: string; userId: string; windowId?: number; storeId?: string }
  | { type: 'captureCurrent'; projectId: string; tabId: number; name: string; tags: string[]; storeId?: string }
  | { type: 'getCurrentSession'; projectId: string; windowId?: number; storeId?: string }
  | { type: 'takePendingInjection'; origin: string }
  | { type: 'runAuthTest'; projectId: string; userId: string }
  | { type: 'renewSession'; projectId: string; userId: string }
  | { type: 'refreshSession'; projectId: string; userId: string; windowId?: number; storeId?: string };

export type AuthTestResult = { ok: boolean; action: string; log: string[]; error?: string };

/** Messages sent from the background to a content script. */
export type TabRequest = { type: 'applyStorage'; apply: StorageApply } | { type: 'readStorage' };

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string };
export type BgResponse<T> = Ok<T> | Err;

async function send<T>(request: BgRequest): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = (await Promise.race([
      browser.runtime.sendMessage(request),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 5000);
      }),
    ])) as BgResponse<T> | undefined;
    if (!response) {
      throw new Error(
        'The background did not respond. In a private window this usually means "Allow in incognito" is off — enable it in chrome://extensions → Details, then reopen the popup.',
      );
    }
    if (!response.ok) throw new Error(response.error);
    return response.data;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const bg = {
  getState: () => send<AppState>({ type: 'getState' }),
  saveState: (state: AppState) => send<AppState>({ type: 'saveState', state }),
  switchUser: (projectId: string, userId: string, windowId?: number, storeId?: string) =>
    send<SwitchReport>({
      type: 'switchUser',
      projectId,
      userId,
      ...(windowId != null ? { windowId } : {}),
      ...(storeId ? { storeId } : {}),
    }),
  captureCurrent: (projectId: string, tabId: number, name: string, tags: string[], storeId?: string) =>
    send<User>({ type: 'captureCurrent', projectId, tabId, name, tags, ...(storeId ? { storeId } : {}) }),
  getCurrentSession: (projectId: string, windowId?: number, storeId?: string) =>
    send<CurrentSession>({
      type: 'getCurrentSession',
      projectId,
      ...(windowId != null ? { windowId } : {}),
      ...(storeId ? { storeId } : {}),
    }),
  takePendingInjection: (origin: string) => send<{ apply: StorageApply | null }>({ type: 'takePendingInjection', origin }),
  runAuthTest: (projectId: string, userId: string) => send<AuthTestResult>({ type: 'runAuthTest', projectId, userId }),
  renewSession: (projectId: string, userId: string) => send<AuthTestResult>({ type: 'renewSession', projectId, userId }),
  refreshSession: (projectId: string, userId: string, windowId?: number, storeId?: string) =>
    send<SwitchReport>({
      type: 'refreshSession',
      projectId,
      userId,
      ...(windowId != null ? { windowId } : {}),
      ...(storeId ? { storeId } : {}),
    }),
};
