import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// 認証ユーザーのセッションに紐づくサーバークライアント（RLS 有効）
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component からの set は無視（middleware で更新）
          }
        },
      },
    }
  );
}
