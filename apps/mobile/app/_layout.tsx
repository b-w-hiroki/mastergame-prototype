import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';

/**
 * 認証＋オンボーディングのゲート。
 *  - 未ログイン            → /login
 *  - ログイン済 & ジャンル未選択 → /onboarding（→ /genres）
 *  - ログイン済 & 設定済    → (tabs)（ホーム）
 * prototype の splash→onboarding→ジャンル選択→login→home に対応。
 */
export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  // ジャンル選択の有無で初回オンボーディング要否を判定
  async function refreshOnboarded(s: Session | null) {
    if (!hasSupabaseConfig) { setOnboarded(true); return; }
    if (!s) { setOnboarded(null); return; }
    const { count } = await supabase
      .from('user_genres')
      .select('genre', { count: 'exact', head: true })
      .eq('user_id', s.user.id);
    setOnboarded((count ?? 0) > 0);
  }

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setSession(null);
      setOnboarded(true);
      setReady(true);
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await refreshOnboarded(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      // Supabase auth callbacks run while the auth client holds an internal lock.
      // Defer queries that use the same client so sign-in/sign-up can finish.
      setTimeout(() => {
        void refreshOnboarded(s);
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!hasSupabaseConfig) return;
    const seg = segments[0];
    const inAuth = seg === 'login' || seg === 'signup' || seg === 'forgot';
    const inOnboarding = seg === 'onboarding' || seg === 'genres';

    if (!session) {
      if (!inAuth) router.replace('/login');
    } else if (onboarded === false) {
      if (!inOnboarding) router.replace('/onboarding');
    } else if (inAuth || inOnboarding) {
      router.replace('/');
    }
  }, [ready, session, onboarded, segments]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
