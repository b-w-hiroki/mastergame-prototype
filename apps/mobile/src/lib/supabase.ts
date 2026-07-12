import 'react-native-get-random-values'; // PKCE / crypto polyfill (RN)
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// 未設定なら黙って壊れたクライアントを作らず、明確に落とす（fail-fast）。
if (!url || !anonKey) {
  throw new Error(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY が未設定です。apps/mobile/.env を確認してください。'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce', // OAuth はディープリンクで code を受け取り exchange
  },
});
