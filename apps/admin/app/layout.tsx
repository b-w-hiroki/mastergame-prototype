import './globals.css';
import type { Metadata } from 'next';
import Nav from './nav';

export const metadata: Metadata = {
  title: 'MasterGame 運営コンソール',
  description: 'MasterGame 運営管理画面',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className="layout">
          <aside className="side">
            <div className="brand"><span className="logo">MG</span>MasterGame</div>
            <Nav />
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
