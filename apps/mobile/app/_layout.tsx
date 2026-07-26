import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { registerPushToken } from '@/lib/push';

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
    if (!s) { setOnboarded(null); return; }
    try {
      const { count, error } = await supabase
        .from('user_genres')
        .select('genre', { count: 'exact', head: true })
        .eq('user_id', s.user.id);
      if (error) throw error;
      setOnboarded((count ?? 0) > 0);
    } catch {
      // 判定不能（オフライン等）は、オンボーディングに閉じ込めず通す。
      // ジャンルは後からマイページで設定できる。
      setOnboarded(true);
    }
  }

  useEffect(() => {
    // getSession/refresh が失敗しても必ず ready にし、永久ブランク＋未処理 rejection を防ぐ
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        await refreshOnboarded(data.session);
      } finally {
        setReady(true);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      await refreshOnboarded(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ログイン後にプッシュ通知トークンを登録（失敗しても致命的でないため握りつぶす）
  useEffect(() => {
    if (session) registerPushToken().catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!ready) return;
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
