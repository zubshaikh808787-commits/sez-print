'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DeskProviders } from '@/components/desk';
import { api } from '@/lib/client';
import type { Admin } from '@/lib/types';

const NAV = [
  { href: '/overview', label: 'Overview', hint: 'Devices and prints', idx: '01' },
  { href: '/content', label: 'Library', hint: 'Templates and art', idx: '02' },
  { href: '/feedback', label: 'Feedback', hint: 'Reviews and ideas', idx: '03' },
  { href: '/settings', label: 'Settings', hint: 'Who can edit', idx: '04' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<Admin>('/api/auth/me').then(setAdmin).catch(() => {});
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" onClick={() => setOpen(true)}>Menu</button>
        <strong>SEZ Print</strong>
      </header>
      {open ? <button className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={open ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <span className="mark">S</span>
          <span>
            <strong>SEZ Print</strong>
            <small>Desk</small>
          </span>
        </div>
        <nav className="nav" aria-label="Desk">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? 'active' : ''} aria-current={pathname.startsWith(item.href) ? 'page' : undefined}>
              <span className="idx">{item.idx}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          {admin ? (
            <div className="who">
              <span className="avatar">{admin.name.slice(0, 1)}</span>
              <span>
                <strong>{admin.name}</strong>
                <small>{admin.role}</small>
              </span>
              <button type="button" className="btn small" onClick={signOut}>Sign out</button>
            </div>
          ) : null}
        </div>
      </aside>
      <div className="main-wrap">
        <main className="main" id="main">
          {admin ? <DeskProviders admin={admin}>{children}</DeskProviders> : <p className="loading">Opening the desk…</p>}
        </main>
      </div>
    </div>
  );
}
