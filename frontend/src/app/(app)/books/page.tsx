'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/query-state';
import { ProgressBar, StatusBadge } from '@/components/status-badge';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fieldErrorsFrom } from '@/lib/form';
import type { Book, BookList, BookStatus } from '@/lib/types';

function buildQuery(params: {
  search: string;
  status: string;
  sort: string;
  order: string;
  page: string;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);
  if (params.page && params.page !== '1') query.set('page', params.page);
  return query;
}

function BooksPageInner() {
  const { ready, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const sort = searchParams.get('sort') ?? 'createdAt';
  const order = searchParams.get('order') ?? 'desc';
  const page = searchParams.get('page') ?? '1';

  const [searchInput, setSearchInput] = useState(search);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed === search) {
        return;
      }
      const next = buildQuery({
        search: trimmed,
        status,
        sort,
        order,
        page: '1',
      });
      router.replace(`/books?${next.toString()}`);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput, search, status, sort, order, router]);

  const listQuery = new URLSearchParams();
  if (search) listQuery.set('search', search);
  if (status) listQuery.set('status', status);
  listQuery.set('sort', sort);
  listQuery.set('order', order);
  listQuery.set('page', page);
  listQuery.set('limit', '5');

  const query = useQuery({
    queryKey: ['books', listQuery.toString()],
    enabled: ready && Boolean(user),
    queryFn: () => api<BookList>(`/books?${listQuery.toString()}`),
  });

  function replaceParams(patch: Record<string, string>) {
    const next = buildQuery({
      search,
      status,
      sort,
      order,
      page,
      ...patch,
    });
    router.replace(`/books?${next.toString()}`);
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFormError('');
    setFieldErrors({});

    // Frontend validation
    const next: Record<string, string> = {};
    if (!String(form.get('title') ?? '').trim()) next.title = 'Title is required';
    if (!String(form.get('author') ?? '').trim()) next.author = 'Author is required';
    const ratingRaw = String(form.get('rating') ?? '').trim();
    if (ratingRaw) {
      const r = Number(ratingRaw);
      if (!Number.isInteger(r) || r < 1 || r > 5) next.rating = 'Rating must be a whole number between 1 and 5';
    }
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    setPending(true);
    try {
      const created = await api<Book>('/books', {
        method: 'POST',
        json: {
          title: String(form.get('title') ?? ''),
          author: String(form.get('author') ?? ''),
          status: String(form.get('status') ?? 'WANT_TO_READ'),
          totalPages: form.get('totalPages') ? Number(form.get('totalPages')) : undefined,
          rating: ratingRaw ? Number(ratingRaw) : undefined,
          notes: String(form.get('notes') ?? '').trim() || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['books'] });
      setCreating(false);
      router.push(`/books/${created.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not add book');
      setFieldErrors(
        fieldErrorsFrom(err, ['title', 'author', 'status', 'totalPages', 'rating', 'notes']),
      );
    } finally {
      setPending(false);
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Failed'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Books</h1>
          <p className="text-[var(--ink-muted)]">Filter, search, and sort your library</p>
        </div>
        <button type="button" className="btn" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : 'Add book'}
        </button>
      </div>

      {creating ? (
        <form onSubmit={onCreate} noValidate className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm md:grid-cols-2">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" className="field" />
            {fieldErrors.title ? <p className="error-text">{fieldErrors.title}</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="author">Author</label>
            <input id="author" name="author" className="field" />
            {fieldErrors.author ? <p className="error-text">{fieldErrors.author}</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" className="field" defaultValue="WANT_TO_READ">
              <option value="WANT_TO_READ">Want to read</option>
              <option value="READING">Reading</option>
              <option value="FINISHED">Finished</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="totalPages">Total pages</label>
            <input id="totalPages" name="totalPages" className="field" type="number" min={1} />
            {fieldErrors.totalPages ? <p className="error-text">{fieldErrors.totalPages}</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="rating">Rating (1–5, optional)</label>
            <input id="rating" name="rating" className="field" type="number" min={1} max={5} />
            {fieldErrors.rating ? <p className="error-text">{fieldErrors.rating}</p> : null}
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" name="notes" className="field min-h-20" />
            {fieldErrors.notes ? <p className="error-text">{fieldErrors.notes}</p> : null}
          </div>
          {formError ? <p className="error-text md:col-span-2">{formError}</p> : null}
          <button className="btn md:col-span-2" disabled={pending}>
            {pending ? 'Saving...' : 'Save book'}
          </button>
        </form>
      ) : null}

      <div className="flex flex-wrap gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <input
          className="field max-w-xs"
          placeholder="Search title or author"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          className="field max-w-[12rem]"
          value={status}
          onChange={(e) => replaceParams({ status: e.target.value, page: '1' })}
        >
          <option value="">All statuses</option>
          <option value="WANT_TO_READ">Want to read</option>
          <option value="READING">Reading</option>
          <option value="FINISHED">Finished</option>
        </select>
        <select
          className="field max-w-[12rem]"
          value={sort}
          onChange={(e) => replaceParams({ sort: e.target.value, page: '1' })}
        >
          <option value="title">Title</option>
          <option value="rating">Rating</option>
          <option value="createdAt">Date added</option>
        </select>
        <select
          className="field max-w-[10rem]"
          value={order}
          onChange={(e) => replaceParams({ order: e.target.value, page: '1' })}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      {!data || data.items.length === 0 ? (
        <EmptyState title="No books yet" body="Add a book or change the filters." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((book) => (
            <li key={book.id}>
              <Link
                href={`/books/${book.id}`}
                className="block rounded-2xl bg-white p-4 shadow-sm hover:bg-[var(--muted)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{book.title}</p>
                    <p className="text-sm text-[var(--ink-muted)]">{book.author}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {book.rating != null ? (
                      <span className="text-sm text-amber-500" aria-label={`${book.rating} out of 5 stars`}>
                        {'★'.repeat(book.rating)}{'☆'.repeat(5 - book.rating)}
                      </span>
                    ) : null}
                    <StatusBadge status={book.status as BookStatus} />
                  </div>
                </div>
                <div className="mt-3">
                  <ProgressBar value={book.progressPercentage} />
                </div>
                {book.lentTo ? (
                  <p className="mt-2 text-sm text-[var(--ink-muted)]">
                    Lent to {book.lentTo.name}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="btn-secondary"
            disabled={Number(page) <= 1}
            onClick={() => replaceParams({ page: String(Number(page) - 1) })}
          >
            Previous
          </button>
          <p className="text-sm text-[var(--ink-muted)]">
            Page {data.page} of {data.totalPages}
          </p>
          <button
            type="button"
            className="btn-secondary"
            disabled={Number(page) >= data.totalPages}
            onClick={() => replaceParams({ page: String(Number(page) + 1) })}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function BooksPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-24" />
        </div>
      }
    >
      <BooksPageInner />
    </Suspense>
  );
}
