'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/query-state';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ShelfSummary } from '@/lib/types';

export default function ShelvesPage() {
  const { ready, user } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const query = useQuery({
    queryKey: ['shelves'],
    enabled: ready && Boolean(user),
    queryFn: () => api<{ items: ShelfSummary[] }>('/shelves'),
  });

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '');
    setError('');
    setPending(true);
    try {
      await api('/shelves', { method: 'POST', json: { name } });
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ['shelves'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create shelf');
    } finally {
      setPending(false);
    }
  }

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
      <h1 className="font-serif text-3xl">Shelves</h1>
      <form onSubmit={onCreate} className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <input name="name" className="field max-w-xs" placeholder="New shelf name" required />
        <button className="btn" disabled={pending}>
          {pending ? 'Creating...' : 'Create shelf'}
        </button>
        {error ? <p className="error-text w-full">{error}</p> : null}
      </form>
      {!query.data || query.data.items.length === 0 ? (
        <EmptyState title="No shelves yet" body="Create a shelf to group books." />
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
                  {shelf.bookCount} books · {shelf.collaboratorCount ?? 0} collaborators
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
