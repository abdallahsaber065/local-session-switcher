import { browser } from 'wxt/browser';
import { UserSchema, type AppState, type CookieSeed, type User } from './schema';
import type { TabStorageSnapshot } from './msg';
import { errMsg, colorForTag, hostOf } from './util';

/** Reads the live session of the tab (cookies + storage) and adds it as a user profile. */
export async function captureUser(
  state: AppState,
  projectId: string,
  tabId: number,
  name: string,
  tags: string[],
): Promise<User> {
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) throw new Error('Project not found');

  const tab = await browser.tabs.get(tabId);
  const url = tab.url ?? '';
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new Error('Cannot read the active tab URL');
  }
  if (!project.origins.includes(origin)) {
    throw new Error(`Active tab must be on one of: ${project.origins.join(', ')}`);
  }

  const host = hostOf(origin);
  const rawCookies = await browser.cookies.getAll({ domain: host });
  const cookies: CookieSeed[] = rawCookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.hostOnly ? undefined : cookie.domain,
    path: cookie.path,
    hostOnly: cookie.hostOnly,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite:
      cookie.sameSite === 'no_restriction' || cookie.sameSite === 'lax' || cookie.sameSite === 'strict'
        ? cookie.sameSite
        : 'unspecified',
    ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
  }));

  let storage: TabStorageSnapshot = { localStorage: {}, sessionStorage: {} };
  try {
    storage = (await browser.tabs.sendMessage(tabId, { type: 'readStorage' })) as TabStorageSnapshot;
  } catch (error) {
    console.warn('Session Switcher: could not read page storage', errMsg(error));
  }

  for (const tag of tags) {
    if (!project.tags.some((entry) => entry.name === tag)) {
      project.tags.push({ name: tag, color: colorForTag(tag) });
    }
  }

  const user = UserSchema.parse({
    id: crypto.randomUUID(),
    name,
    tags,
    cookies,
    storage: { [origin]: storage },
    capturedAt: new Date().toISOString(),
  });
  project.users.push(user);
  return user;
}
