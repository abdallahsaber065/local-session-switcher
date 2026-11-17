import { browser } from 'wxt/browser';
import { captureUser } from '../lib/capture';
import { browserAuthDeps } from '../lib/auth/browser';
import { applySinksToUser, runAuth } from '../lib/auth/runner';
import { executeSwitch, type SwitchReport } from '../lib/executor';
import { assertLocalOrigins } from '../lib/hosts';
import { assertHostAccess } from '../lib/permissions';
import { detectActiveUser } from '../lib/planner';
import { StateSchema } from '../lib/schema';
import { loadState, saveState, takePending } from '../lib/storage';
import type { AuthTestResult, BgRequest, BgResponse, CurrentSession } from '../lib/msg';
import { errMsg, hostOf, initials } from '../lib/util';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void rebuildMenus();
    void refreshBadge();
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.state) {
      void rebuildMenus();
      void refreshBadge();
    }
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message as BgRequest, sender)
      .then((data) => sendResponse({ ok: true, data } satisfies BgResponse<unknown>))
      .catch((error) => sendResponse({ ok: false, error: errMsg(error) } satisfies BgResponse<unknown>));
    return true;
  });

  browser.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });

  browser.contextMenus.onClicked.addListener((info) => {
    // Bundled OnClickData lacks tabId in its type; the runtime always provides it.
    void handleMenu(String(info.menuItemId), info as unknown as { tabId?: number });
  });

  void rebuildMenus();
  void refreshBadge();
});

async function handleMessage(
  message: BgRequest,
  sender: { tab?: { incognito?: boolean } },
): Promise<unknown> {
  switch (message.type) {
    case 'getState':
      return await loadState();

    case 'saveState': {
      const parsed = StateSchema.parse(message.state);
      for (const project of parsed.projects) assertLocalOrigins(project.origins);
      return await saveState(parsed);
    }

    case 'switchUser':
      return await doSwitch(message.projectId, message.userId, { windowId: message.windowId });

    case 'captureCurrent': {
      const state = await loadState();
      const user = await captureUser(state, message.projectId, message.tabId, message.name, message.tags);
      await saveState(state);
      await refreshBadge();
      return user;
    }

    case 'getCurrentSession':
      return await getCurrentSession(message.projectId, message.windowId);

    case 'takePendingInjection': {
      // Only the same context (normal ↔ private) may consume a queued session.
      const record = await takePending(message.origin, sender.tab?.incognito ?? false);
      return { apply: record?.apply ?? null };
    }

    case 'runAuthTest':
      return await runAuthTest(message.projectId, message.userId);

    case 'renewSession':
      return await renewSession(message.projectId, message.userId);

    case 'refreshSession':
      return await doSwitch(message.projectId, message.userId, { force: 'refresh', windowId: message.windowId });
  }
}

type ResolvedScope = { windowId: number; incognito: boolean; storeId?: string };

/**
 * Resolves which window a switch may touch and which cookie store belongs to
 * it. Normal and private windows map to different stores, which is what keeps
 * them fully isolated from each other.
 */
async function resolveScope(windowId?: number): Promise<ResolvedScope> {
  let id: number | undefined;
  let incognito = false;
  try {
    const win = windowId != null ? await browser.windows.get(windowId) : await browser.windows.getLastFocused();
    id = win.id;
    incognito = Boolean(win.incognito);
  } catch {
    const win = await browser.windows.getLastFocused();
    id = win.id;
    incognito = Boolean(win.incognito);
  }
  if (id == null) throw new Error('Target window is gone — try the switch again.');
  if (!incognito) return { windowId: id, incognito: false };

  // The bundled CookieStore type omits `incognito` though the API returns it.
  const stores = (await browser.cookies.getAllCookieStores()) as { id?: string; incognito?: boolean }[];
  const storeId = stores.find((store) => store.incognito)?.id;
  if (!storeId) {
    throw new Error('Switching inside a private window needs "Allow in incognito" for this extension.');
  }
  return { windowId: id, incognito, storeId };
}

/** Renews and caches tokens without touching the browser session (used from Settings). */
async function renewSession(projectId: string, userId: string): Promise<AuthTestResult> {
  const state = await loadState();
  const project = state.projects.find((entry) => entry.id === projectId);
  const user = project?.users.find((entry) => entry.id === userId);
  if (!project?.auth) return { ok: false, action: 'none', log: [], error: 'Project has no auth recipe' };
  if (!user) return { ok: false, action: 'none', log: [], error: 'User not found' };
  await assertHostAccess(project.origins);

  const run = await runAuth({
    recipe: project.auth,
    credentials: user.credentials,
    session: user.session,
    origins: project.origins,
    deps: browserAuthDeps(),
    force: 'refresh',
  });
  if (run.ok) {
    user.session = run.session;
    await saveState(state);
    await refreshBadge();
  }
  return { ok: run.ok, action: run.action, log: run.log, ...(run.error ? { error: run.error } : {}) };
}

async function runAuthTest(projectId: string, userId: string): Promise<AuthTestResult> {
  const state = await loadState();
  const project = state.projects.find((entry) => entry.id === projectId);
  const user = project?.users.find((entry) => entry.id === userId);
  if (!project?.auth) return { ok: false, action: 'none', log: [], error: 'Project has no auth recipe' };
  if (!user) return { ok: false, action: 'none', log: [], error: 'User not found' };
  await assertHostAccess(project.origins);

  const run = await runAuth({
    recipe: project.auth,
    credentials: user.credentials,
    session: user.session,
    origins: project.origins,
    deps: browserAuthDeps(),
    force: 'login',
  });
  return { ok: run.ok, action: run.action, log: run.log, ...(run.error ? { error: run.error } : {}) };
}

async function doSwitch(
  projectId: string,
  userId: string,
  options?: { force?: 'login' | 'refresh'; windowId?: number },
): Promise<SwitchReport> {
  const state = await loadState();
  const project = state.projects.find((entry) => entry.id === projectId);
  const user = project?.users.find((entry) => entry.id === userId);
  if (!project || !user) throw new Error('Project or user not found');
  await assertHostAccess(project.origins);

  // Scope first: fail fast (e.g. private window without permission) before any login runs.
  const scope = await resolveScope(options?.windowId);

  let effectiveUser = user;
  let authAction: SwitchReport['authAction'];
  let authLog: string[] = [];

  if (project.auth) {
    const run = await runAuth({
      recipe: project.auth,
      credentials: user.credentials,
      session: user.session,
      origins: project.origins,
      deps: browserAuthDeps(),
      force: options?.force,
    });
    authAction = run.action;
    authLog = run.log;
    if (!run.ok) {
      throw new Error(`Auth failed — ${run.error ?? 'see the auth log'}`);
    }
    user.session = run.session;
    effectiveUser = applySinksToUser(user, run.sinks);
  }

  const report = await executeSwitch(project, effectiveUser, scope);
  report.authAction = authAction;
  report.authLog = authLog;

  user.lastUsedAt = new Date().toISOString();
  state.activeProjectId = projectId;
  state.activeUserByProject[projectId] = userId;
  await saveState(state);
  await refreshBadge();
  return report;
}

async function getCurrentSession(projectId: string, windowId?: number): Promise<CurrentSession> {
  const state = await loadState();
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) return { cookies: [], userId: null };

  const scope = await resolveScope(windowId);
  const storeFilter = scope.storeId ? { storeId: scope.storeId } : {};
  const cookies: CurrentSession['cookies'] = [];
  for (const origin of [...new Set(project.origins)]) {
    const host = hostOf(origin);
    try {
      for (const cookie of await browser.cookies.getAll({ domain: host, ...storeFilter })) {
        cookies.push({ host, name: cookie.name, value: cookie.value });
      }
    } catch {
      // host without permission or invalid — skip
    }
  }
  return { cookies, userId: detectActiveUser(project.users, cookies) };
}

async function handleCommand(command: string): Promise<void> {
  if (command !== 'next-user' && command !== 'prev-user') return;
  const direction = command === 'next-user' ? 1 : -1;

  const state = await loadState();
  const project = state.projects.find((entry) => entry.id === state.activeProjectId);
  if (!project || project.users.length === 0) return;

  const currentId = state.activeUserByProject[project.id];
  const index = project.users.findIndex((entry) => entry.id === currentId);
  const nextIndex = index < 0 ? 0 : (index + direction + project.users.length) % project.users.length;
  const next = project.users[nextIndex];
  if (next) {
    // Shortcuts are global: they target whichever window is focused when pressed.
    const focused = await browser.windows.getLastFocused();
    await doSwitch(project.id, next.id, { windowId: focused.id });
  }
}

async function handleMenu(menuItemId: string, info: { tabId?: number }): Promise<void> {
  if (!menuItemId.startsWith('u:')) return;
  const state = await loadState();
  if (!state.activeProjectId) return;

  // Right-click knows its tab → scope to that tab's window.
  let windowId: number | undefined;
  if (info.tabId != null) {
    try {
      windowId = (await browser.tabs.get(info.tabId)).windowId;
    } catch {
      // tab closed before the switch ran
    }
  }
  try {
    await doSwitch(state.activeProjectId, menuItemId.slice(2), { windowId });
  } catch (error) {
    console.warn('Session Switcher: context menu switch failed', errMsg(error));
  }
}

async function rebuildMenus(): Promise<void> {
  try {
    await browser.contextMenus.removeAll();
    const state = await loadState();
    const project = state.projects.find((entry) => entry.id === state.activeProjectId);
    if (!project || project.users.length === 0) return;

    const activeId = state.activeUserByProject[project.id];
    browser.contextMenus.create({
      id: 'lss-root',
      title: `Session Switcher: ${project.name}`,
      contexts: ['all'],
    });
    for (const user of project.users.slice(0, 20)) {
      browser.contextMenus.create({
        id: `u:${user.id}`,
        parentId: 'lss-root',
        title: (user.id === activeId ? '✓ ' : '') + user.name,
        contexts: ['all'],
      });
    }
  } catch (error) {
    console.warn('Session Switcher: could not rebuild menus', errMsg(error));
  }
}

async function refreshBadge(): Promise<void> {
  try {
    const state = await loadState();
    const project = state.projects.find((entry) => entry.id === state.activeProjectId);
    const user = project ? project.users.find((entry) => entry.id === state.activeUserByProject[project.id]) : undefined;

    await browser.action.setBadgeText({ text: user ? initials(user.name) : '' });
    await browser.action.setBadgeBackgroundColor({ color: user ? '#2f7d5a' : '#3a4038' });
    await browser.action.setTitle({
      title: project
        ? `Session Switcher — ${project.name}${user ? ` • ${user.name}` : ''}`
        : 'Session Switcher — no project selected',
    });
  } catch {
    // badge is best-effort
  }
}
