import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin-check';

export { isAdminUser };

// ページ / server action の先頭で呼ぶ。管理者でなければ /login へ。
// middleware が一次ゲートだが、action 単体で叩かれた場合の二次防御として必ず併用する。
export async function requireAdmin(): Promise<User> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminUser(user)) redirect('/login');
  return user!;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(v: unknown, field = 'id'): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!UUID_RE.test(s)) throw new Error(`invalid ${field}`);
  return s;
}

export function assertEnum<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  const s = typeof v === 'string' ? v : '';
  if (!(allowed as readonly string[]).includes(s)) throw new Error(`invalid ${field}`);
  return s as T;
}
