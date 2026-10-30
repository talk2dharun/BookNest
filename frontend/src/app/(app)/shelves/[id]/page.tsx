'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/query-state';
import { StatusBadge } from '@/components/status-badge';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fieldErrorsFrom } from '@/lib/form';
import type { BookList, ShelfDetail } from '@/lib/types';

export default function ShelfDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { ready, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['shelf', id],
    enabled: ready && Boolean(user) && Boolean(id),
    queryFn: () => api<ShelfDetail>(`/shelves/${id}`),
  });
  const myBooks = useQuery({
    queryKey: ['my-books-for-shelf'],
    enabled: ready && Boolean(user),
    queryFn: () => api<BookList>('/books?limit=50'),
  });

  const shelf = query.data;
  const isOwner = shelf?.myRole === 'OWNER';
  const canEdit = shelf?.myRole === 'OWNER' || shelf?.myRole === 'EDITOR';

  async function run(label: string, work: () => Promise<void>) {
    setError('');
    setFieldErrors({});
    setPending(label);
    try {
      await work();
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed');
      setFieldErrors(fieldErrorsFrom(err, ['email', 'role', 'name', 'bookId']));
    } finally {
      setPending(null);
    }
  }

  if (query.isLoading) {
    return <Skeleton className="h-64" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Failed'}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!shelf) {
    return <EmptyState title="Shelf not found" body="You may no longer have access." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">{shelf.name}</h1>
          <p className="text-sm text-[var(--ink-muted)]">
            Owned by {shelf.owner.name} · your role: {shelf.myRole}
          </p>
        </div>
        {isOwner ? (
          <button
            type="button"
            className="btn-danger"
            disabled={pending !== null}
            onClick={() =>
              void run('delete', async () => {
                await api(`/shelves/${id}`, { method: 'DELETE' });
                router.push('/shelves');
              })
            }
          >
            {pending === 'delete' ? 'Deleting...' : 'Delete shelf'}
          </button>
        ) : null}
      </div>
      {error ? <p className="error-text">{error}</p> : null}

      {isOwner ? (
        <form
          className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get('name') ?? '');
            void run('rename', async () => {
              await api(`/shelves/${id}`, { method: 'PATCH', json: { name } });
            });
          }}
        >
          <input name="name" className="field max-w-xs" defaultValue={shelf.name} />
          <button className="btn-secondary" disabled={pending !== null}>
            {pending === 'rename' ? 'Saving...' : 'Rename'}
          </button>
        </form>
      ) : null}

      {canEdit ? (
        <form
          className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const bookId = String(new FormData(event.currentTarget).get('bookId') ?? '');
            void run('add', async () => {
              await api(`/shelves/${id}/books`, { method: 'POST', json: { bookId } });
            });
          }}
        >
          <select name="bookId" className="field max-w-sm" required>
            <option value="">Add one of your books</option>
            {(myBooks.data?.items ?? []).map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
          <button className="btn" disabled={pending !== null}>
            {pending === 'add' ? 'Adding...' : 'Add book'}
          </button>
        </form>
      ) : null}

      {shelf.books.length === 0 ? (
        <EmptyState title="No books on this shelf" body="An editor or the owner can add books." />
      ) : (
        <ul className="space-y-3">
          {shelf.books.map((book) => (
            <li key={book.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
              <Link href={`/books/${book.id}`}>
                <p className="font-semibold">{book.title}</p>
                <p className="text-sm text-[var(--ink-muted)]">
                  {book.author} · {book.owner.name}
                </p>
              </Link>
              <div className="flex items-center gap-3">
                <StatusBadge status={book.status} />
                {canEdit ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={pending !== null}
                    onClick={() =>
                      void run('remove-book', async () => {
                        await api(`/shelves/${id}/books/${book.id}`, { method: 'DELETE' });
                      })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Collaborators</h2>
          <form
            className="flex flex-wrap gap-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run('share', async () => {
                await api(`/shelves/${id}/shares`, {
                  method: 'POST',
                  json: {
                    email: String(form.get('email') ?? ''),
                    role: String(form.get('role') ?? 'VIEWER'),
                  },
                });
              });
            }}
          >
            <input name="email" type="email" className="field max-w-xs" placeholder="user@example.com" required />
            <select name="role" className="field max-w-[8rem]">
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button className="btn" disabled={pending !== null}>
              {pending === 'share' ? 'Sharing...' : 'Share'}
            </button>
          </form>
          {fieldErrors.email ? <p className="error-text">{fieldErrors.email}</p> : null}
          {shelf.collaborators.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">No collaborators yet.</p>
          ) : (
            <ul className="space-y-2">
              {shelf.collaborators.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {person.name} ({person.email}) — {person.role}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={pending !== null}
                      onClick={() =>
                        void run('role', async () => {
                          await api(`/shelves/${id}/shares/${person.id}`, {
                            method: 'PATCH',
                            json: { role: person.role === 'EDITOR' ? 'VIEWER' : 'EDITOR' },
                          });
                        })
                      }
                    >
                      Make {person.role === 'EDITOR' ? 'viewer' : 'editor'}
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      disabled={pending !== null}
                      onClick={() =>
                        void run('remove', async () => {
                          await api(`/shelves/${id}/shares/${person.id}`, { method: 'DELETE' });
                        })
                      }
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-sm text-[var(--ink-muted)]">
          {shelf.collaborators.length} collaborator(s) on this shelf
        </p>
      )}
    </div>
  );
}
