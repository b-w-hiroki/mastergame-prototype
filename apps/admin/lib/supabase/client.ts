'use client';

import { createBrowserClient } from '@supabase/ssr';

// ブラウザ用クライアント（anon キー / RLS 有効）。ログイン画面のみで使用。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
