'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/my-team', label: 'My Team' },
  { href: '/squad-builder', label: 'Squad Builder' },
  { href: '/players', label: 'Players' },
  { href: '/fixtures', label: 'Fixtures' },
];

/** Auth screens are standalone — no chrome. */
const HIDDEN_ON = ['/login', '/signup'];

export function Nav({ username }: { username?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="sticky top-0 z-20 border-b border-divider bg-base">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:gap-8 sm:px-6 sm:py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="h-1.5 w-1.5 shrink-0 bg-accent" />
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-fg-muted">FPL</span>
        </Link>

        {/* Full link row — desktop and up. Below `sm` this collapses into the menu button. */}
        <div className="hidden items-center gap-6 sm:flex">
          {LINKS.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`border-b-2 px-1 py-1 text-sm transition-colors ${
                  active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {username && (
          <span className="ml-auto hidden font-mono text-xs text-fg-dim sm:inline">{username}</span>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-md
                     text-lg text-fg-muted transition-colors hover:text-fg sm:hidden"
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu — a plain flow panel under the bar, not an overlay, so it never
          fights the page content for stacking or blocks a scroll gesture below it. */}
      {open && (
        <div className="border-t border-divider px-2 py-2 sm:hidden">
          <div className="flex flex-col gap-0.5">
            {LINKS.map((link) => {
              const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-md px-3 py-3 text-sm transition-colors ${
                    active ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {username && (
              <div className="mt-1 border-t border-divider px-3 pt-2.5 font-mono text-xs text-fg-dim">
                {username}
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
