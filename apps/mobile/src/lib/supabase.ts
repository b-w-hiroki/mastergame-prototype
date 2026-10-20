import 'react-native-get-random-values'; // PKCE / crypto polyfill (RN)
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@mastergame/shared';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const hasSupabaseConfig = Boolean(url && anonKey);

<<<<<<< HEAD
// 未設定なら黙って壊れたクライアントを作らず、明確に落とす（fail-fast）。
if (!url || !anonKey) {
  throw new Error(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY が未設定です。apps/mobile/.env を確認してください。'
  );
}

export const supabase = createClient<Database>(url, anonKey, {
=======
if (!hasSupabaseConfig) {
  console.warn('[supabase] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY が未設定です（.env を参照）');
}

export const supabase = createClient(url ?? 'http://127.0.0.1:54321', anonKey ?? 'demo-anon-key', {
>>>>>>> codex/mvp-stabilization-20260919
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce', // OAuth はディープリンクで code を受け取り exchange
  },
});
