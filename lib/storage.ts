import { browser } from 'wxt/browser';
import { StateSchema, type AppState } from './schema';
import type { StorageApply } from './planner';

const STATE_KEY = 'state';
const PENDING_KEY = 'pending';

export type PendingInjection = {
  origin: string;
  apply: StorageApply;
  projectId: string;
  userId: string;
  at: string;
};

export type PendingMap = Record<string, PendingInjection>;

export async function loadState(): Promise<AppState> {
  const stored = await browser.storage.local.get(STATE_KEY);
  return StateSchema.parse(stored[STATE_KEY] ?? {});
}

export async function saveState(state: AppState): Promise<AppState> {
  const parsed = StateSchema.parse(state);
  await browser.storage.local.set({ [STATE_KEY]: parsed });
  return parsed;
}

async function loadPendingMap(): Promise<PendingMap> {
  const stored = await browser.storage.local.get(PENDING_KEY);
  return (stored[PENDING_KEY] as PendingMap | undefined) ?? {};
}

export async function setPending(
  records: { origin: string; apply: StorageApply }[],
  projectId: string,
  userId: string,
): Promise<void> {
  const map = await loadPendingMap();
  for (const record of records) {
    map[record.origin] = { ...record, projectId, userId, at: new Date().toISOString() };
  }
  await browser.storage.local.set({ [PENDING_KEY]: map });
}

export async function takePending(origin: string): Promise<PendingInjection | null> {
  const map = await loadPendingMap();
  const record = map[origin];
  if (!record) return null;
  delete map[origin];
  await browser.storage.local.set({ [PENDING_KEY]: map });
  return record;
}
