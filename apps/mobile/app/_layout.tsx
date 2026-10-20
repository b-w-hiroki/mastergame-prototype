import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { registerPushToken } from '@/lib/push';
import { registerDevice } from '@/lib/device';
import { track, flushEvents, setAnalyticsUser, EVENTS } from '@/lib/analytics';
import { AppAlertHost, clearAppAlerts } from '@/components/AppAlert';
import { AccountSetupGate } from '@/components/AccountSetupGate';
import { OnboardingCompletedContext } from '@/lib/onboarding';
import { withReadTimeout } from '@/lib/readTimeout';

/**
 * 認証＋オンボーディングのゲート。
 *  - 未ログイン            → /login
 *  - ログイン済 & ジャンル未選択 → /onboarding（→ /genres）
 *  - ログイン済 & 設定済    → (tabs)（ホーム）
 * prototype の splash→onboarding→ジャンル選択→login→home に対応。
 */
export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [onboarding, setOnboarding] = useState<{ userId: string; complete: boolean } | null>(null);
  const onboardingVersion = useRef(0);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  const userId = session?.user.id;
  const latestUserId = useRef(userId);
  latestUserId.current = userId;
  const onboarded = onboarding?.userId === userId ? onboarding?.complete ?? null : null;
  const stackOwner = useRef(userId ?? 'anonymous');
  // 一度限りのcodeを検証中の画面は、認証成立で作り直さない。
  if (segments[0] !== 'reset-password' && segments[0] !== 'auth-callback') stackOwner.current = userId ?? 'anonymous';

  function publishSession(value: Session | null) {
    if (setAnalyticsUser(value?.user.id ?? null)) clearAppAlerts();
    setSession(value);
  }

  useEffect(() => {
    let active = true;
    let authEvents = 0;
    // getSession/refresh が失敗しても必ず ready にし、永久ブランク＋未処理 rejection を防ぐ
    (async () => {
      try {
        const { data, error } = await withReadTimeout(supabase.auth.getSession());
        if (error) throw error;
        // 認証イベントが先に届いたら、古い起動時スナップショットで上書きしない。
        if (active && authEvents === 0) publishSession(data.session);
      } catch {
        if (active && authEvents === 0) publishSession(null);
      } finally {
        if (active) setReady(true);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!active) return;
      authEvents += 1;
      publishSession(s);
      setReady(true);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // 認証コールバック内で Supabase の別リクエストを待たない。
  useEffect(() => {
    const version = ++onboardingVersion.current;
    if (!userId) { setOnboarding(null); return; }
    (async () => {
      let complete = true;
      try {
        const { count, error } = await withReadTimeout(supabase.from('user_genres')
          .select('genre', { count: 'exact', head: true }).eq('user_id', userId));
        if (error) throw error;
        complete = (count ?? 0) > 0;
      } catch {
        // 好みの設定は後から変更可能。通信失敗だけで初回設定へ閉じ込めない。
      }
      if (version === onboardingVersion.current) setOnboarding({ userId, complete });
    })();
    return () => { onboardingVersion.current += 1; };
  }, [userId]);

  // ログイン後にプッシュ通知トークンと端末を登録
  // （どちらも失敗してもアプリの利用は続行できるため握りつぶす）
  useEffect(() => {
    if (!userId) return;
    registerPushToken(userId).catch(() => {});
    registerDevice(userId).catch(() => {});
    track(EVENTS.appOpen);
  }, [userId]);

  // バックグラウンド移行時に未送信のイベントを送り切る（次回起動まで滞留させない）
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushEvents();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const seg = segments[0];
    // 再設定リンクの認証前・認証後とも、フォームから追い出さない。
    if (seg === 'reset-password' || seg === 'forgot' || seg === 'legal' || seg === 'auth-callback') return;
    const inAuth = seg === 'login' || seg === 'signup';
    const inOnboarding = seg === 'onboarding' || seg === 'genres';

    if (!session) {
      if (!inAuth) router.replace('/login');
    } else if (onboarded === null) {
      return;
    } else if (onboarded === false) {
      if (!inOnboarding) router.replace('/onboarding');
    } else if (inAuth || inOnboarding) {
      router.replace('/');
    }
  }, [ready, session, onboarded, segments]);

  return (
    <SafeAreaProvider>
      <OnboardingCompletedContext.Provider value={() => {
        if (!userId || latestUserId.current !== userId) return;
        onboardingVersion.current += 1;
        setOnboarding({ userId, complete: true });
      }}>
      <StatusBar style="dark" />
      <Stack key={`navigation:${stackOwner.current}`} screenOptions={{ headerShown: false }} />
      {ready && session && !['reset-password', 'forgot', 'legal', 'auth-callback'].includes(segments[0] ?? '') && <AccountSetupGate key={`setup:${session.user.id}`} userId={session.user.id} />}
      <AppAlertHost />
      </OnboardingCompletedContext.Provider>
    </SafeAreaProvider>
  );
}
