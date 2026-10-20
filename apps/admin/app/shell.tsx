'use client';

import { usePathname } from 'next/navigation';
import Nav from './nav';

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <main className="login-main">{children}</main>;

  return (
    <div className="layout">
      <aside className="side">
        <div className="brand"><span className="logo">MG</span>MasterGame</div>
        <Nav />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
