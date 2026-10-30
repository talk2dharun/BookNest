import type { BookStatus } from '@/lib/types';

const LABELS: Record<BookStatus, string> = {
  WANT_TO_READ: 'Want to read',
  READING: 'Reading',
  FINISHED: 'Finished',
};

export function StatusBadge({ status }: { status: BookStatus }) {
  const cls =
    status === 'READING'
      ? 'badge-reading'
      : status === 'FINISHED'
        ? 'badge-finished'
        : 'badge-want';
  return <span className={cls}>{LABELS[status]}</span>;
}

export function ProgressBar({ value }: { value: number | null }) {
  if (value == null) {
    return <p className="text-sm text-[var(--ink-muted)]">No page count yet</p>;
  }
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className="h-full rounded-full bg-[var(--reading)]"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">{value}% complete</p>
    </div>
  );
}
