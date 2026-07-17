'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const ITEMS = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/users', label: 'ユーザー管理' },
  { href: '/missions', label: 'ミッション管理' },
  { href: '/items', label: '交換アイテム管理' },
  { href: '/moderation', label: '通報・モデレーション' },
  { href: '/postback', label: 'postback監視' },
];

export default function Nav() {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <nav>
      {ITEMS.map((it) => {
        const on = it.href === '/' ? path === '/' : path.startsWith(it.href);
        return (
          <Link key={it.href} className={on ? 'on' : undefined} href={it.href}>
            {it.label}
          </Link>
        );
      })}
      <button type="button" className="navlogout" onClick={logout}>ログアウト</button>
    </nav>
  );
}
