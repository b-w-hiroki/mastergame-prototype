'use client';

import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const ITEMS = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/users', label: 'ユーザー管理' },
  { href: '/missions', label: 'ミッション管理' },
  { href: '/items', label: '交換アイテム管理' },
  { href: '/exchanges', label: '交換申請' },
  { href: '/moderation', label: '通報・モデレーション' },
  { href: '/postback', label: 'postback監視' },
];

export default function Nav() {
  const path = usePathname();
  async function logout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    window.location.assign('/login');
  }
  return (
    <nav>
      {ITEMS.map((it) => {
        const on = it.href === '/' ? path === '/' : path.startsWith(it.href);
        return (
          <a key={it.href} className={on ? 'on' : undefined} href={it.href}>
            {it.label}
          </a>
        );
      })}
      <button className="nav-logout" type="button" onClick={logout}>ログアウト</button>
    </nav>
  );
}
