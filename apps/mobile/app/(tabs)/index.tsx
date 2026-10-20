import { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
<<<<<<< HEAD
import { router } from 'expo-router';
import { VisualSlot } from '@/components/VisualSlot';
=======
import { router, useFocusEffect } from 'expo-router';
>>>>>>> codex/points-exchange-ux
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
<<<<<<< HEAD
import { useLoader } from '@/lib/useLoader';
import { missionPeriodKey } from '@/lib/missionPeriod';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { useReward } from '@/components/RewardToast';
import { StreakCard, type StreakState } from '@/components/StreakCard';
import { resolveNotification } from '@/lib/notifications';
import { isNotificationRow } from '@/lib/notificationRows';
import { isDailyMission, isNudgeTarget, isStreakState } from '@/lib/homeRows';
import { track, EVENTS } from '@/lib/analytics';
<<<<<<< HEAD
import type { Mission, NudgeTarget, VipInfo, AppNotification } from '@/lib/types';
=======
import type { AppNotification, Mission, NudgeTarget, VipInfo } from '@/lib/types';

const demoMissions: Mission[] = [
  {
    id: 'demo-login',
    type: 'daily',
    title: '今日のログインボーナスを受け取る',
    description: '毎日のチェックインでポイントをためる',
    reward_points: 1000,
    icon: '✓',
    max_progress: 1,
    requires_verification: false,
    ends_at: null,
  },
  {
    id: 'demo-news',
    type: 'daily',
    title: 'ゲームニュースを1本読む',
    description: 'おすすめ記事を読んで報酬を獲得',
    reward_points: 3000,
    icon: 'N',
    max_progress: 1,
    requires_verification: false,
    ends_at: null,
  },
  {
    id: 'demo-offer',
    type: 'daily',
    title: '提携オファーを確認する',
    description: '外部オファーは検証後に確定します',
    reward_points: 12000,
    icon: 'P',
    max_progress: 1,
    requires_verification: true,
    ends_at: null,
  },
];

const demoNews: AppNotification[] = [
  { id: 'n1', type: 'system', payload: { title: '週末限定ミッションが追加されました' }, read_at: null, created_at: '' },
  { id: 'n2', type: 'reply', payload: { title: 'ギルドの質問に返信が届いています' }, read_at: null, created_at: '' },
];
>>>>>>> codex/mvp-stabilization-20260919
=======
import type { Mission, NudgeTarget, VipInfo, AppNotification, CompletionStatus } from '@/lib/types';
>>>>>>> codex/points-exchange-ux

export default function Home() {
<<<<<<< HEAD
  const [balance, setBalance] = useState(0);
  const [vip, setVip] = useState<VipInfo | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionStatus, setMissionStatus] = useState<Record<string, CompletionStatus>>({});
  const [nudge, setNudge] = useState<NudgeTarget | null>(null);
  const [news, setNews] = useState<AppNotification[]>([]);
=======
  const [balance, setBalance] = useState(125000);
  const [vip, setVip] = useState<VipInfo | null>({ user_id: 'demo', xp: 6400, tier_name: 'シルバー', staking_rate_bps: 150 });
  const [missions, setMissions] = useState<Mission[]>(demoMissions);
  const [nudge, setNudge] = useState<NudgeTarget | null>({
    item_name: '1,500円分のゲームコード',
    gap: 25000,
    cost: 150000,
  });
  const [news, setNews] = useState<AppNotification[]>(demoNews);
  const [refreshing, setRefreshing] = useState(false);
>>>>>>> codex/mvp-stabilization-20260919
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

<<<<<<< HEAD
  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const [{ data: wallet }, { data: ms }, { data: n }, { data: v }, { data: nt }] = await Promise.all([
      supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single(),
=======
  const load = useCallback(async (isCurrent: () => boolean) => {
    const version = ++homeReadVersion.current;
    loadedUser.current = null;
    setBalance(0);
    setVip(null);
    setMissions([]);
    setMissionStatus({});
    setNudge(null);
    setNews([]);
    setStreak(null);
    setNotificationError(null);
    const { data: u, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!u.user) throw new Error('ログイン状態を確認できません。');
    const { data: serviceDate, error: dateError } = await supabase.rpc('service_today');
    if (dateError) throw dateError;
    if (!serviceDate) throw new Error('サービス日付を確認できません。');
    const periodKey = missionPeriodKey('daily', serviceDate);
    const results = await Promise.all([
      supabase.from('point_wallets').select('user_id,balance').eq('user_id', u.user.id).single(),
>>>>>>> codex/points-exchange-ux
      supabase.from('missions').select('*').eq('type', 'daily').eq('is_active', true),
      supabase.rpc('next_nudge_target'),
      supabase.from('user_vip').select('*').eq('user_id', u.user.id).single(),
      supabase.from('notifications').select('*').eq('user_id', u.user.id).order('created_at', { ascending: false }).limit(3),
      supabase.rpc('my_streak'),
      supabase.from('mission_completions').select('user_id,mission_id,status,period_key').eq('user_id', u.user.id)
        .eq('period_key', periodKey),
    ]);
<<<<<<< HEAD
<<<<<<< HEAD
    const { data: st } = await supabase.rpc('my_streak');
    setStreak((st as unknown as StreakState) ?? null);
    setBalance(wallet?.balance ?? 0);
    setMissions(ms ?? []);
=======
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    const [{ data: wallet }, { data: ms }, { data: n }, { data: v }, { data: nt }, { data: st }, { data: completions }] = results;
    if (!wallet || wallet.user_id !== u.user.id || typeof wallet.balance !== 'number' || !Number.isSafeInteger(wallet.balance)
      || wallet.balance < 0 || !Array.isArray(ms) || !ms.every(isDailyMission)
      || !Array.isArray(nt) || (n !== null && !isNudgeTarget(n))
      || (st !== null && !isStreakState(st))
      || !nt.every((row) => isNotificationRow(row, u.user.id)) || !Array.isArray(completions)
      || (v !== null && (!v || v.user_id !== u.user.id || typeof v.xp !== 'number'
        || !Number.isSafeInteger(v.xp) || v.xp < 0
        || (v.tier_name !== null && (typeof v.tier_name !== 'string' || !v.tier_name.trim()))
        || (v.staking_rate_bps !== null && (typeof v.staking_rate_bps !== 'number'
          || !Number.isSafeInteger(v.staking_rate_bps) || v.staking_rate_bps < 0))))
      || !completions.every((row) => row.user_id === u.user.id && row.period_key === periodKey
        && typeof row.mission_id === 'string' && row.mission_id.length > 0
        && (row.status === 'confirmed' || row.status === 'pending'
          || row.status === 'rejected' || row.status === 'reversed'))) {
      throw new Error('ホームの残高と履歴を確認できませんでした。');
    }
    if (!isCurrent()) return;
    const { data: currentUser, error: currentAuthError } = await supabase.auth.getUser();
    if (currentAuthError || currentUser.user?.id !== u.user.id) {
      throw new Error('ホームの取得中にログイン状態が変わりました。');
    }
    if (!isCurrent()) return;
    loadedUser.current = u.user.id;
    setStreak(st as StreakState | null);
    setBalance(wallet.balance);
    setMissions(ms);
    const statuses: Record<string, CompletionStatus> = {};
    for (const completion of completions) {
      statuses[completion.mission_id] = completion.status as CompletionStatus;
    }
    setMissionStatus(statuses);
>>>>>>> codex/points-exchange-ux
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

<<<<<<< HEAD
  async function claim(m: Mission) {
    setClaiming(m.id);
    const { error: claimError } = await supabase.rpc('claim_mission', { p_mission_id: m.id });
=======

    if (wallet?.balance != null) setBalance(wallet.balance);
    if (ms?.length) setMissions(ms as Mission[]);
    if (n) setNudge(n as NudgeTarget);
    if (v) setVip(v as VipInfo);
    if (nt?.length) setNews(nt as AppNotification[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function claim(m: Mission) {
    setClaiming(m.id);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || m.id.startsWith('demo-')) {
      setBalance((current) => current + m.reward_points);
      setClaiming(null);
      return;
    }

    const { error } = await supabase.rpc('claim_mission', { p_mission_id: m.id });
>>>>>>> codex/mvp-stabilization-20260919
    setClaiming(null);
    if (claimError) {
      Alert.alert('受け取れませんでした', claimError.message);
      return;
=======
  async function claimContext(userId: string, version: number): Promise<boolean> {
    if (homeReadVersion.current !== version || loadedUser.current !== userId) return false;
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      return !authError && data.user?.id === userId
        && homeReadVersion.current === version && loadedUser.current === userId;
    } catch {
      return false;
    }
  }

  async function claim(m: Mission) {
    const userId = loadedUser.current;
    const version = homeReadVersion.current;
    if (claimInFlight.current || loading || refreshing || error || !userId) return;
    claimInFlight.current = true;
    setClaiming(m.id);
    setRewardMessage(null);
    try {
      if (!await claimContext(userId, version)) {
        setRewardMessage('ログイン状態を確認できませんでした。報酬は申請していません。再読み込みしてください。');
        await reload();
        return;
      }
      const { data, error: claimError } = await supabase.rpc('claim_mission', { p_mission_id: m.id });
      if (!await claimContext(userId, version)) {
        setRewardMessage('受取中に画面またはアカウントが変わりました。ポイント履歴で受取結果をご確認ください。');
        await reload();
        return;
      }
      if (claimError) {
        const alreadyClaimed = claimError.message.includes('mission already claimed');
        if (alreadyClaimed) setMissionStatus((previous) => ({ ...previous, [m.id]: 'confirmed' }));
        setRewardMessage(alreadyClaimed
          ? 'この報酬はすでに受取済みです。最新の状態に更新します。'
          : '通信または処理に失敗しました。時間をおいて再度お試しください。');
        await reload();
        return;
      }
      const result = data as { ok?: boolean; reward?: number } | null;
      if (result?.ok !== true) {
        setRewardMessage('この報酬は現在受け取れません。画面を更新して状態をご確認ください。');
        await reload();
        return;
      }
      setMissionStatus((previous) => ({ ...previous, [m.id]: 'confirmed' }));
      if (typeof result.reward === 'number' && Number.isSafeInteger(result.reward) && result.reward > 0) {
        reward.show(result.reward, m.title);
      } else {
        setRewardMessage('受取結果のポイント数を確認できませんでした。ポイント履歴をご確認ください。');
      }
      await reload();
    } catch {
      setRewardMessage('通信結果を確認できませんでした。画面を更新して受取状態をご確認ください。');
      await reload();
    } finally {
      claimInFlight.current = false;
      setClaiming(null);
>>>>>>> codex/points-exchange-ux
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
<<<<<<< HEAD
      {reward.node}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}
        {rewardMessage && <Text accessibilityRole="alert" style={s.rewardMessage}>{rewardMessage}</Text>}
        {notificationError && <Text accessibilityRole="alert" style={s.rewardMessage}>{notificationError}</Text>}

=======
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
>>>>>>> codex/mvp-stabilization-20260919
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
<<<<<<< HEAD
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
=======
          <Pressable accessibilityRole="button" accessibilityLabel="ポイント残高と履歴を見る"
            style={s.chip} onPress={() => router.push('/points')}>
            <Text style={s.chipText}>🪙 {loading || refreshing || error ? '—' : balance.toLocaleString()} P</Text>
          </Pressable>
        </View>

        {nudge && (nudge.gap != null || nudge.all_affordable) && (
          <View style={s.nudge}>
            <Text style={s.nudgeEyebrow}>{nudge.all_affordable ? '🎁 交換のチャンス' : '🎯 次の交換目標'}</Text>
            {nudge.gap != null && nudge.gap > 0 ? (
              <Text style={s.nudgeText}>「{nudge.item_name}」まであと <Text style={s.gold}>{nudge.gap.toLocaleString()}P</Text></Text>
            ) : (
              <Text style={s.nudgeText}>交換できるアイテムがあります</Text>
            )}
            {nudge.gap != null && nudge.gap > 0 && !!nudge.cost && (
              <>
                <View style={s.progressTrack} accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.floor((balance / nudge.cost) * 100)) }}>
                  <View style={[s.progressFill, { width: `${Math.min(100, Math.floor((balance / nudge.cost) * 100))}%` }]} />
                </View>
                <Text style={s.progressLabel}>{balance.toLocaleString()} / {nudge.cost.toLocaleString()} P</Text>
              </>
            )}
            <Pressable accessibilityRole="button" style={s.nudgeCta}
              onPress={() => router.push(nudge.all_affordable ? { pathname: '/points', params: { section: 'exchange' } } : '/missions')}>
              <Text style={s.nudgeCtaText}>{nudge.all_affordable ? 'アイテムを見る ›' : 'ミッションでためる ›'}</Text>
            </Pressable>
          </View>
>>>>>>> codex/points-exchange-ux
        )}

        {streak && (
          <StreakCard state={streak} busy={streakBusy || loading || refreshing || !!error} onClaim={() => { void claimStreak(); }} />
        )}

        <View style={s.actions}>
<<<<<<< HEAD
=======
          <Pressable style={s.action} onPress={() => router.push({ pathname: '/points', params: { section: 'exchange' } })}>
            <Text style={s.actionEmoji}>🎁</Text><Text style={s.actionText}>交換</Text>
          </Pressable>
>>>>>>> codex/points-exchange-ux
          <Pressable style={s.action} onPress={() => router.push('/missions')}>
            <Text style={s.actionIcon}>✓</Text>
            <Text style={s.actionText}>ミッション</Text>
          </Pressable>
<<<<<<< HEAD
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
=======
>>>>>>> codex/points-exchange-ux
        </View>

<<<<<<< HEAD
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
=======
        <View style={s.sectionRow}>
          <Text style={s.section}>お知らせ</Text>
          <Text style={s.more}>すべて</Text>
        </View>
        {news.map((item) => (
          <View key={item.id} style={s.newsItem}>
            <View style={s.newsThumb} />
            <View style={{ flex: 1 }}>
              <Text style={s.newsType}>{labelOf(item.type)}</Text>
              <Text style={s.newsBody} numberOfLines={2}>
                {String(item.payload?.message ?? item.payload?.title ?? '新しい通知があります')}
              </Text>
            </View>
          </View>
        ))}
>>>>>>> codex/mvp-stabilization-20260919

<<<<<<< HEAD
        <View style={s.sectionRow}>
          <Text style={s.section}>デイリーミッション</Text>
          <Text style={s.more} onPress={() => router.push('/missions')}>
            もっと見る
          </Text>
        </View>
=======
        <Text style={s.section}>デイリーミッション</Text>
        {missions.length === 0 && !loading && !error && <Text style={s.empty}>本日のミッションはありません</Text>}
>>>>>>> codex/points-exchange-ux
        {missions.map((m) => (
          <View key={m.id} style={s.mission}>
            <View style={s.missionIcon}>
              <Text style={s.missionIconText}>{m.icon ?? 'M'}</Text>
            </View>
<<<<<<< HEAD
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
=======
            {missionStatus[m.id] === 'confirmed' ? (
              <Text style={s.claimDone}>✓ 受取済み</Text>
            ) : missionStatus[m.id] === 'pending' ? (
              <Text style={s.claimPending}>確認中</Text>
            ) : m.requires_verification ? (
              <Pressable accessibilityRole="button" style={s.claim} onPress={() => router.push('/missions')}>
                <Text style={s.claimText}>条件を確認</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: claiming !== null || loading || refreshing || !!error }}
                style={[s.claim, (claiming !== null || loading || refreshing || !!error) && { opacity: 0.5 }]}
                disabled={claiming !== null || loading || refreshing || !!error} onPress={() => claim(m)}>
                <Text style={s.claimText}>{claiming === m.id ? '受取中…' : '受け取る'}</Text>
              </Pressable>
            )}
>>>>>>> codex/points-exchange-ux
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

<<<<<<< HEAD
=======
function labelOf(type: string): string {
  const labels: Record<string, string> = {
    reply: '返信',
    best_answer: 'ベストアンサー',
    reaction: 'リアクション',
    report_result: '通報結果',
    system: 'お知らせ',
  };
  return labels[type] ?? 'お知らせ';
}
>>>>>>> codex/mvp-stabilization-20260919

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
<<<<<<< HEAD
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
<<<<<<< HEAD
=======
  hello: { fontSize: 18, fontWeight: '800', color: colors.ink },
  rank: { fontSize: 12, fontWeight: '800', color: colors.gold, marginTop: 2 },
  chip: { marginLeft: 'auto', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontWeight: '800', fontSize: 13 },
  nudge: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: '#e7d6a6', borderRadius: 16, padding: 16, marginBottom: 14 },
  nudgeEyebrow: { color: '#7a5b16', fontSize: 11, fontWeight: '800', marginBottom: 6 },
  nudgeText: { color: '#4c3b18', fontWeight: '800', fontSize: 15, lineHeight: 22 },
  gold: { color: colors.gold, fontWeight: '900' },
  progressTrack: { height: 8, backgroundColor: '#fff9e9', borderRadius: 99, overflow: 'hidden', marginTop: 12 },
  progressFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 99 },
  progressLabel: { color: '#7a5b16', fontSize: 11, fontWeight: '700', marginTop: 5, textAlign: 'right' },
  nudgeCta: { alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12 },
  nudgeCtaText: { color: '#fff', fontWeight: '800', fontSize: 12 },
>>>>>>> codex/points-exchange-ux
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
<<<<<<< HEAD
=======
  nudgeGo: { color: '#fff', backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, overflow: 'hidden', fontWeight: '900', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  action: { flex: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  actionIcon: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  actionText: { color: colors.sub, fontWeight: '800', fontSize: 10.5, marginTop: 5 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 9 },
  section: { fontSize: 12, fontWeight: '900', color: colors.sub, letterSpacing: 0.4 },
  more: { marginLeft: 'auto', color: colors.accent, fontWeight: '800', fontSize: 11 },
  newsItem: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 12, marginBottom: 8 },
  newsThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#e7e9f2' },
  newsType: { fontSize: 10, fontWeight: '900', color: colors.accent },
  newsBody: { fontSize: 13, color: colors.ink, marginTop: 3, fontWeight: '700' },
  mission: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 13, marginBottom: 10, gap: 12 },
  missionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  missionIconText: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  mTitle: { fontSize: 13, fontWeight: '800', color: colors.ink, lineHeight: 18 },
  mReward: { fontSize: 11, color: colors.gold, fontWeight: '900', marginTop: 3 },
  claim: { backgroundColor: colors.ok, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  claimText: { color: '#fff', fontWeight: '900', fontSize: 12 },
>>>>>>> codex/mvp-stabilization-20260919
=======
  claimDone: { color: colors.ok, fontSize: 12, fontWeight: '800', marginLeft: 10 },
  claimPending: { color: '#7a5b16', fontSize: 12, fontWeight: '800', marginLeft: 10 },
>>>>>>> codex/points-exchange-ux
});
