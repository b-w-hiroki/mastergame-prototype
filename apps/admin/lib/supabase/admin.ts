import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@mastergame/shared';

let _client: SupabaseClient<Database> | null = null;

// service_role クライアント（RLS バイパス）。**サーバー専用** — 集計参照・運営操作に使用。
// 遅延生成：ビルド時（env 未注入）に throw しないため + 欠落時に明確なエラーを出すため。
export function getAdminClient(): SupabaseClient<Database> {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です（.env.local を確認）'
    );
  }
  _client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
