import type { ClearStorageMode } from './schema';
import type { StorageApply } from './planner';

function snapshot(store: Storage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key != null) out[key] = store.getItem(key) ?? '';
  }
  return out;
}

export function readStorageSnapshot(): { localStorage: Record<string, string>; sessionStorage: Record<string, string> } {
  return {
    localStorage: snapshot(window.localStorage),
    sessionStorage: snapshot(window.sessionStorage),
  };
}

function keysToRemove(store: Storage, mode: ClearStorageMode, protectedKeys: Set<string>): string[] {
  const all: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key != null) all.push(key);
  }
  if (mode === 'all') return all.filter((key) => !protectedKeys.has(key));
  if (mode.mode === 'all') {
    const exclude = new Set(mode.exclude);
    return all.filter((key) => !protectedKeys.has(key) && !exclude.has(key));
  }
  return mode.keys.filter((key) => !protectedKeys.has(key) && store.getItem(key) !== null);
}

/** Writes the new session first, then prunes leftovers (never the keys just written). */
export function applyStorage(apply: StorageApply): { written: number; removed: string[] } {
  const ls = window.localStorage;
  const ss = window.sessionStorage;
  let written = 0;

  const write = (store: Storage, values: Record<string, string>) => {
    for (const [key, value] of Object.entries(values)) {
      store.setItem(key, value);
      written++;
    }
  };
  write(ls, apply.write.localStorage);
  write(ss, apply.write.sessionStorage);

  const removed: string[] = [];
  const prune = (store: Storage, mode: ClearStorageMode, values: Record<string, string>) => {
    const protectedKeys = new Set(Object.keys(values));
    for (const key of keysToRemove(store, mode, protectedKeys)) {
      store.removeItem(key);
      removed.push(key);
    }
  };
  prune(ls, apply.clear.localStorage, apply.write.localStorage);
  prune(ss, apply.clear.sessionStorage, apply.write.sessionStorage);

  return { written, removed };
}
