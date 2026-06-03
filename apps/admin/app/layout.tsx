import './globals.css';
import type { Metadata, Viewport } from 'next';
import Nav from './nav';
import Pwa from './pwa';

export const metadata: Metadata = {
  title: 'MasterGame 運営コンソール',
  description: 'MasterGame 運営管理画面（社内運営向け）',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'MG運営', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#12152a',
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
        <Pwa />
      </body>
    </html>
  );
}
