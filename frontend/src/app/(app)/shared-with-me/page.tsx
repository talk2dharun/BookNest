'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState, ErrorState, Skeleton } from '@/components/query-state';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ShelfSummary } from '@/lib/types';

export default function SharedWithMePage() {
  const { ready, user } = useAuth();
  const query = useQuery({
    queryKey: ['shared-with-me'],
    enabled: ready && Boolean(user),
    queryFn: () => api<{ items: ShelfSummary[] }>('/shelves/shared-with-me'),
  });

  if (query.isLoading) {
    return <Skeleton className="h-40" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Failed'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">Shared with me</h1>
      {!query.data || query.data.items.length === 0 ? (
        <EmptyState title="Nothing shared yet" body="When someone shares a shelf, it will show up here." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {query.data.items.map((shelf) => (
            <li key={shelf.id}>
              <Link
                href={`/shelves/${shelf.id}`}
                className="block rounded-2xl bg-white p-4 shadow-sm hover:bg-[var(--muted)]"
              >
                <p className="font-semibold">{shelf.name}</p>
                <p className="text-sm text-[var(--ink-muted)]">
                  {shelf.owner?.name} · {shelf.myRole} · {shelf.bookCount} books
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
