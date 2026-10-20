'use client';

<<<<<<< HEAD
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
=======
import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
>>>>>>> codex/mvp-stabilization-20260919

const ITEMS = [
  { href: '/', label: 'ダッシュボード' },
  { href: '/economy', label: 'ポイント経済' },
  { href: '/analytics', label: '行動分析' },
  { href: '/users', label: 'ユーザー管理' },
  { href: '/missions', label: 'ミッション管理' },
  { href: '/games', label: 'ゲームタイトル' },
  { href: '/items', label: '交換アイテム管理' },
  { href: '/exchanges', label: '交換申請' },
<<<<<<< HEAD
  { href: '/support', label: 'お問い合わせ' },
=======
>>>>>>> codex/mvp-stabilization-20260919
  { href: '/moderation', label: '通報・モデレーション' },
  { href: '/referrals', label: '招待' },
  { href: '/fraud', label: '不正検知' },
  { href: '/deletions', label: '退会' },
  { href: '/postback', label: 'postback監視' },
];

export default function Nav() {
  const path = usePathname();
<<<<<<< HEAD
  const router = useRouter();

  async function logout() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

=======
  async function logout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    window.location.assign('/login');
  }
>>>>>>> codex/mvp-stabilization-20260919
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
<<<<<<< HEAD
      <button type="button" className="navlogout" onClick={logout}>ログアウト</button>
=======
      <button className="nav-logout" type="button" onClick={logout}>ログアウト</button>
>>>>>>> codex/mvp-stabilization-20260919
    </nav>
  );
}
