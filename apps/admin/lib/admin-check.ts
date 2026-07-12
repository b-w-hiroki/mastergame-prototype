import type { User } from '@supabase/supabase-js';

// 管理者判定：app_metadata.role = 'admin'（Supabase ダッシュボード/Admin API で付与）
// または ADMIN_EMAILS（カンマ区切り）に含まれるメールアドレス。どちらも無ければ拒否（fail-closed）。
// middleware（Edge）からも import するため、next/headers 依存を持たない単独ファイルにする。
export function isAdminUser(user: User | null): boolean {
  if (!user) return false;
  if ((user.app_metadata as Record<string, unknown> | undefined)?.role === 'admin') return true;
  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!user.email && allowlist.includes(user.email.toLowerCase());
}
