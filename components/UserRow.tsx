import type { User } from '../lib/schema';
import type { UserAuthStatus } from '../lib/auth/lifecycle';
import { cx, fmtAge } from '../lib/util';
import { IconRefresh } from './icons';
import { IconButton, Stamp } from './ui';

const TONE_CLASS = {
  ok: 'text-inkgreen',
  warn: 'text-inkamber',
  bad: 'text-stamp',
  info: 'text-inkblue',
  none: 'text-inkfaint',
} as const;

export function TagMarks({ tags, colorOf }: { tags: string[]; colorOf: (tag: string) => string }) {
  return (
    <>
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1 text-[10px] text-inkdim">
          <span className="h-1.5 w-1.5 shrink-0" style={{ background: colorOf(tag) }} />
          {tag}
        </span>
      ))}
    </>
  );
}

export function UserLine({
  user,
  lineNo,
  colorOf,
  detected,
  busy,
  status,
  onSwitch,
  onRefresh,
}: {
  user: User;
  lineNo: number;
  colorOf: (tag: string) => string;
  detected: boolean;
  busy: boolean;
  status: UserAuthStatus;
  onSwitch: () => void;
  onRefresh: () => void;
}) {
  return (
    <div
      className={cx(
        'group grid grid-cols-[1.9rem_1fr_auto] items-center gap-2 border-b border-rule px-3 py-2 transition-colors',
        detected ? 'bg-sheet2' : 'hover:bg-sheet2/60',
        busy && 'opacity-60',
      )}
    >
      <span className="num font-mono text-[10px] text-inkfaint">{String(lineNo).padStart(2, '0')}</span>

      <button type="button" onClick={onSwitch} disabled={busy} className="min-w-0 text-left disabled:pointer-events-none">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] text-ink">{user.name}</span>
          {detected && <Stamp tone="green">active</Stamp>}
          {status.label && <span className={cx('num shrink-0 text-[10px]', TONE_CLASS[status.tone])}>{status.label}</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-inkfaint">
          <TagMarks tags={user.tags} colorOf={colorOf} />
          <span className="num">{user.cookies.length} cookies</span>
          <span className="num">used {fmtAge(user.lastUsedAt)}</span>
        </span>
      </button>

      <span className="flex items-center">
        {busy ? (
          <span className="mr-1.5 block h-3 w-3 animate-pulse bg-stamp" />
        ) : (
          <IconButton
            label={`Refresh ${user.name}'s session`}
            onClick={onRefresh}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <IconRefresh size={13} />
          </IconButton>
        )}
      </span>
    </div>
  );
}
