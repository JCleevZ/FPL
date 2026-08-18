'use client';

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

  if (HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="sticky top-0 z-10 border-b border-divider bg-base">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-8 px-6 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 bg-accent" />
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-fg-muted">FPL</span>
        </Link>

        <div className="flex items-center gap-6">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`border-b-2 px-1 py-1 text-sm transition-colors ${
                  active
                    ? 'border-accent text-fg'
                    : 'border-transparent text-fg-muted hover:text-fg'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {username && (
          <span className="ml-auto font-mono text-xs text-fg-dim">{username}</span>
        )}
      </div>
    </nav>
  );
}
