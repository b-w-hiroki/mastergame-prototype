import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';

export { isAdminUser };
// バリデータは Next 非依存の純粋モジュールへ切り出し（単体テスト対象）。後方互換で re-export。
export { assertUuid, assertEnum } from '@/lib/validate';

// ページ / server action の先頭で呼ぶ。管理者でなければ /login へ。
// middleware が一次ゲートだが、action 単体で叩かれた場合の二次防御として必ず併用する。
export async function requireAdmin(): Promise<User> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) redirect('/login');
  return user!;
}
