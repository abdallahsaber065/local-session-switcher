import { useState } from 'react';
import { errorLines } from '../lib/schema';
import { cx } from '../lib/util';
import { Button, Chip, Field, Input } from './ui';

export function CaptureForm({
  tagOptions,
  colorOf,
  onSave,
  onCancel,
}: {
  tagOptions: string[];
  colorOf: (tag: string) => string;
  onSave: (name: string, tags: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setSelected((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]));
  }

  async function submit() {
    if (!name.trim()) {
      setError('Give this user a name first.');
      return;
    }
    const tags = [...selected, ...extra.split(',').map((tag) => tag.trim()).filter(Boolean)];
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim(), [...new Set(tags)]);
    } catch (err) {
      setError(errorLines(err).join(' · '));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5 border border-rule bg-sheet p-2.5">
      <Field label="Name on the line">
        <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Admin" />
      </Field>
      {tagOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tagOptions.map((tag) => (
            <Chip key={tag} name={tag} color={colorOf(tag)} active={selected.includes(tag)} onClick={() => toggleTag(tag)} />
          ))}
        </div>
      )}
      <Field label="New tags" hint="comma separated">
        <Input value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="employee, staging" />
      </Field>
      {error && <div className={cx('text-[11px] text-stamp')}>{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Stamping…' : 'Stamp in'}
        </Button>
      </div>
    </div>
  );
}
