import { useCallback, useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { userAuthStatus } from '../lib/auth/lifecycle';
import type { SwitchReport } from '../lib/executor';
import { bg, type CurrentSession } from '../lib/msg';
import { ensureOriginAccess } from '../lib/permissions';
import type { AppState } from '../lib/schema';
import { cx, errMsg } from '../lib/util';
import { CaptureForm } from './CaptureForm';
import { IconChevron, IconGear, IconStamp } from './icons';
import { UserLine } from './UserRow';
import { Banner, Button, Chip, EmptyState, IconButton, Input, Skeleton } from './ui';

type Notice = { kind: 'ok' | 'err'; text: string };

/** The window hosting this popup/side panel — everything stays scoped to it. */
async function activeWindowId(): Promise<number | undefined> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.windowId;
  } catch {
    return undefined;
  }
}

async function isIncognitoWindow(): Promise<boolean> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return Boolean(tab?.incognito);
  } catch {
    return false;
  }
}

/** Legacy API not typed by WXT; used only to explain a private-window setup problem. */
async function allowedInIncognito(): Promise<boolean | null> {
  const legacy = (
    browser as unknown as {
      extension?: { isAllowedIncognitoAccess?: (callback: (allowed: boolean) => void) => void };
    }
  ).extension;
  if (!legacy?.isAllowedIncognitoAccess) return null;
  return new Promise((resolve) => legacy.isAllowedIncognitoAccess!((allowed) => resolve(allowed)));
}

function authPhrase(action: SwitchReport['authAction']): string {
  switch (action) {
    case 'reuse':
      return 'reused the cached session';
    case 'refresh':
      return 'refreshed the session';
    case 'login':
      return 'logged in';
    default:
      return '';
  }
}

function summarize(report: SwitchReport): string {
  return [
    authPhrase(report.authAction),
    `${report.cookiesSet} cookies set`,
    `${report.cookiesRemoved} removed`,
    `${report.tabsReloaded} ${report.tabsReloaded === 1 ? 'tab' : 'tabs'} reloaded`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function Switcher() {
  const [state, setState] = useState<AppState | null>(null);
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [busy, setBusy] = useState<{ id: string; kind: 'switch' | 'refresh' } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if ((await isIncognitoWindow()) && (await allowedInIncognito()) === false) {
      throw new Error('This extension is not allowed in private windows. Enable "Allow in incognito" in chrome://extensions → Details, then reopen the popup.');
    }
    const next = await bg.getState();
    setState(next);
    setReady(true);
    try {
      // Detection is cosmetic — never block the whole popup if it fails.
      const windowId = await activeWindowId();
      const sessionResult = next.activeProjectId
        ? await bg.getCurrentSession(next.activeProjectId, windowId)
        : null;
      setSession(sessionResult);
    } catch {
      // keep the state we already have
    }
  }, []);

  useEffect(() => {
    refresh().catch((error) => setNotice({ kind: 'err', text: errMsg(error) }));
  }, [refresh]);

  const project = state?.projects.find((entry) => entry.id === state.activeProjectId) ?? null;
  const detectedId = session?.userId ?? null;
  const now = Date.now();

  const visibleUsers = useMemo(() => {
    if (!project) return [];
    const search = query.trim().toLowerCase();
    return project.users.filter(
      (user) =>
        (!filterTag || user.tags.includes(filterTag)) && (!search || user.name.toLowerCase().includes(search)),
    );
  }, [project, filterTag, query]);

  const colorOf = (tag: string) => project?.tags.find((entry) => entry.name === tag)?.color ?? '#82866f';

  async function handleSelectProject(id: string) {
    if (!state) return;
    setNotice(null);
    try {
      const saved = await bg.saveState({ ...state, activeProjectId: id || null });
      setState(saved);
      setSession(id ? await bg.getCurrentSession(id, await activeWindowId()) : null);
      setFilterTag(null);
      setQuery('');
    } catch (error) {
      setNotice({ kind: 'err', text: errMsg(error) });
    }
  }

  function reportNotice(report: SwitchReport, verb: string) {
    const summary = summarize(report);
    setNotice(
      report.failures.length > 0
        ? { kind: 'err', text: `${verb} — ${report.failures.length} failure(s): ${report.failures.slice(0, 2).join(' | ')}` }
        : { kind: 'ok', text: `${verb}. ${summary}.` },
    );
  }

  async function handleSwitch(userId: string) {
    if (!project) return;
    setBusy({ id: userId, kind: 'switch' });
    setNotice(null);
    try {
      await ensureOriginAccess(project.origins);
      const report = await bg.switchUser(project.id, userId, await activeWindowId());
      reportNotice(report, 'Posted');
      await refresh();
    } catch (error) {
      setNotice({ kind: 'err', text: errMsg(error) });
    } finally {
      setBusy(null);
    }
  }

  async function handleRefresh(userId: string) {
    if (!project) return;
    setBusy({ id: userId, kind: 'refresh' });
    setNotice(null);
    try {
      await ensureOriginAccess(project.origins);
      const report = await bg.refreshSession(project.id, userId, await activeWindowId());
      reportNotice(report, 'Restamped');
      await refresh();
    } catch (error) {
      setNotice({ kind: 'err', text: errMsg(error) });
    } finally {
      setBusy(null);
    }
  }

  async function handleCapture(name: string, tags: string[]) {
    if (!project) return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');
    await ensureOriginAccess(project.origins);
    await bg.captureCurrent(project.id, tab.id, name, tags);
    setCaptureOpen(false);
    setNotice({ kind: 'ok', text: `Captured "${name}" from the active tab.` });
    await refresh();
  }

  if (!state) {
    if (notice?.kind === 'err') {
      return (
        <div className="space-y-2 p-3">
          <div className="text-[12px] text-stamp">Could not start in this window</div>
          <div className="border border-stamp/50 bg-sheet p-2 text-[11px] leading-relaxed text-inkdim">
            {notice.text}
          </div>
          <div className="text-[10px] leading-relaxed text-inkfaint">
            For private windows: chrome://extensions → this extension → Details → “Allow in incognito”, then reopen
            the popup.
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col" data-ready={ready ? '1' : '0'}>
      <header className="border-b border-rule px-3 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] uppercase tracking-[0.24em] text-inkfaint">Local Session Switcher</div>
            <div className="relative mt-0.5 flex items-center">
              <select
                aria-label="Active project"
                value={state.activeProjectId ?? ''}
                onChange={(event) => void handleSelectProject(event.target.value)}
                className="w-full appearance-none bg-transparent pr-5 text-[14px] text-ink outline-none"
              >
                <option value="">— select project —</option>
                {state.projects.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              <IconChevron size={13} className="pointer-events-none absolute right-0 text-inkfaint" />
            </div>
            <div className="num truncate font-mono text-[10px] text-inkdim">
              {project ? project.origins.join('  ·  ') : 'choose a project'}
            </div>
          </div>
          <IconButton label="Settings" onClick={() => void browser.runtime.openOptionsPage()}>
            <IconGear />
          </IconButton>
        </div>
      </header>

      {!project && (
        <div className="p-3">
          <EmptyState title={state.projects.length === 0 ? 'The ledger is empty' : 'Pick a project'}>
            {state.projects.length === 0
              ? 'Open Settings to create a project, or import a seed file.'
              : 'Select a project above to list its test users.'}
          </EmptyState>
        </div>
      )}

      {project && (
        <>
          {project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 border-b border-rule px-3 py-2">
              <Chip name="all" color="#82866f" active={filterTag === null} onClick={() => setFilterTag(null)} />
              {project.tags.map((tag) => (
                <Chip
                  key={tag.name}
                  name={tag.name}
                  color={tag.color}
                  active={filterTag === tag.name}
                  onClick={() => setFilterTag(filterTag === tag.name ? null : tag.name)}
                />
              ))}
            </div>
          )}

          {project.users.length > 8 && (
            <div className="border-b border-rule px-3 py-2">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names…" />
            </div>
          )}

          <div className="ruled max-h-80 overflow-y-auto border-b border-rule">
            {visibleUsers.map((user, index) => (
              <UserLine
                key={user.id}
                user={user}
                lineNo={index + 1}
                colorOf={colorOf}
                detected={user.id === detectedId}
                busy={busy?.id === user.id}
                status={userAuthStatus(project, user, now)}
                onSwitch={() => void handleSwitch(user.id)}
                onRefresh={() => void handleRefresh(user.id)}
              />
            ))}
            {visibleUsers.length === 0 && (
              <div className="p-3">
                <EmptyState
                  title={project.users.length === 0 ? 'No lines posted yet' : 'Nothing matches this filter'}
                >
                  {project.users.length === 0
                    ? 'Log in on the project tab, then capture the session — or add users in Settings.'
                    : 'Clear the filter or search to see the rest.'}
                </EmptyState>
              </div>
            )}
          </div>

          <div className="space-y-2 p-3">
            {!captureOpen ? (
              <div className="flex items-center justify-between gap-2">
                <Button variant="primary" onClick={() => setCaptureOpen(true)}>
                  <IconStamp size={13} />
                  Capture current tab
                </Button>
                <span className="num text-[10px] text-inkfaint">
                  {project.users.length} {project.users.length === 1 ? 'user' : 'users'} on file
                </span>
              </div>
            ) : (
              <CaptureForm
                tagOptions={project.tags.map((tag) => tag.name)}
                colorOf={colorOf}
                onSave={handleCapture}
                onCancel={() => setCaptureOpen(false)}
              />
            )}
          </div>
        </>
      )}

      {notice && (
        <div className="px-3 pb-3">
          <Banner kind={notice.kind === 'ok' ? 'ok' : 'err'}>{notice.text}</Banner>
        </div>
      )}
    </div>
  );
}
