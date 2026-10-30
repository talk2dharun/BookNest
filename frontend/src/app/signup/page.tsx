'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    setPending(true);
    try {
      await signup(name, email, password);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const next: Record<string, string> = {};
        for (const field of ['name', 'email', 'password']) {
          const message = err.fieldMessage(field);
          if (message) {
            next[field] = message;
          }
        }
        setFieldErrors(next);
      } else {
        setError('Could not create the account');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="font-serif text-3xl">Create an account</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          {fieldErrors.name ? <p className="error-text">{fieldErrors.name}</p> : null}
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {fieldErrors.email ? <p className="error-text">{fieldErrors.email}</p> : null}
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {fieldErrors.password ? <p className="error-text">{fieldErrors.password}</p> : null}
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            At least 8 characters, with one uppercase letter, one lowercase letter, and one number.
          </p>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="btn w-full" disabled={pending}>
          {pending ? 'Creating...' : 'Sign up'}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--ink-muted)]">
        Already have an account? <Link href="/login" className="font-semibold text-[var(--ink)]">Log in</Link>
      </p>
    </div>
  );
}
