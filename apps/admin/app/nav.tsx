'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
    </nav>
  );
}
