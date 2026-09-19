import './globals.css';
import type { Metadata, Viewport } from 'next';
import Pwa from './pwa';
import Shell from './shell';

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
        <Shell>{children}</Shell>
        <Pwa />
      </body>
    </html>
  );
}
