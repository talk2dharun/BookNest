'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { LiveUpdates } from './live-updates';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/books', label: 'Books' },
  { href: '/shelves', label: 'Shelves' },
  { href: '/shared-with-me', label: 'Shared with me' },
  { href: '/borrowed', label: 'Borrowed' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) {
      router.replace('/login');
    }
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--ink-muted)]">
        Restoring session...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="font-serif text-xl text-[var(--ink)]">
            BookNest
          </Link>
          <nav className="flex flex-wrap gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  pathname === link.href || pathname.startsWith(`${link.href}/`)
                    ? 'bg-[var(--ink)] text-white'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--muted)]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[var(--ink-muted)]">{user.name}</span>
            <button type="button" className="btn-secondary" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <LiveUpdates />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
