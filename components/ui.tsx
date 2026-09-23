import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cx } from '../lib/util';
import { IconChevron } from './icons';

export function Button({
  variant = 'ghost',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'quiet' }) {
  const styles = {
    primary: 'border border-stamp bg-stamp text-[#fbf7ee] hover:bg-[#cf4a42]',
    ghost: 'border border-rule text-inkdim hover:border-rule2 hover:text-ink',
    danger: 'border border-stampdim text-stamp hover:border-stamp',
    quiet: 'border border-transparent text-inkdim hover:text-ink',
  }[variant];
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium tracking-[0.02em] disabled:pointer-events-none disabled:opacity-40',
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-6 w-6 items-center justify-center border border-transparent text-inkfaint hover:border-rule hover:text-ink disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}

const control =
  'w-full border border-rule bg-sheet2 px-2 py-1.5 text-[12px] text-ink placeholder:text-inkfaint focus:border-brass focus:outline-none disabled:opacity-40';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(control, className)} {...props} />;
}

export function Textarea({
  mono = false,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return <textarea className={cx(control, 'leading-relaxed', mono && 'font-mono text-[11px]', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cx(control, 'appearance-none pr-7', className)} {...props}>
        {children}
      </select>
      <IconChevron size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-inkfaint" />
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-inkfaint">{label}</span>
        {hint && <span className="text-[10px] text-inkfaint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Stamp({
  tone = 'stamp',
  className,
  children,
}: {
  tone?: 'stamp' | 'green' | 'blue' | 'amber' | 'dim';
  className?: string;
  children: ReactNode;
}) {
  const color = {
    stamp: 'text-stamp',
    green: 'text-inkgreen',
    blue: 'text-inkblue',
    amber: 'text-inkamber',
    dim: 'text-inkfaint',
  }[tone];
  return (
    <span
      className={cx(
        'stamp-impression inline-block -rotate-2 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.18em]',
        color,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  name,
  color,
  onClick,
  active = false,
}: {
  name: string;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px]',
        active ? 'border-brass text-ink' : 'border-rule text-inkdim hover:border-rule2 hover:text-ink',
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0" style={{ background: color }} />
      {name}
    </button>
  );
}

export function Banner({ kind = 'info', children }: { kind?: 'ok' | 'err' | 'info'; children: ReactNode }) {
  const tone = {
    ok: 'border-inkgreen/40 text-inkgreen',
    err: 'border-stamp/50 text-stamp',
    info: 'border-inkblue/40 text-inkblue',
  }[kind];
  return <div className={cx('border px-2 py-1.5 text-[11px] leading-relaxed', tone)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse bg-sheet2', className)} />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-rule px-4 py-6 text-center">
      <div className="text-[12px] text-inkdim">{title}</div>
      {children && <div className="mt-1 text-[11px] leading-relaxed text-inkfaint">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-rule pb-1.5">
      <span className="text-[10px] uppercase tracking-[0.2em] text-inkfaint">{children}</span>
      {right}
    </div>
  );
}
