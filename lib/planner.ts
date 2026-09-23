import type { ClearCookiesMode, ClearStorageMode, CookieSeed, Project, User } from './schema';

export type ExistingCookie = { name: string; path: string };

export type TabLike = { id?: number; url?: string; active?: boolean };

export type StorageApply = {
  write: {
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
  };
  clear: {
    localStorage: ClearStorageMode;
    sessionStorage: ClearStorageMode;
  };
};

export type SwitchPlan = {
  cookieOps: { origin: string; set: CookieSeed[]; remove: ExistingCookie[] }[];
  storageTabs: { tabId: number; origin: string; apply: StorageApply }[];
  /** Origins with no open tab: the content script applies this on next load. */
  pending: { origin: string; apply: StorageApply }[];
  reloadTabIds: number[];
};

export function originOf(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function matchCookieClear(name: string, mode: ClearCookiesMode): boolean {
  if (mode === 'all') return true;
  if ('names' in mode) return mode.names.includes(name);
  return mode.prefixes.some((prefix) => name.startsWith(prefix));
}

/**
 * Heuristic: the user whose captured cookies are all present (name+value) in the
 * live session. Picks the profile with the most matched cookies.
 */
export function detectActiveUser(users: User[], current: { name: string; value: string }[]): string | null {
  let best: { id: string; count: number } | null = null;
  for (const user of users) {
    const cookies = user.cookies.filter((cookie) => cookie.value !== '');
    if (cookies.length === 0) continue;
    const allMatch = cookies.every((cookie) =>
      current.some((cur) => cur.name === cookie.name && cur.value === cookie.value),
    );
    if (allMatch && (!best || cookies.length > best.count)) best = { id: user.id, count: cookies.length };
  }
  return best?.id ?? null;
}

export function planSwitch(args: {
  project: Pick<Project, 'origins' | 'clear' | 'reload'>;
  user: Pick<User, 'cookies' | 'storage'>;
  tabs: TabLike[];
  cookiesByHost: Record<string, ExistingCookie[]>;
}): SwitchPlan {
  const { project, user, tabs, cookiesByHost } = args;
  const origins = [...new Set(project.origins)];

  const tabsByOrigin = new Map<string, number[]>();
  const activeTabByOrigin = new Map<string, number>();
  for (const tab of tabs) {
    if (tab.id == null) continue;
    const origin = originOf(tab.url);
    if (!origin || !origins.includes(origin)) continue;
    const list = tabsByOrigin.get(origin) ?? [];
    list.push(tab.id);
    tabsByOrigin.set(origin, list);
    if (tab.active) activeTabByOrigin.set(origin, tab.id);
  }

  const cookieOps: SwitchPlan['cookieOps'] = [];
  const storageTabs: SwitchPlan['storageTabs'] = [];
  const pending: SwitchPlan['pending'] = [];
  const reloadTabIds: number[] = [];

  for (const origin of origins) {
    const host = new URL(origin).hostname;

    const applicable = user.cookies.filter((cookie) => !cookie.domain || cookie.domain === host);
    const justSet = new Set(applicable.map((cookie) => `${cookie.name}\u0000${cookie.path}`));
    const existing = cookiesByHost[host] ?? [];
    const remove = existing.filter(
      (cookie) => !justSet.has(`${cookie.name}\u0000${cookie.path}`) && matchCookieClear(cookie.name, project.clear.cookies),
    );
    cookieOps.push({ origin, set: applicable, remove });

    const source = user.storage[origin] ?? { localStorage: {}, sessionStorage: {} };
    const apply: StorageApply = {
      write: { localStorage: source.localStorage, sessionStorage: source.sessionStorage },
      clear: {
        localStorage: project.clear.localStorage,
        sessionStorage: project.clear.sessionStorage,
      },
    };

    const tabIds = tabsByOrigin.get(origin) ?? [];
    if (tabIds.length > 0) {
      for (const tabId of tabIds) storageTabs.push({ tabId, origin, apply });
    } else {
      pending.push({ origin, apply });
    }

    if (project.reload === 'matching-tabs') {
      reloadTabIds.push(...tabIds);
    } else if (project.reload === 'active-tab') {
      const activeId = activeTabByOrigin.get(origin);
      if (activeId != null) reloadTabIds.push(activeId);
    }
  }

  return { cookieOps, storageTabs, pending, reloadTabIds };
}
