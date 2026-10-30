'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState, ErrorState, Skeleton } from '@/components/query-state';
import { ProgressBar, StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Book } from '@/lib/types';

type BorrowedItem = Book & { lendingId: string; lentAt: string };

export default function BorrowedPage() {
  const { ready, user } = useAuth();
  const query = useQuery({
    queryKey: ['borrowed'],
    enabled: ready && Boolean(user),
    queryFn: () => api<{ items: BorrowedItem[] }>('/books/borrowed'),
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
      <h1 className="font-serif text-3xl">Borrowed</h1>
      {!query.data || query.data.items.length === 0 ? (
        <EmptyState title="No borrowed books" body="When someone lends you a book, it will appear here." />
      ) : (
        <ul className="space-y-3">
          {query.data.items.map((book) => (
            <li key={book.lendingId}>
              <Link href={`/books/${book.id}`} className="block rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{book.title}</p>
                    <p className="text-sm text-[var(--ink-muted)]">
                      {book.author}
                      {book.owner ? ` · from ${book.owner.name}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={book.status} />
                </div>
                <div className="mt-3">
                  <ProgressBar value={book.progressPercentage} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
