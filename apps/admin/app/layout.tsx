import './globals.css';
import type { Metadata } from 'next';

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
            <nav>
              <a className="on" href="/">ダッシュボード</a>
              <a href="/users">ユーザー管理</a>
              <a href="/moderation">通報・モデレーション</a>
              <a href="/postback">postback監視</a>
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
