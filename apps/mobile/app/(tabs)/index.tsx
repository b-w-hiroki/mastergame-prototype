import { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { VisualSlot } from '@/components/VisualSlot';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { missionPeriodKey } from '@/lib/missionPeriod';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { useReward } from '@/components/RewardToast';
import { StreakCard, type StreakState } from '@/components/StreakCard';
import { resolveNotification } from '@/lib/notifications';
import { isNotificationRow } from '@/lib/notificationRows';
import { isDailyMission, isNudgeTarget, isStreakState } from '@/lib/homeRows';
import { track, EVENTS } from '@/lib/analytics';
import type { Mission, NudgeTarget, VipInfo, AppNotification } from '@/lib/types';

export default function Home() {
  const [balance, setBalance] = useState(0);
  const [vip, setVip] = useState<VipInfo | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionStatus, setMissionStatus] = useState<Record<string, CompletionStatus>>({});
  const [nudge, setNudge] = useState<NudgeTarget | null>(null);
  const [news, setNews] = useState<AppNotification[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [streakBusy, setStreakBusy] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const claimInFlight = useRef(false);
  const streakInFlight = useRef(false);
  const homeReadVersion = useRef(0);
  const loadedUser = useRef<string | null>(null);
  const notificationReads = useRef(new Map<string, Promise<void>>());

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const [{ data: wallet }, { data: ms }, { data: n }, { data: v }, { data: nt }] = await Promise.all([
      supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single(),
      supabase.from('missions').select('*').eq('type', 'daily').eq('is_active', true),
      supabase.rpc('next_nudge_target'),
      supabase.from('user_vip').select('*').eq('user_id', u.user.id).single(),
      supabase.from('notifications').select('*').eq('user_id', u.user.id).order('created_at', { ascending: false }).limit(3),
      supabase.rpc('my_streak'),
      supabase.from('mission_completions').select('user_id,mission_id,status,period_key').eq('user_id', u.user.id)
        .eq('period_key', periodKey),
    ]);
    const { data: st } = await supabase.rpc('my_streak');
    setStreak((st as unknown as StreakState) ?? null);
    setBalance(wallet?.balance ?? 0);
    setMissions(ms ?? []);
    // n は RPC(jsonb) / nt.payload は jsonb 列。境界で domain 形へ変換する。
    setNudge(n as NudgeTarget | null);
    setVip(v ?? null);
    setNews(nt as AppNotification[]);
  }, []);

  const { loading, error, refreshing, reload, onRefresh, cancel } = useLoader(load, { auto: false });
  useFocusEffect(useCallback(() => {
    void reload();
    return () => {
      homeReadVersion.current += 1;
      loadedUser.current = null;
      cancel();
    };
  }, [reload, cancel]));
  const reward = useReward();

  async function claim(m: Mission) {
    setClaiming(m.id);
    const { error: claimError } = await supabase.rpc('claim_mission', { p_mission_id: m.id });
    setClaiming(null);
    if (claimError) {
      Alert.alert('受け取れませんでした', claimError.message);
      return;
    }
  }

  // 連続ログインボーナスの受け取り。日付判定はサーバ側（端末の時計は信用しない）。
  async function claimStreak() {
    const userId = loadedUser.current;
    const version = homeReadVersion.current;
    if (streakInFlight.current || loading || refreshing || error || !userId) return;
    streakInFlight.current = true;
    setStreakBusy(true);
    setRewardMessage(null);
    try {
      if (!await claimContext(userId, version)) {
        setRewardMessage('ログイン状態を確認できませんでした。報酬は申請していません。再読み込みしてください。');
        await reload();
        return;
      }
      track(EVENTS.streakClaimTap, { day: streak?.next_day_index });
      const { data, error: sErr } = await supabase.rpc('claim_daily_streak');
      if (!await claimContext(userId, version)) {
        setRewardMessage('受取中に画面またはアカウントが変わりました。ポイント履歴で受取結果をご確認ください。');
        await reload();
        return;
      }
      if (sErr) {
        setRewardMessage('報酬を受け取れませんでした。最新の状態を確認してから、もう一度お試しください。');
        await reload();
        return;
      }

      const res = data as unknown as { status: string; reward?: number; streak?: number } | null;
      if (res?.status !== 'ok') {
        if (res?.status !== 'duplicate') setRewardMessage('この報酬は現在受け取れません。画面を更新して状態をご確認ください。');
        // duplicate（既に受け取り済み）は表示を最新化するだけでよい
        await reload();
        return;
      }
      if (typeof res.reward !== 'number' || !Number.isSafeInteger(res.reward) || res.reward < 0
        || typeof res.streak !== 'number' || !Number.isSafeInteger(res.streak) || res.streak < 1) {
        setRewardMessage('受取結果のポイント数を確認できませんでした。ポイント履歴をご確認ください。');
        await reload();
        return;
      }
      track(EVENTS.streakClaimed, { day: res.streak, reward: res.reward });
      if (res.reward > 0) reward.show(res.reward, `連続${res.streak}日目`);
      else setRewardMessage(`連続${res.streak}日目を受け取りました（ポイント付与なし）。`);
      await reload();
    } catch {
      setRewardMessage('通信結果を確認できませんでした。画面を更新して受取状態をご確認ください。');
      await reload();
    } finally {
      streakInFlight.current = false;
      setStreakBusy(false);
    }
  }

  // お知らせタップで既読化し、種別ごとの画面へ遷移（解決ロジックは lib/notifications）。
  async function openNews(n: AppNotification) {
    const view = resolveNotification(n);
    if (!n.read_at && !notificationReads.current.has(n.id)) {
      setNotificationError(null);
      const userId = loadedUser.current;
      const version = homeReadVersion.current;
      const task = (async () => {
        if (!userId || !await claimContext(userId, version)) return;
        try {
          const { data, error: readError } = await supabase.rpc('mark_notification_read', { p_id: n.id });
          if (!await claimContext(userId, version)) return;
          if (readError || (data as { ok?: boolean } | null)?.ok !== true) {
            setNotificationError('既読の保存に失敗しました。お知らせ一覧から再試行してください。');
            return;
          }
          await reload();
        } catch {
          if (await claimContext(userId, version)) {
            setNotificationError('既読の保存に失敗しました。お知らせ一覧から再試行してください。');
          }
        }
      })();
      notificationReads.current.set(n.id, task);
      void task.finally(() => { if (notificationReads.current.get(n.id) === task) notificationReads.current.delete(n.id); });
    }
    if (view.href) router.push(view.href as never);
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {reward.node}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}
        {rewardMessage && <Text accessibilityRole="alert" style={s.rewardMessage}>{rewardMessage}</Text>}
        {notificationError && <Text accessibilityRole="alert" style={s.rewardMessage}>{notificationError}</Text>}

        <View style={s.head}>
          <View>
            <Text style={s.hello}>おかえりなさい</Text>
            <Text style={s.rank}>VIP {vip?.tier_name ?? 'ブロンズ'} ・ 今日も少しずつ前進</Text>
          </View>
          <View style={s.chip}>
            <Text style={s.chipText}>{balance.toLocaleString()} P</Text>
          </View>
        </View>

        <View style={s.hero}>
          <View style={s.heroImage}>
            <VisualSlot tone="hero" />
          </View>
          <View style={s.heroCopy}>
            <Text style={s.heroBadge}>WEEKEND</Text>
            <Text style={s.heroTitle}>週末ブースト開催中</Text>
            <Text style={s.heroText}>ミッション報酬が一部アップ。自然なバナー画像に差し替え予定です。</Text>
          </View>
        </View>

        {/* 連続ログインは毎日開く動機そのものなので、ナッジより上（最初に目に入る位置）に置く */}
        {streak && (
          <StreakCard state={streak} busy={streakBusy} onClaim={() => { void claimStreak(); }} />
        )}

        {nudge?.gap != null && nudge.gap > 0 && (
          <Pressable style={s.nudge} onPress={() => router.push('/exchange')}>
            <View style={s.nudgeIcon}>
              <Text style={s.nudgeIconText}>P</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.nudgeText}>
                あと <Text style={s.gold}>{nudge.gap.toLocaleString()}P</Text> で「{nudge.item_name}」に交換できます
              </Text>
              <Text style={s.nudgeSub}>おすすめミッションから近道できます</Text>
            </View>
            <Text style={s.nudgeGo}>貯める</Text>
          </Pressable>
        )}

        {streak && (
          <StreakCard state={streak} busy={streakBusy || loading || refreshing || !!error} onClaim={() => { void claimStreak(); }} />
        )}

        <View style={s.actions}>
          <Pressable style={s.action} onPress={() => router.push('/missions')}>
            <Text style={s.actionIcon}>✓</Text>
            <Text style={s.actionText}>ミッション</Text>
          </Pressable>
          <Pressable style={s.action} onPress={() => router.push('/points')}>
            <Text style={s.actionIcon}>P</Text>
            <Text style={s.actionText}>ポイント</Text>
          </Pressable>
          <Pressable style={s.action} onPress={() => router.push('/community')}>
            <Text style={s.actionIcon}>#</Text>
            <Text style={s.actionText}>ギルド</Text>
          </Pressable>
          <Pressable style={s.action} onPress={() => router.push('/exchange')}>
            <Text style={s.actionIcon}>↗</Text>
            <Text style={s.actionText}>交換</Text>
          </Pressable>
        </View>

        {news.length > 0 && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.section}>お知らせ</Text>
              <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button">
                <Text style={s.moreLink}>すべて見る ›</Text>
              </Pressable>
            </View>
            {news.map((n) => {
              const v = resolveNotification(n);
              return (
                <Pressable key={n.id} style={s.newsItem} onPress={() => openNews(n).catch(() => {})}>
                  <View style={s.newsHead}>
                    {!n.read_at && <View style={s.unread} />}
                    <Text style={s.newsType}>{v.icon} {v.title}</Text>
                  </View>
                  {v.body && <Text style={s.newsBody} numberOfLines={2}>{v.body}</Text>}
                </Pressable>
              );
            })}
          </>
        )}

        <View style={s.sectionRow}>
          <Text style={s.section}>デイリーミッション</Text>
          <Text style={s.more} onPress={() => router.push('/missions')}>
            もっと見る
          </Text>
        </View>
        {missions.map((m) => (
          <View key={m.id} style={s.mission}>
            <View style={s.missionIcon}>
              <Text style={s.missionIconText}>{m.icon ?? 'M'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mTitle}>{m.title}</Text>
              <Text style={s.mReward}>+{m.reward_points.toLocaleString()} P</Text>
            </View>
            <Pressable
              style={[s.claim, claiming === m.id && { opacity: 0.5 }]}
              disabled={claiming === m.id}
              onPress={() => claim(m)}
            >
              <Text style={s.claimText}>{claiming === m.id ? '...' : '受け取る'}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}


const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  hello: { fontSize: 19, fontWeight: '800', color: colors.ink },
  rank: { fontSize: 12, fontWeight: '700', color: colors.sub, marginTop: 3 },
  chip: {
    marginLeft: 'auto',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipText: { fontWeight: '900', fontSize: 13, color: colors.gold },
  hero: {
    height: 154,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#202638',
    marginBottom: 14,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#30374d',
    borderWidth: 1,
    borderColor: '#3d455e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: 'rgba(10, 12, 20, 0.28)' },
  heroBadge: { color: '#f1d37a', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 3 },
  heroText: { color: '#d9deef', fontSize: 12, lineHeight: 17, marginTop: 4 },
  nudge: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: '#e7d6a6',
    borderRadius: 16,
    padding: 13,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  nudgeIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  nudgeIconText: { color: colors.gold, fontWeight: '900' },
  nudgeText: { color: '#7a5b16', fontWeight: '800', fontSize: 13, lineHeight: 18 },
  nudgeSub: { color: '#9a7e3a', fontSize: 11, marginTop: 2 },
  gold: { color: colors.gold, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  action: { flex: 1, backgroundColor: colors.accentSoft, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  actionEmoji: { fontSize: 20 },
  actionText: { color: colors.accent, fontWeight: '800', fontSize: 12, marginTop: 4 },
  section: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 20, marginBottom: 10 },
  empty: { color: colors.muted, fontSize: 13 },
  rewardMessage: { color: colors.ink, backgroundColor: colors.warnSoft, borderWidth: 1, borderColor: colors.warn, borderRadius: 12, padding: 13, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  moreLink: { fontSize: 12, fontWeight: '800', color: colors.accent },
  newsItem: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, marginBottom: 8 },
  newsHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unread: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger },
  newsType: { fontSize: 10, fontWeight: '800', color: colors.accent },
  newsBody: { fontSize: 13, color: colors.ink, marginTop: 2 },
  mission: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 13, marginBottom: 10 },
  mTitle: { fontSize: 13, fontWeight: '700' },
  mReward: { fontSize: 11, color: colors.gold, fontWeight: '800', marginTop: 3 },
  claim: { backgroundColor: colors.ok, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 },
  claimText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
