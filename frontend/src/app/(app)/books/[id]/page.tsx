'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/query-state';
import { ProgressBar, StatusBadge } from '@/components/status-badge';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fieldErrorsFrom } from '@/lib/form';
import type { Book, ShelfSummary } from '@/lib/types';

export default function BookDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { ready, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['book', id],
    enabled: ready && Boolean(user) && Boolean(id),
    queryFn: () => api<Book>(`/books/${id}`),
  });
  const shelvesQuery = useQuery({
    queryKey: ['shelves-for-book'],
    enabled: ready && Boolean(user),
    queryFn: async () => {
      const mine = await api<{ items: ShelfSummary[] }>('/shelves');
      const shared = await api<{ items: ShelfSummary[] }>('/shelves/shared-with-me');
      return [
        ...mine.items,
        ...shared.items.filter((shelf) => shelf.myRole === 'EDITOR'),
      ];
    },
  });

  const book = query.data;
  const isOwner = book?.access === 'OWNER';

  async function run(label: string, work: () => Promise<void>) {
    setError('');
    setFieldErrors({});
    setPending(label);
    try {
      await work();
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed');
      setFieldErrors(
        fieldErrorsFrom(err, [
          'title',
          'author',
          'status',
          'totalPages',
          'rating',
          'notes',
          'currentPage',
          'email',
        ]),
      );
    } finally {
      setPending(null);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ratingRaw = String(form.get('rating') ?? '');
    const pagesRaw = String(form.get('totalPages') ?? '');
    await run('save', async () => {
      await api(`/books/${id}`, {
        method: 'PATCH',
        json: {
          title: String(form.get('title') ?? ''),
          author: String(form.get('author') ?? ''),
          status: String(form.get('status') ?? ''),
          notes: String(form.get('notes') ?? '') || null,
          rating: ratingRaw ? Number(ratingRaw) : null,
          totalPages: pagesRaw ? Number(pagesRaw) : null,
        },
      });
    });
  }

  async function onProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run('progress', async () => {
      await api(`/books/${id}/progress`, {
        method: 'PATCH',
        json: { currentPage: Number(form.get('currentPage')) },
      });
    });
  }

  async function onLend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run('lend', async () => {
      await api(`/books/${id}/lend`, {
        method: 'POST',
        json: { email: String(form.get('email') ?? '') },
      });
    });
  }

  async function onAddToShelf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const shelfId = String(form.get('shelfId') ?? '');
    await run('shelf', async () => {
      await api(`/shelves/${shelfId}/books`, {
        method: 'POST',
        json: { bookId: id },
      });
    });
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
  if (!book) {
    return <EmptyState title="Book not found" body="It may have been deleted." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">{book.title}</h1>
          <p className="text-[var(--ink-muted)]">{book.author}</p>
        </div>
        <StatusBadge status={book.status} />
      </div>
      {book.owner ? (
        <p className="text-sm text-[var(--ink-muted)]">Owned by {book.owner.name}</p>
      ) : null}
      {book.lentTo ? (
        <p className="rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
          Lent to {book.lentTo.name} ({book.lentTo.email})
        </p>
      ) : null}
      <ProgressBar value={book.progressPercentage} />
      {error ? <p className="error-text">{error}</p> : null}

      {isOwner ? (
        <>
          <form onSubmit={onSave} className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input id="title" name="title" className="field" defaultValue={book.title} />
              {fieldErrors.title ? <p className="error-text">{fieldErrors.title}</p> : null}
            </div>
            <div>
              <label className="label" htmlFor="author">Author</label>
              <input id="author" name="author" className="field" defaultValue={book.author} />
              {fieldErrors.author ? <p className="error-text">{fieldErrors.author}</p> : null}
            </div>
            <div>
              <label className="label" htmlFor="status">Status</label>
              <select id="status" name="status" className="field" defaultValue={book.status}>
                <option value="WANT_TO_READ">Want to read</option>
                <option value="READING">Reading</option>
                <option value="FINISHED">Finished</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="totalPages">Total pages</label>
              <input
                id="totalPages"
                name="totalPages"
                className="field"
                type="number"
                min={1}
                defaultValue={book.totalPages ?? ''}
              />
              {fieldErrors.totalPages ? <p className="error-text">{fieldErrors.totalPages}</p> : null}
            </div>
            <div>
              <label className="label" htmlFor="rating">Rating</label>
              <input
                id="rating"
                name="rating"
                className="field"
                type="number"
                min={1}
                max={5}
                defaultValue={book.rating ?? ''}
              />
              {fieldErrors.rating ? <p className="error-text">{fieldErrors.rating}</p> : null}
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="notes">Notes</label>
              <textarea id="notes" name="notes" className="field min-h-24" defaultValue={book.notes ?? ''} />
            </div>
            <button className="btn md:col-span-2" disabled={pending !== null}>
              {pending === 'save' ? 'Saving...' : 'Save changes'}
            </button>
          </form>

          <form onSubmit={onProgress} className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">Log progress</h2>
            <label className="label" htmlFor="currentPage">Current page</label>
            <input
              id="currentPage"
              name="currentPage"
              className="field max-w-[12rem]"
              type="number"
              min={0}
              defaultValue={book.currentPage}
            />
            {fieldErrors.currentPage ? <p className="error-text">{fieldErrors.currentPage}</p> : null}
            <button className="btn mt-3" disabled={pending !== null}>
              {pending === 'progress' ? 'Updating...' : 'Update progress'}
            </button>
          </form>

          {book.lentTo ? (
            <button
              type="button"
              className="btn"
              disabled={pending !== null}
              onClick={() =>
                void run('return', async () => {
                  await api(`/books/${id}/return`, { method: 'POST' });
                })
              }
            >
              {pending === 'return' ? 'Returning...' : 'Mark returned'}
            </button>
          ) : (
            <form onSubmit={onLend} className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 font-semibold">Lend this book</h2>
              <label className="label" htmlFor="email">Borrower email</label>
              <input id="email" name="email" type="email" className="field max-w-sm" required />
              {fieldErrors.email ? <p className="error-text">{fieldErrors.email}</p> : null}
              <button className="btn mt-3" disabled={pending !== null}>
                {pending === 'lend' ? 'Lending...' : 'Lend book'}
              </button>
            </form>
          )}

          <form onSubmit={onAddToShelf} className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold">Add to a shelf</h2>
            <select name="shelfId" className="field max-w-sm" required>
              <option value="">Choose a shelf</option>
              {(shelvesQuery.data ?? []).map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {shelf.name}
                </option>
              ))}
            </select>
            <button className="btn mt-3" disabled={pending !== null}>
              {pending === 'shelf' ? 'Adding...' : 'Add to shelf'}
            </button>
          </form>

          <button
            type="button"
            className="btn-danger"
            disabled={pending !== null}
            onClick={() =>
              void run('delete', async () => {
                await api(`/books/${id}`, { method: 'DELETE' });
                router.push('/books');
              })
            }
          >
            {pending === 'delete' ? 'Deleting...' : 'Delete book'}
          </button>
        </>
      ) : (
        <p className="rounded-xl bg-white px-4 py-3 text-sm text-[var(--ink-muted)]">
          This copy is read-only for you.
        </p>
      )}
    </div>
  );
}
