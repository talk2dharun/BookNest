'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState, ErrorState, Skeleton } from '@/components/query-state';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Dashboard } from '@/lib/types';

const ACTIVITY_LABELS: Record<string, string> = {
  BOOK_ADDED: 'Book added',
  STATUS_CHANGED: 'Status changed',
  BOOK_LENT: 'Book lent',
  BOOK_RETURNED: 'Book returned',
  SHELF_SHARED: 'Shelf shared',
  ROLE_CHANGED: 'Role changed',
  COLLABORATOR_REMOVED: 'Collaborator removed',
};

export default function DashboardPage() {
  const { ready, user } = useAuth();
  const query = useQuery({
    queryKey: ['dashboard'],
    enabled: ready && Boolean(user),
    queryFn: () => api<Dashboard>('/dashboard'),
  });

  if (query.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Failed to load'}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const data = query.data;
  if (!data) {
    return null;
  }

  const cards = [
    { label: 'Want to read', value: data.countsByStatus.WANT_TO_READ },
    { label: 'Reading', value: data.countsByStatus.READING },
    { label: 'Finished', value: data.countsByStatus.FINISHED },
    { label: 'Finished this year', value: data.finishedThisYear },
    {
      label: 'Average rating',
      value: data.averageRating == null ? '—' : data.averageRating.toFixed(1),
    },
    {
      label: 'Shelf with most books',
      value: data.topShelf
        ? `${data.topShelf.name} (${data.topShelf.bookCount} books)`
        : '—',
      href: data.topShelf ? `/shelves/${data.topShelf.id}` : undefined,
    },
    { label: 'Lent out', value: data.lentOutCount },
    { label: 'Shared with me', value: data.sharedWithMeCount },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl">Dashboard</h1>
        <p className="text-[var(--ink-muted)]">Your reading at a glance</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const inner = (
            <div
              className={`h-full rounded-2xl bg-white p-4 shadow-sm ${
                card.href ? 'transition hover:shadow-md' : ''
              }`}
            >
              <p className="text-sm text-[var(--ink-muted)]">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold">{card.value}</p>
            </div>
          );
          return card.href ? (
            <Link key={card.label} href={card.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={card.label}>{inner}</div>
          );
        })}
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        {data.recentActivity.length === 0 ? (
          <EmptyState title="No activity yet" body="Add a book or share a shelf to see your feed." />
        ) : (
          <ul className="space-y-2">
            {data.recentActivity.map((item) => (
              <li key={item.id} className="rounded-xl bg-white px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p>{item.message}</p>
                  <span className="shrink-0 rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-medium text-[var(--ink-muted)]">
                    {ACTIVITY_LABELS[item.type] ?? item.type}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  {item.actor.name} · {new Date(item.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
