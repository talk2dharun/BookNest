'use client';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[var(--muted)] ${className}`}
    />
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-sm">{message}</p>
      <button type="button" className="btn-secondary mt-4" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center">
      <p className="font-medium text-[var(--ink)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">{body}</p>
    </div>
  );
}
