'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    // Inline validation
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = 'Email is required';
    if (!password) next.password = 'Password is required';
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    setPending(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="font-serif text-3xl">BookNest</h1>
      <p className="mt-1 text-[var(--ink-muted)]">Log in to your library</p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            className="field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldErrors.email ? <p className="error-text">{fieldErrors.email}</p> : null}
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {fieldErrors.password ? <p className="error-text">{fieldErrors.password}</p> : null}
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="btn w-full" disabled={pending}>
          {pending ? 'Signing in...' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--ink-muted)]">
        No account? <Link href="/signup" className="font-semibold text-[var(--ink)]">Sign up</Link>
      </p>
    </div>
  );
}
