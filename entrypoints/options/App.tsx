import { useEffect, useRef, useState, type ReactNode } from 'react';
import { userAuthStatus } from '../../lib/auth/lifecycle';
import { AUTH_PRESETS } from '../../lib/auth/presets';
import { AuthRecipeSchema } from '../../lib/auth/schema';
import { bg, type AuthTestResult } from '../../lib/msg';
import {
  ProjectSchema,
  SeedSchema,
  StateSchema,
  UserSchema,
  errorLines,
  type AppState,
  type ClearCookiesMode,
  type ClearStorageMode,
  type Project,
  type SeedInput,
  type Tag,
  type User,
} from '../../lib/schema';
import { mergeSeed, stripSecrets, type MergeResult } from '../../lib/seed';
import { ensureOriginAccess } from '../../lib/permissions';
import { TAG_COLORS, cx, download, errMsg, fmtAge, readFileText, slugId } from '../../lib/util';
import { IconDownload, IconPlus, IconRefresh, IconTrash, IconUpload, IconWarn } from '../../components/icons';
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  SectionTitle,
  Select,
  Skeleton,
  Stamp,
  Textarea,
} from '../../components/ui';

const TONE = {
  ok: 'text-inkgreen',
  warn: 'text-inkamber',
  bad: 'text-stamp',
  info: 'text-inkblue',
  none: 'text-inkfaint',
} as const;

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Textarea text that commits to the parent on blur (keeps trailing newlines while typing). */
function useTextDraft(external: string, commit: (text: string) => void) {
  const [text, setText] = useState(external);
  const pushed = useRef(external);
  useEffect(() => {
    if (external !== pushed.current) {
      setText(external);
      pushed.current = external;
    }
  }, [external]);
  return {
    value: text,
    onChange: (next: string) => setText(next),
    onBlur: () => {
      pushed.current = text;
      commit(text);
    },
  };
}

function ClearCookiesEditor({ value, onChange }: { value: ClearCookiesMode; onChange: (next: ClearCookiesMode) => void }) {
  const mode = value === 'all' ? 'all' : 'names' in value ? 'names' : 'prefixes';
  const list = value === 'all' ? '' : 'names' in value ? value.names.join('\n') : value.prefixes.join('\n');
  const draft = useTextDraft(list, (text) => {
    const items = linesToList(text);
    if (value !== 'all') onChange('names' in value ? { names: items } : { prefixes: items });
  });

  return (
    <Field label="Cookies to clear before inject">
      <div className="space-y-1.5">
        <Select
          value={mode}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'all') onChange('all');
            else if (next === 'names') onChange({ names: [] });
            else onChange({ prefixes: [] });
          }}
        >
          <option value="all">All cookies on this host</option>
          <option value="names">Only these cookie names</option>
          <option value="prefixes">Only cookie name prefixes</option>
        </Select>
        {value !== 'all' && (
          <Textarea
            mono
            rows={2}
            value={draft.value}
            onChange={(event) => draft.onChange(event.target.value)}
            onBlur={draft.onBlur}
            placeholder={mode === 'names' ? 'session\nnext-auth.session-token' : 'next-auth.\nsb-'}
          />
        )}
      </div>
    </Field>
  );
}

function ClearStorageEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ClearStorageMode;
  onChange: (next: ClearStorageMode) => void;
}) {
  const mode = value === 'all' ? 'all' : value.mode === 'all' ? 'exclude' : 'keys';
  const list = value === 'all' ? '' : value.mode === 'all' ? value.exclude.join('\n') : value.keys.join('\n');
  const draft = useTextDraft(list, (text) => {
    const items = linesToList(text);
    if (value !== 'all') onChange(value.mode === 'all' ? { mode: 'all', exclude: items } : { mode: 'keys', keys: items });
  });

  return (
    <Field label={label}>
      <div className="space-y-1.5">
        <Select
          value={mode}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'all') onChange('all');
            else if (next === 'exclude') onChange({ mode: 'all', exclude: [] });
            else onChange({ mode: 'keys', keys: [] });
          }}
        >
          <option value="all">Clear everything</option>
          <option value="exclude">Clear all except…</option>
          <option value="keys">Clear only these keys…</option>
        </Select>
        {value !== 'all' && (
          <Textarea
            mono
            rows={2}
            value={draft.value}
            onChange={(event) => draft.onChange(event.target.value)}
            onBlur={draft.onBlur}
            placeholder="keep-theme\nkeep-locale"
          />
        )}
      </div>
    </Field>
  );
}

function OverviewPanel({ project, onChange }: { project: Project; onChange: (patch: Partial<Project>) => void }) {
  const originsDraft = useTextDraft(project.origins.join('\n'), (text) => onChange({ origins: linesToList(text) }));

  return (
    <div className="max-w-3xl space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Origins" hint="one per line">
          <Textarea
            mono
            rows={3}
            value={originsDraft.value}
            onChange={(event) => originsDraft.onChange(event.target.value)}
            onBlur={originsDraft.onBlur}
            placeholder={'http://localhost:3000\nhttp://myapp.test'}
          />
          <p className="text-[10px] leading-relaxed text-inkfaint">
            localhost, 127.0.0.1, [::1], *.test, *.local, *.localhost, *.internal, and LAN/loopback IPs.
            Extra hosts prompt for access on save — remote origins are refused.
          </p>
        </Field>
        <Field label="Reload after switching">
          <Select value={project.reload} onChange={(event) => onChange({ reload: event.target.value as Project['reload'] })}>
            <option value="matching-tabs">Reload all project tabs</option>
            <option value="active-tab">Reload active project tab only</option>
            <option value="none">No reload</option>
          </Select>
        </Field>
      </div>

      <div className="space-y-4">
        <SectionTitle>Clearing</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <ClearCookiesEditor value={project.clear.cookies} onChange={(next) => onChange({ clear: { ...project.clear, cookies: next } })} />
          <ClearStorageEditor
            label="localStorage on switch"
            value={project.clear.localStorage}
            onChange={(next) => onChange({ clear: { ...project.clear, localStorage: next } })}
          />
          <ClearStorageEditor
            label="sessionStorage on switch"
            value={project.clear.sessionStorage}
            onChange={(next) => onChange({ clear: { ...project.clear, sessionStorage: next } })}
          />
        </div>
        <p className="text-[11px] leading-relaxed text-inkfaint">
          On switch: cookies are written for each origin, then the user's storage is injected, then anything inside the
          clear scope that was not just written is pruned.
        </p>
      </div>

      <div className="space-y-3">
        <SectionTitle
          right={
            <Button
              onClick={() =>
                onChange({
                  tags: [
                    ...project.tags,
                    { name: 'new-tag', color: TAG_COLORS[project.tags.length % TAG_COLORS.length] ?? '#82866f' },
                  ],
                })
              }
            >
              <IconPlus size={12} />
              Tag
            </Button>
          }
        >
          Tags
        </SectionTitle>
        <div className="flex flex-wrap gap-2">
          {project.tags.map((tag, index) => (
            <div key={`${tag.name}-${index}`} className="flex items-center gap-1 border border-rule bg-sheet2 px-1.5 py-1">
              <input
                type="color"
                value={tag.color}
                onChange={(event) =>
                  onChange({ tags: project.tags.map((entry, i) => (i === index ? { ...entry, color: event.target.value } : entry)) })
                }
                className="h-4 w-4 cursor-pointer border-none bg-transparent p-0"
              />
              <input
                value={tag.name}
                onChange={(event) =>
                  onChange({ tags: project.tags.map((entry, i) => (i === index ? { ...entry, name: event.target.value } : entry)) })
                }
                className="w-20 bg-transparent text-[12px] text-ink outline-none"
              />
              <IconButton label={`Remove ${tag.name}`} onClick={() => onChange({ tags: project.tags.filter((_, i) => i !== index) })}>
                <IconTrash size={12} />
              </IconButton>
            </div>
          ))}
          {project.tags.length === 0 && <span className="text-[11px] text-inkfaint">No tags yet — tags filter users in the popup.</span>}
        </div>
      </div>
    </div>
  );
}

function AuthPanel({ project, onChange }: { project: Project; onChange: (patch: Partial<Project>) => void }) {
  const [text, setText] = useState(() => JSON.stringify(project.auth ?? {}, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const [presetId, setPresetId] = useState(AUTH_PRESETS[0]?.id ?? '');
  const [testUserId, setTestUserId] = useState(project.users[0]?.id ?? '');
  const [testResult, setTestResult] = useState<AuthTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const serialized = useRef(JSON.stringify(project.auth ?? {}));

  useEffect(() => {
    const next = JSON.stringify(project.auth ?? {});
    if (next !== serialized.current) {
      serialized.current = next;
      setText(JSON.stringify(project.auth ?? {}, null, 2));
      setErrors([]);
    }
  }, [project.auth]);

  useEffect(() => {
    if (!project.users.some((user) => user.id === testUserId)) setTestUserId(project.users[0]?.id ?? '');
  }, [project.users, testUserId]);

  function applyPreset() {
    const preset = AUTH_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    try {
      const parsed = AuthRecipeSchema.parse(preset.recipe);
      serialized.current = JSON.stringify(parsed);
      onChange({ auth: parsed });
      setErrors([]);
    } catch (error) {
      setErrors(errorLines(error));
    }
  }

  function saveRecipe() {
    try {
      const parsed = AuthRecipeSchema.parse(JSON.parse(text));
      serialized.current = JSON.stringify(parsed);
      onChange({ auth: parsed });
      setErrors([]);
    } catch (error) {
      setErrors(errorLines(error));
    }
  }

  async function testLogin() {
    if (!testUserId) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await bg.runAuthTest(project.id, testUserId));
    } catch (error) {
      setTestResult({ ok: false, action: 'none', log: [], error: errorLines(error).join(' · ') });
    } finally {
      setTesting(false);
    }
  }

  const credentialsStored = project.users.some((user) => user.credentials.password);

  return (
    <div className="max-w-3xl space-y-5">
      {credentialsStored && (
        <Banner kind="info">
          <span className="inline-flex items-center gap-1.5">
            <IconWarn size={12} />
            Passwords are stored unencrypted in this browser profile and sent only to the login URL above. Exports blank
            them unless you opt in.
          </span>
        </Banner>
      )}

      <div className="space-y-3">
        <SectionTitle>Start from a preset</SectionTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <Field label="Preset">
              <Select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
                {AUTH_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button onClick={applyPreset}>Apply preset</Button>
          {project.auth && (
            <Button variant="danger" onClick={() => onChange({ auth: undefined })}>
              Remove recipe
            </Button>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-inkfaint">
          {AUTH_PRESETS.find((preset) => preset.id === presetId)?.note}
        </p>
      </div>

      <div className="space-y-2">
        <SectionTitle>Recipe</SectionTitle>
        <Textarea mono rows={16} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
        {errors.length > 0 && <pre className="whitespace-pre-wrap text-[11px] text-stamp">{errors.join('\n')}</pre>}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={saveRecipe}>
            Validate &amp; save
          </Button>
          <span className="text-[10px] text-inkfaint">
            URLs must stay on this project's origins; the extension refuses anything else.
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle>Test login</SectionTitle>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Field label="Run as">
              <Select value={testUserId} onChange={(event) => setTestUserId(event.target.value)} disabled={project.users.length === 0}>
                {project.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                    {user.credentials.username ? ` — ${user.credentials.username}` : ''}
                  </option>
                ))}
                {project.users.length === 0 && <option value="">no users yet</option>}
              </Select>
            </Field>
          </div>
          <Button variant="primary" onClick={() => void testLogin()} disabled={testing || !testUserId || !project.auth}>
            {testing ? 'Running…' : 'Test login'}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-inkfaint">
          Runs the real request chain (cookies the server sets will land in the browser jar) but does not switch the
          browser session. Use it to debug a recipe.
        </p>
        {testResult && (
          <div className="space-y-2">
            <Banner kind={testResult.ok ? 'ok' : 'err'}>
              {testResult.ok ? `OK — ${testResult.action}` : `Failed — ${testResult.error ?? 'see log'}`}
            </Banner>
            <pre className="max-h-52 overflow-auto border border-rule bg-sheet p-2 font-mono text-[10px] leading-relaxed text-inkdim">
              {testResult.log.join('\n')}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function UsersPanel({ project, onChange }: { project: Project; onChange: (patch: Partial<Project>) => void }) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userText, setUserText] = useState('');
  const [userError, setUserError] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('{\n  "name": "New user",\n  "tags": [],\n  "cookies": [],\n  "storage": {}\n}');
  const [addError, setAddError] = useState<string[]>([]);
  const [renewing, setRenewing] = useState<string | null>(null);
  const [renewResult, setRenewResult] = useState<{ id: string; result: AuthTestResult } | null>(null);
  const now = Date.now();

  function updateUser(id: string, patch: Partial<User>) {
    onChange({ users: project.users.map((user) => (user.id === id ? { ...user, ...patch } : user)) });
  }

  async function renew(userId: string) {
    setRenewing(userId);
    setRenewResult(null);
    try {
      const result = await bg.renewSession(project.id, userId);
      setRenewResult({ id: userId, result });
      if (result.ok) {
        const fresh = await bg.getState();
        const freshUser = fresh.projects.find((entry) => entry.id === project.id)?.users.find((entry) => entry.id === userId);
        if (freshUser) updateUser(userId, { session: freshUser.session });
      }
    } catch (error) {
      setRenewResult({ id: userId, result: { ok: false, action: 'none', log: [], error: errorLines(error).join(' · ') } });
    } finally {
      setRenewing(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <Button onClick={() => setAddOpen((open) => !open)}>
            <IconPlus size={12} />
            Add user (JSON)
          </Button>
        }
      >
        Users ({project.users.length})
      </SectionTitle>

      {addOpen && (
        <div className="space-y-2 border border-rule bg-sheet p-3">
          <Textarea mono rows={8} value={addText} onChange={(event) => setAddText(event.target.value)} spellCheck={false} />
          {addError.length > 0 && <pre className="whitespace-pre-wrap text-[11px] text-stamp">{addError.join('\n')}</pre>}
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                try {
                  const parsed = UserSchema.parse({ ...(JSON.parse(addText) as object), id: crypto.randomUUID() });
                  onChange({ users: [...project.users, parsed] });
                  setAddOpen(false);
                  setAddError([]);
                } catch (error) {
                  setAddError(errorLines(error));
                }
              }}
            >
              Add user
            </Button>
            <Button variant="quiet" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="border border-rule">
        {project.users.map((user, index) => {
          const status = userAuthStatus(project, user, now);
          return (
            <div key={user.id} className="border-b border-rule p-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="num font-mono text-[10px] text-inkfaint">{String(index + 1).padStart(2, '0')}</span>
                <Input value={user.name} onChange={(event) => updateUser(user.id, { name: event.target.value })} className="w-44" />
                <Input
                  value={user.tags.join(', ')}
                  onChange={(event) => updateUser(user.id, { tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
                  placeholder="tags"
                  className="w-40"
                />
                {status.label && <span className={cx('num text-[10px]', TONE[status.tone])}>{status.label}</span>}
                <div className="ml-auto flex items-center gap-1">
                  <IconButton
                    label="Edit user JSON"
                    onClick={() => {
                      setEditingUserId(editingUserId === user.id ? null : user.id);
                      setUserText(JSON.stringify(user, null, 2));
                      setUserError([]);
                    }}
                  >
                    <IconDownload size={13} className="rotate-180" />
                  </IconButton>
                  <IconButton
                    label="Renew session"
                    onClick={() => void renew(user.id)}
                    disabled={renewing === user.id || !project.auth}
                  >
                    <IconRefresh size={13} className={cx(renewing === user.id && 'animate-pulse')} />
                  </IconButton>
                  <IconButton label="Clear cached session" onClick={() => updateUser(user.id, { session: { vars: {} } })}>
                    <IconTrash size={13} className="text-inkfaint" />
                  </IconButton>
                </div>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <Input
                  value={user.credentials.username}
                  placeholder="username / email"
                  onChange={(event) => updateUser(user.id, { credentials: { ...user.credentials, username: event.target.value } })}
                />
                <Input
                  type="password"
                  value={user.credentials.password}
                  placeholder="password"
                  onChange={(event) => updateUser(user.id, { credentials: { ...user.credentials, password: event.target.value } })}
                />
              </div>

              <div className="num mt-1.5 font-mono text-[10px] text-inkfaint">
                {user.cookies.length} cookies · {Object.keys(user.storage).length} storage origins · captured{' '}
                {fmtAge(user.capturedAt)} · used {fmtAge(user.lastUsedAt)}
                {user.session.source ? ` · session ${user.session.source}` : ''}
                {user.session.expiresAt ? ` until ${new Date(user.session.expiresAt).toLocaleTimeString()}` : ''}
              </div>

              {renewResult?.id === user.id && (
                <div className="mt-2">
                  <Banner kind={renewResult.result.ok ? 'ok' : 'err'}>
                    {renewResult.result.ok
                      ? `Session renewed (${renewResult.result.action}).`
                      : `Renew failed — ${renewResult.result.error ?? 'see log'}`}
                  </Banner>
                </div>
              )}

              {editingUserId === user.id && (
                <div className="mt-2 space-y-2">
                  <Textarea mono rows={12} value={userText} onChange={(event) => setUserText(event.target.value)} spellCheck={false} />
                  {userError.length > 0 && <pre className="whitespace-pre-wrap text-[11px] text-stamp">{userError.join('\n')}</pre>}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      onClick={() => {
                        try {
                          const parsed = UserSchema.parse(JSON.parse(userText));
                          updateUser(user.id, { ...parsed, id: user.id });
                          setEditingUserId(null);
                          setUserError([]);
                        } catch (error) {
                          setUserError(errorLines(error));
                        }
                      }}
                    >
                      Save user
                    </Button>
                    <Button variant="quiet" onClick={() => setEditingUserId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {project.users.length === 0 && (
          <div className="p-3">
            <EmptyState title="No users on file">Capture a session from the popup, or add one as JSON.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}

function DataPanel({
  project,
  onChange,
  onExport,
  onImportSeed,
  onApplyProject,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
  onExport: () => void;
  onImportSeed: (seed: unknown) => void;
  onApplyProject: (next: Project) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(project, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const serialized = useRef(JSON.stringify(project));

  useEffect(() => {
    const next = JSON.stringify(project);
    if (next !== serialized.current) {
      serialized.current = next;
      setText(JSON.stringify(project, null, 2));
      setErrors([]);
    }
  }, [project]);

  return (
    <div className="space-y-3">
      <SectionTitle
        right={
          <Button onClick={onExport}>
            <IconDownload size={12} />
            Export seed
          </Button>
        }
      >
        Project JSON
      </SectionTitle>
      <p className="text-[11px] leading-relaxed text-inkfaint">
        The whole project — origins, clearing rules, auth recipe, users — as one document. Paste a single project here
        to replace it in place, or paste a full seed file ({'"projects": [ … ]'}) to run it through the import preview.
      </p>
      <Textarea mono rows={20} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
      {errors.length > 0 && <pre className="whitespace-pre-wrap text-[11px] text-stamp">{errors.join('\n')}</pre>}
      <Button
        variant="primary"
        onClick={() => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch (error) {
            setErrors([`Invalid JSON: ${errMsg(error)}`]);
            return;
          }
          if (parsed !== null && typeof parsed === 'object' && 'projects' in parsed) {
            // A whole seed document — same door as Global → Import seed.
            onImportSeed(parsed);
            return;
          }
          try {
            const next = ProjectSchema.parse(parsed);
            serialized.current = JSON.stringify(next);
            // Direct: applies to the panel and persists immediately — no
            // preview, no Save-changes step (those belong to the file door).
            onApplyProject(next);
            setErrors([]);
          } catch (error) {
            const lines = errorLines(error);
            if (lines.some((line) => line.startsWith('name:') || line.startsWith('origins:'))) {
              lines.unshift(
                'This editor expects one project object (name, origins, …). A full seed file ({ "projects": [ … ] }) is accepted too — it opens the import preview.',
              );
            }
            setErrors(lines);
          }
        }}
      >
        Apply JSON
      </Button>
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'auth', label: 'Auth' },
  { id: 'users', label: 'Users' },
  { id: 'data', label: 'Data' },
] as const;

function ProjectPanel({
  project,
  active,
  onChange,
  onMakeActive,
  onDelete,
  onExport,
  onImportSeed,
  onApplyProject,
}: {
  project: Project;
  active: boolean;
  onChange: (patch: Partial<Project>) => void;
  onMakeActive: () => void;
  onDelete: () => void;
  onExport: () => void;
  onImportSeed: (seed: unknown) => void;
  onApplyProject: (next: Project) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview');
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="space-y-4">
      <header className="border-b border-rule pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={project.name} onChange={(event) => onChange({ name: event.target.value })} className="max-w-md text-[16px]" />
          <span className="num font-mono text-[10px] text-inkfaint">{project.id}</span>
          {active && <Stamp tone="green">active</Stamp>}
          <div className="ml-auto flex items-center gap-2">
            {!active && <Button onClick={onMakeActive}>Set active</Button>}
            <Button
              variant="danger"
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </Button>
          </div>
        </div>
        <div className="num mt-1 font-mono text-[10px] text-inkdim">{project.origins.join('  ·  ')}</div>
      </header>

      <nav className="flex gap-4 border-b border-rule">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={cx(
              '-mb-px border-b px-1 pb-1.5 text-[11px] tracking-[0.04em]',
              tab === entry.id ? 'border-brass text-ink' : 'border-transparent text-inkdim hover:text-ink',
            )}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <OverviewPanel project={project} onChange={onChange} />}
      {tab === 'auth' && <AuthPanel project={project} onChange={onChange} />}
      {tab === 'users' && <UsersPanel project={project} onChange={onChange} />}
      {tab === 'data' && (
        <DataPanel
          project={project}
          onChange={onChange}
          onExport={onExport}
          onImportSeed={onImportSeed}
          onApplyProject={onApplyProject}
        />
      )}
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; lines: string[] } | null>(null);
  const [importPreview, setImportPreview] = useState<{ name: string; seed: SeedInput; preview: MergeResult } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bg.getState()
      .then((next) => {
        setState(next);
        setSelectedId(next.activeProjectId ?? next.projects[0]?.id ?? null);
      })
      .catch((error) => setStatus({ kind: 'err', lines: errorLines(error) }));
  }, []);

  function patchProject(id: string, patch: Partial<Project>) {
    setDirty(true);
    setState((current) =>
      current ? { ...current, projects: current.projects.map((project) => (project.id === id ? { ...project, ...patch } : project)) } : current,
    );
  }

  async function persist(next: AppState, okLines: string[]) {
    await ensureOriginAccess(next.projects.flatMap((project) => project.origins));
    const saved = await bg.saveState(StateSchema.parse(next));
    setState(saved);
    setDirty(false);
    setStatus({ kind: 'ok', lines: okLines });
    return saved;
  }

  async function saveAll() {
    if (!state) return;
    try {
      await persist(state, ['Saved.']);
    } catch (error) {
      setStatus({ kind: 'err', lines: errorLines(error) });
    }
  }

  function addProject() {
    const name = `Project ${(state?.projects.length ?? 0) + 1}`;
    const project = ProjectSchema.parse({ id: slugId(name), name, origins: ['http://localhost:3000'] });
    setState((current) => (current ? { ...current, projects: [...current.projects, project] } : current));
    setSelectedId(project.id);
    setDirty(true);
  }

  function removeProject(id: string) {
    setState((current) =>
      current
        ? {
            ...current,
            projects: current.projects.filter((project) => project.id !== id),
            activeProjectId: current.activeProjectId === id ? null : current.activeProjectId,
          }
        : current,
    );
    setSelectedId((current) => (current === id ? null : current));
    setDirty(true);
  }

  function exportBackup() {
    if (!state) return;
    const payload = includeSecrets ? state : stripSecrets(state);
    download(`session-switcher-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
  }

  function exportProject(project: Project) {
    const payload = includeSecrets ? project : stripSecrets(StateSchema.parse({ projects: [project] })).projects[0];
    download(`${project.id}.seed.json`, JSON.stringify({ schemaVersion: 1, projects: [payload] }, null, 2));
  }

  /** File-picker import: builds the confirmation preview (confirmation is file-only). */
  function importSeedDocument(parsed: unknown, source: string) {
    if (!state) return;
    try {
      const seed = SeedSchema.parse(parsed);
      const { result } = mergeSeed(state, seed);
      setImportPreview({ name: source, seed, preview: result });
      setStatus(null);
    } catch (error) {
      setStatus({ kind: 'err', lines: errorLines(error) });
    }
  }

  /** Applies a seed immediately with no confirmation (Data tab) and persists it. */
  async function applySeedDirect(parsed: unknown, source: string) {
    if (!state) return;
    try {
      const seed = SeedSchema.parse(parsed);
      const { state: next, result } = mergeSeed(state, seed);
      await persist(next, [
        `Applied seed from ${source} and saved: ${result.projectsAdded} new / ${result.projectsUpdated} updated projects, ${result.usersAdded} new / ${result.usersUpdated} updated users.`,
        ...result.errors,
      ]);
    } catch (error) {
      setStatus({ kind: 'err', lines: errorLines(error) });
    }
  }

  /** Data-tab "Apply JSON": replaces this project in place and persists immediately. */
  async function applyProjectJson(next: Project) {
    if (!state || !selectedId) return;
    try {
      const withStableId: Project = { ...next, id: selectedId };
      const draft = {
        ...state,
        projects: state.projects.map((project) => (project.id === selectedId ? withStableId : project)),
      };
      await persist(draft, ['Project JSON applied and saved.']);
    } catch (error) {
      setStatus({ kind: 'err', lines: errorLines(error) });
    }
  }

  /** File import confirmation: merges AND persists in one step. */
  async function applyImport() {
    if (!importPreview || !state) return;
    try {
      const { state: next, result } = mergeSeed(state, importPreview.seed);
      await persist(next, [
        `Imported ${importPreview.name} and saved: ${result.projectsAdded} new / ${result.projectsUpdated} updated projects, ${result.usersAdded} new / ${result.usersUpdated} updated users.`,
        ...result.errors,
      ]);
      setImportPreview(null);
    } catch (error) {
      setStatus({ kind: 'err', lines: errorLines(error) });
    }
  }

  async function onImportFile(file: File) {
    try {
      importSeedDocument(JSON.parse(await readFileText(file)), file.name);
    } catch (error) {
      setStatus({ kind: 'err', lines: errorLines(error) });
    }
  }

  const project = state?.projects.find((entry) => entry.id === selectedId) ?? null;

  if (!state) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 p-6">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-desk text-ink">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 p-6 lg:flex-row">
        <aside className="w-full shrink-0 space-y-4 lg:w-64">
          <div>
            <div className="text-[9px] uppercase tracking-[0.24em] text-inkfaint">Local Session Switcher</div>
            <div className="mt-1 text-[15px]">Projects</div>
          </div>

          <Button
            variant={dirty ? 'primary' : 'ghost'}
            onClick={() => void saveAll()}
            disabled={!dirty}
            className="w-full"
          >
            {dirty ? 'Save changes' : 'All changes saved'}
          </Button>

          <nav className="border-t border-rule">
            {state.projects.map((entry, index) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedId(entry.id)}
                className={cx(
                  'grid w-full grid-cols-[1.5rem_1fr_auto] items-center gap-2 border-b border-rule px-2 py-2 text-left',
                  entry.id === selectedId ? 'bg-sheet2' : 'hover:bg-sheet2/60',
                )}
              >
                <span className="num font-mono text-[10px] text-inkfaint">{String(index + 1).padStart(2, '0')}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] text-ink">{entry.name}</span>
                  <span className="num block truncate font-mono text-[9px] text-inkfaint">{entry.origins[0]}</span>
                </span>
                {state.activeProjectId === entry.id && <span className="h-1.5 w-1.5 bg-inkgreen" />}
              </button>
            ))}
          </nav>

          <Button onClick={addProject} className="w-full">
            <IconPlus size={12} />
            New project
          </Button>

          <div className="space-y-2 border-t border-rule pt-3">
            <div className="text-[9px] uppercase tracking-[0.2em] text-inkfaint">Global</div>
            <Button onClick={() => fileRef.current?.click()} className="w-full">
              <IconUpload size={12} />
              Import seed
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onImportFile(file);
                event.target.value = '';
              }}
            />
            <Button onClick={exportBackup} className="w-full">
              <IconDownload size={12} />
              Export backup
            </Button>
            <label className="flex items-center gap-2 text-[10px] text-inkfaint">
              <input
                type="checkbox"
                checked={includeSecrets}
                onChange={(event) => setIncludeSecrets(event.target.checked)}
                className="h-3 w-3 accent-[#c0413a]"
              />
              include passwords &amp; tokens in exports
            </label>
          </div>

          <div className="border-t border-rule pt-3 text-[10px] leading-relaxed text-inkfaint">
            Credentials live unencrypted in this browser profile and are sent only to the project's own origins.
          </div>
        </aside>

        <main className="w-full min-w-0 flex-1 space-y-4">
          {status && (
            <Banner kind={status.kind === 'ok' ? 'ok' : 'err'}>
              {status.lines.map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </Banner>
          )}

          {importPreview && (
            <div className="space-y-2 border border-inkblue/40 bg-sheet p-3">
              <div className="text-[11px] text-inkblue">Import preview — {importPreview.name}</div>
              <div className="text-[11px] text-inkdim">
                {importPreview.preview.projectsAdded} new projects, {importPreview.preview.projectsUpdated} updated,{' '}
                {importPreview.preview.usersAdded} new users, {importPreview.preview.usersUpdated} users overwritten.
                {importPreview.preview.errors.length > 0 && (
                  <span className="text-stamp"> {importPreview.preview.errors.join('; ')}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => void applyImport()}>
                  Apply import
                </Button>
                <Button variant="quiet" onClick={() => setImportPreview(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {project ? (
            <ProjectPanel
              project={project}
              active={state.activeProjectId === project.id}
              onChange={(patch) => patchProject(project.id, patch)}
              onMakeActive={() => {
                setState({ ...state, activeProjectId: project.id });
                setDirty(true);
              }}
              onDelete={() => removeProject(project.id)}
              onExport={() => exportProject(project)}
              onImportSeed={(seed) => void applySeedDirect(seed, 'project JSON editor')}
              onApplyProject={(next) => void applyProjectJson(next)}
            />
          ) : (
            <div className="flex min-h-48 items-center justify-center px-6 text-center text-[13px] text-inkfaint">
              {state.projects.length === 0
                ? 'No projects yet — create one to get started.'
                : 'No project selected — pick one from the rail.'}
            </div>
          )}

          {project && (
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3 text-[10px] text-inkfaint">
              <span>Seed and backup files contain session data — keep them out of git.</span>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirmWipe) {
                    setState(StateSchema.parse({}));
                    setDirty(true);
                    setConfirmWipe(false);
                    setSelectedId(null);
                  } else {
                    setConfirmWipe(true);
                  }
                }}
                onBlur={() => setConfirmWipe(false)}
              >
                {confirmWipe ? 'Click again to wipe everything' : 'Wipe all data'}
              </Button>
            </footer>
          )}
        </main>
      </div>
    </div>
  );
}
