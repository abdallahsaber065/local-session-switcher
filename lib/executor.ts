import { browser } from 'wxt/browser';
import type { Project, User } from './schema';
import { originOf, planSwitch, type ExistingCookie, type TabLike } from './planner';
import { setPending } from './storage';
import { errMsg, hostOf } from './util';

export type SwitchReport = {
  cookiesSet: number;
  cookiesRemoved: number;
  tabsUpdated: number;
  tabsReloaded: number;
  pendingOrigins: string[];
  failures: string[];
  /** What the auth lifecycle did before the swap (when the project has a recipe). */
  authAction?: 'reuse' | 'refresh' | 'login' | 'none';
  authLog?: string[];
};

export async function executeSwitch(project: Project, user: User): Promise<SwitchReport> {
  const origins = [...new Set(project.origins)];
  const hosts = [...new Set(origins.map(hostOf))];

  const cookiesByHost: Record<string, ExistingCookie[]> = {};
  for (const host of hosts) {
    try {
      const cookies = await browser.cookies.getAll({ domain: host });
      cookiesByHost[host] = cookies.map((cookie) => ({ name: cookie.name, path: cookie.path }));
    } catch (error) {
      cookiesByHost[host] = [];
      console.warn(`Session Switcher: could not read cookies for ${host}`, error);
    }
  }

  const allTabs = await browser.tabs.query({});
  const tabs: TabLike[] = allTabs.map((tab) => ({ id: tab.id, url: tab.url, active: tab.active }));
  const plan = planSwitch({ project, user, tabs, cookiesByHost });

  const report: SwitchReport = {
    cookiesSet: 0,
    cookiesRemoved: 0,
    tabsUpdated: 0,
    tabsReloaded: 0,
    pendingOrigins: [],
    failures: [],
  };

  for (const op of plan.cookieOps) {
    for (const cookie of op.set) {
      try {
        await browser.cookies.set({
          url: op.origin + (cookie.path || '/'),
          name: cookie.name,
          value: cookie.value,
          path: cookie.path || '/',
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
          ...(cookie.domain && !cookie.hostOnly ? { domain: cookie.domain } : {}),
        });
        report.cookiesSet++;
      } catch (error) {
        report.failures.push(`set cookie ${cookie.name} @ ${op.origin}: ${errMsg(error)}`);
      }
    }
    for (const cookie of op.remove) {
      try {
        await browser.cookies.remove({ url: op.origin + (cookie.path || '/'), name: cookie.name });
        report.cookiesRemoved++;
      } catch (error) {
        report.failures.push(`remove cookie ${cookie.name} @ ${op.origin}: ${errMsg(error)}`);
      }
    }
  }

  const pendingFallback: { origin: string; apply: (typeof plan.pending)[number]['apply'] }[] = [];
  for (const entry of plan.storageTabs) {
    try {
      await browser.tabs.sendMessage(entry.tabId, { type: 'applyStorage', apply: entry.apply });
      report.tabsUpdated++;
    } catch {
      // Content script not reachable (page loaded before install) — apply on next load instead.
      pendingFallback.push({ origin: entry.origin, apply: entry.apply });
    }
  }

  const allPending = [...plan.pending, ...pendingFallback];
  if (allPending.length > 0) {
    await setPending(allPending, project.id, user.id);
    report.pendingOrigins = [...new Set(allPending.map((entry) => entry.origin))];
  }

  for (const tabId of plan.reloadTabIds) {
    try {
      await browser.tabs.reload(tabId);
      report.tabsReloaded++;
    } catch (error) {
      report.failures.push(`reload tab ${tabId}: ${errMsg(error)}`);
    }
  }

  return report;
}

export function currentTabOrigin(url?: string): string | null {
  return originOf(url);
}
