import { createClient } from '@supabase/supabase-js';

// service_role クライアント（RLS バイパス）。**サーバー専用** — 集計参照・運営操作に使用。
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
