<<<<<<< HEAD
import { useCallback, useMemo, useState } from 'react';
<<<<<<< HEAD
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Alert, Linking } from 'react-native';
=======
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
>>>>>>> codex/mvp-stabilization-20260919
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { VisualSlot } from '@/components/VisualSlot';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
=======
import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Linking } from 'react-native';
import { AppAlert as Alert } from '@/components/AppAlert';
import { useAction } from '@/lib/useAction';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
>>>>>>> codex/points-exchange-ux
import { colors } from '@/lib/theme';
<<<<<<< HEAD
import { useLoader } from '@/lib/useLoader';
import { missionPeriodKey } from '@/lib/missionPeriod';
import { safeOfferUrl } from '@/lib/offerUrl';
import { isMissionRow, isMissionCompletionRow, isOfferRow, isOfferCompletionRow, hasUniqueKeys, offerCompletionStatus } from '@/lib/missionRows';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { useReward } from '@/components/RewardToast';
import type { Mission, MissionType, MissionCompletion, Offer } from '@/lib/types';
import { track, EVENTS } from '@/lib/analytics';

<<<<<<< HEAD
type OfferCompletion = { offer_id: string | null; status: string };
=======
import type { Mission, MissionCompletion, MissionType, Offer } from '@/lib/types';
>>>>>>> codex/mvp-stabilization-20260919
=======
type MissionState = Pick<MissionCompletion, 'status' | 'progress' | 'period_key'>;
>>>>>>> codex/points-exchange-ux

const tabs: { key: MissionType; label: string }[] = [
  { key: 'daily', label: 'デイリー' },
  { key: 'weekly', label: 'ウィークリー' },
  { key: 'achievement', label: '実績' },
  { key: 'event', label: '期間限定' },
];

const demoMissions: Mission[] = [
  { id: 'demo-daily-1', type: 'daily', title: 'ゲームニュースを1本読む', description: '提携メディアの記事閲覧でポイント獲得', reward_points: 3000, icon: 'N', max_progress: 1, requires_verification: false, ends_at: null },
  { id: 'demo-daily-2', type: 'daily', title: 'ログインボーナスを受け取る', description: '毎日1回、ホームから受け取り可能', reward_points: 1000, icon: 'L', max_progress: 1, requires_verification: false, ends_at: null },
  { id: 'demo-weekly-1', type: 'weekly', title: 'ミッションを5件クリアする', description: '今週の合計達成数で判定します', reward_points: 20000, icon: '5', max_progress: 5, requires_verification: false, ends_at: null },
  { id: 'demo-achieve-1', type: 'achievement', title: '初めて交換申請する', description: 'ゲームコードまたはデジタルギフトへ交換', reward_points: 8000, icon: 'G', max_progress: 1, requires_verification: false, ends_at: null },
  { id: 'demo-event-1', type: 'event', title: '週末ブースト: 提携オファー確認', description: '外部サービス側の完了通知後に確定', reward_points: 12000, icon: 'B', max_progress: 1, requires_verification: true, ends_at: null },
];

const demoOffers: Offer[] = [
  { id: 'offer-1', mission_id: null, title: '新作RPGの事前登録', description: '登録完了後、postback検証で確定', icon_url: null, target_url: null, reward_points: 18000, event_type: 'pre_register', status: 'active' },
  { id: 'offer-2', mission_id: null, title: '30秒動画を視聴', description: '1日10回まで即時付与', icon_url: null, target_url: null, reward_points: 500, event_type: 'video', status: 'active' },
];

export default function Missions() {
<<<<<<< HEAD
  const router = useRouter();
  const [tab, setTab] = useState<MissionType>('daily');
  const [missions, setMissions] = useState<Mission[]>(demoMissions);
  const [completions, setCompletions] = useState<Record<string, MissionCompletion>>({});
<<<<<<< HEAD
=======
  const { busy: offerBusy, run: runOffer } = useAction();
  const [tab, setTab] = useState<MissionType>('daily');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [completions, setCompletions] = useState<Record<string, MissionState>>({});
>>>>>>> codex/points-exchange-ux
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerStatus, setOfferStatus] = useState<Record<string, string>>({});
=======
  const [offers, setOffers] = useState<Offer[]>(demoOffers);
  const [refreshing, setRefreshing] = useState(false);
>>>>>>> codex/mvp-stabilization-20260919
  const [busy, setBusy] = useState<string | null>(null);
<<<<<<< HEAD
  const [offerError, setOfferError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
<<<<<<< HEAD
    const [{ data: ms }, { data: cs }, { data: os }, { data: ocs }] = await Promise.all([
=======

    const [{ data: ms }, { data: cs }, { data: os }] = await Promise.all([
>>>>>>> codex/mvp-stabilization-20260919
=======
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [serviceDate, setServiceDate] = useState<string | null>(null);
  const claimInFlight = useRef<{ userId: string; version: number } | null>(null);
  const readVersion = useRef(0);
  const loadedUser = useRef<string | null>(null);

  const load = useCallback(async (isCurrent: () => boolean) => {
    ++readVersion.current;
    loadedUser.current = null;
    setMissions([]);
    setCompletions({});
    setOffers([]);
    setOfferStatus({});
    setServiceDate(null);
    const { data: u, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!u.user) throw new Error('ログイン状態を確認できません。');
    if (claimInFlight.current && claimInFlight.current.userId !== u.user.id) {
      claimInFlight.current = null;
      setBusy(null);
    }
    const results = await Promise.all([
>>>>>>> codex/points-exchange-ux
      supabase.from('missions').select('*').eq('is_active', true),
      supabase.from('mission_completions').select('*').eq('user_id', u.user.id),
      supabase.from('offers').select('*').eq('status', 'active').limit(20),
      supabase.from('offer_completions').select('user_id,offer_id,status').eq('user_id', u.user.id),
      supabase.rpc('service_today'),
    ]);
<<<<<<< HEAD
<<<<<<< HEAD
    setMissions(ms ?? []);
    const map: Record<string, MissionCompletion> = {};
    (cs ?? []).forEach((c) => { map[c.mission_id] = c; });
=======
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    const [{ data: ms }, { data: cs }, { data: os }, { data: ocs }, { data: day }] = results;
    if (!Array.isArray(ms) || !Array.isArray(cs) || !Array.isArray(os) || !Array.isArray(ocs)) {
      throw new Error('ミッションとオファーの状態を確認できませんでした。');
    }
    if (!ms.every(isMissionRow) || !os.every(isOfferRow)) {
      throw new Error('ミッションまたはオファーの内容を確認できませんでした。');
    }
    if (!cs.every((c) => isMissionCompletionRow(c, u.user.id))
      || !ocs.every((o) => isOfferCompletionRow(o, u.user.id))) {
      throw new Error('達成状況の内容を確認できませんでした。');
    }
    if (!hasUniqueKeys(ms, (m) => m.id) || !hasUniqueKeys(os, (o) => o.id)
      || !hasUniqueKeys(cs, (c) => `${c.mission_id}\u0000${c.period_key}`)) {
      throw new Error('ミッションまたは達成状況に重複があります。');
    }
    if (!day) throw new Error('サービス日付を確認できません。');
    missionPeriodKey('daily', day);
    if (!isCurrent()) return;
    const { data: currentUser, error: currentAuthError } = await supabase.auth.getUser();
    if (currentAuthError || currentUser.user?.id !== u.user.id) {
      throw new Error('ミッションの取得中にログイン状態が変わりました。');
    }
    if (!isCurrent()) return;
    loadedUser.current = u.user.id;
    setMissions(ms);
    const periods = new Map(ms.map((m) => [m.id, missionPeriodKey(m.type, day)]));
    const map: Record<string, MissionState> = {};
    cs.forEach((c) => {
      if (c.period_key === periods.get(c.mission_id)) map[c.mission_id] = c;
    });
>>>>>>> codex/points-exchange-ux
    setCompletions(map);
    setServiceDate(day);
    setOffers(os);
    const om: Record<string, string> = {};
    const offerStates = new Map<string, string[]>();
    ocs.forEach((o) => {
      if (o.offer_id) offerStates.set(o.offer_id, [...(offerStates.get(o.offer_id) ?? []), o.status]);
    });
    offerStates.forEach((statuses, offerId) => {
      const status = offerCompletionStatus(statuses);
      if (status) om[offerId] = status;
    });
    setOfferStatus(om);
    track(EVENTS.missionListView, { count: ms.length });
  }, []);

  const { loading, error, refreshing, reload, onRefresh, cancel } = useLoader(load, { auto: false });
  useFocusEffect(useCallback(() => {
    void reload();
    return () => {
      readVersion.current += 1;
      loadedUser.current = null;
      cancel();
    };
  }, [reload, cancel]));
  const reward = useReward();
=======

<<<<<<< HEAD
    if (ms?.length) setMissions(ms as Mission[]);
    if (os?.length) setOffers(os as Offer[]);
=======
  async function isCurrentAction(userId: string, version: number): Promise<boolean> {
    if (readVersion.current !== version || loadedUser.current !== userId) return false;
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      return !authError && data.user?.id === userId
        && readVersion.current === version && loadedUser.current === userId;
    } catch {
      return false;
    }
  }

  const list = useMemo(() => missions.filter((m) => m.type === tab), [missions, tab]);
>>>>>>> codex/points-exchange-ux

    const map: Record<string, MissionCompletion> = {};
    ((cs as MissionCompletion[]) ?? []).forEach((completion) => {
      map[completion.mission_id] = completion;
    });
    setCompletions(map);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
>>>>>>> codex/mvp-stabilization-20260919

  const list = useMemo(() => missions.filter((mission) => mission.type === tab), [missions, tab]);

<<<<<<< HEAD
  async function claim(m: Mission) {
    const userId = loadedUser.current;
    const version = readVersion.current;
    if (claimInFlight.current || loading || refreshing || error || m.requires_verification || !serviceDate || !userId) return;
    const claimToken = { userId, version };
    claimInFlight.current = claimToken;
    track(EVENTS.missionClaimTap, { mission_id: m.id, type: m.type });
    setBusy(m.id);
    setActionMessage(null);
    const markConfirmed = () => setCompletions((previous) => ({ ...previous,
      [m.id]: { status: 'confirmed', progress: m.max_progress, period_key: missionPeriodKey(m.type, serviceDate) },
    }));
    try {
      if (!await isCurrentAction(userId, version)) {
        setActionMessage('ログイン状態を確認できませんでした。報酬は申請していません。再読み込みしてください。');
        await reload();
        return;
      }
      const { data, error: claimError } = await supabase.rpc('claim_mission', { p_mission_id: m.id });
      if (!await isCurrentAction(userId, version)) {
        if (loadedUser.current && loadedUser.current !== userId) return;
        setActionMessage('受取中に画面またはアカウントが変わりました。ポイント履歴で受取結果をご確認ください。');
        await reload();
        return;
      }
      if (claimError) {
        const alreadyClaimed = claimError.message.includes('mission already claimed');
        if (alreadyClaimed) markConfirmed();
        setActionMessage(alreadyClaimed ? 'この報酬はすでに受取済みです。表示を更新しました。'
          : '報酬を受け取れませんでした。最新の状態を確認してから、もう一度お試しください。');
        await reload();
        return;
      }
      const result = data as { ok?: boolean; reward?: number } | null;
      if (result?.ok !== true) {
        setActionMessage('この報酬は現在受け取れません。画面を更新して状態をご確認ください。');
        await reload();
        return;
      }
      markConfirmed();
      if (typeof result.reward === 'number' && Number.isSafeInteger(result.reward) && result.reward > 0) {
        track(EVENTS.missionClaimed, { mission_id: m.id, reward: result.reward });
        reward.show(result.reward, m.title);
      } else {
        setActionMessage('受取結果のポイント数を確認できませんでした。ポイント履歴をご確認ください。');
      }
      await reload();
    } catch {
      if (loadedUser.current && loadedUser.current !== userId) return;
      setActionMessage('通信結果を確認できませんでした。再申請する前に、画面を更新して受取状態をご確認ください。');
      await reload();
    } finally {
      if (claimInFlight.current === claimToken) {
        claimInFlight.current = null;
        setBusy(null);
      }
    }
  }

  // オファー挑戦：クリックを記録（日次上限を確認）→ 外部へ遷移。
  // 達成 → ネットワークの postback → confirm_offer で確定付与される（アプリ内では「確認中」表示）。
  async function openOffer(o: Offer) {
    if (loading || refreshing || error || offerBusy) return;
    const userId = loadedUser.current;
    const version = readVersion.current;
    if (!userId) return;
    await runOffer(async () => {
    const offerUrl = safeOfferUrl(o.offer_url);
    if (!offerUrl) { Alert.alert('準備中', 'このオファーのリンクは現在ご利用いただけません。'); return; }
    if (!await isCurrentAction(userId, version)) {
      Alert.alert('開けませんでした', 'ログイン状態が変わりました。再読み込みしてからお試しください。');
      await reload();
      return;
    }
    track(EVENTS.offerTap, { offer_id: o.id });
    const { data, error: recErr } = await supabase.rpc('record_ad_impression', {
      p_placement: 'offerwall', p_ad_type: 'offerwall', p_network_id: o.network_id,
    });
    if (!await isCurrentAction(userId, version)) {
      Alert.alert('開けませんでした', '操作中に画面またはアカウントが変わりました。再読み込みしてからお試しください。');
      await reload();
      return;
    }
    if (recErr) { Alert.alert('開けませんでした', recErr.message); return; }
    const result = data as { ok?: boolean; remaining?: number } | null;
    if (result?.ok !== true || typeof result.remaining !== 'number'
      || !Number.isSafeInteger(result.remaining) || result.remaining < 0) {
      Alert.alert('開けませんでした', '利用状況を確認できませんでした。時間をおいて再度お試しください。');
      return;
    }
    if (result.remaining === 0) {
      Alert.alert('本日の上限に達しました', '提携オファーの獲得は1日の上限があります。また明日お試しください。');
      return;
    }
    const can = await Linking.canOpenURL(offerUrl).catch(() => false);
    if (!await isCurrentAction(userId, version)) return;
    if (!can) { Alert.alert('開けませんでした', 'リンクを開けませんでした。'); return; }
    await Linking.openURL(offerUrl);
    if (!await isCurrentAction(userId, version)) return;
    Alert.alert('達成後に確定します', '外部で条件を達成すると、確認後にポイントが付与されます（アプリでは「確認中」と表示されます）。');
<<<<<<< HEAD
=======
  async function claim(mission: Mission) {
    setBusy(mission.id);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || mission.id.startsWith('demo-')) {
      setBusy(null);
      setCompletions((current) => ({
        ...current,
        [mission.id]: {
          id: `${mission.id}-completion`,
          mission_id: mission.id,
          status: mission.requires_verification ? 'pending' : 'confirmed',
          progress: mission.max_progress,
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      }));
      return;
    }

    const { error } = await supabase.rpc('claim_mission', { p_mission_id: mission.id });
    setBusy(null);
    if (error) {
      Alert.alert('受け取りできませんでした', error.message);
      return;
    }
    load();
>>>>>>> codex/mvp-stabilization-20260919
  }

  async function startOffer(offer: Offer) {
    if (busy) return;
    setBusy(offer.id);
    setOfferError(null);

    try {
      let clickId: string;

      if (!hasSupabaseConfig || offer.id.startsWith('offer-')) {
        clickId = `demo-${Date.now()}`;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          Alert.alert('ログインが必要です', 'オファーを開始するにはログインしてください。');
          return;
        }
        if (!offer.mission_id) {
          Alert.alert('開始できません', 'このオファーには検証用ミッションが設定されていません。');
          return;
        }

        const { data, error } = await supabase.rpc('track_click', {
          p_mission_id: offer.mission_id,
        });
        if (error) throw error;
        if (typeof data !== 'string' || !data) throw new Error('click_id を発行できませんでした');
        clickId = data;
      }

      if (offer.target_url) {
        await Linking.openURL(appendQuery(offer.target_url, { click_id: clickId, offer_id: offer.id }));
      } else {
        router.push({
          pathname: '/offer-test',
          params: {
            click_id: clickId,
            offer_id: offer.id,
            offer_title: offer.title,
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : JSON.stringify(error);
      setOfferError(message);
      Alert.alert('オファーを開始できませんでした', message);
    } finally {
      setBusy(null);
    }
=======
    }, 'オファーを開けませんでした');
>>>>>>> codex/points-exchange-ux
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
<<<<<<< HEAD
      {reward.node}
      <Text style={s.h}>ミッション</Text>
=======
      <View style={s.header}>
        <Text style={s.h}>ミッション</Text>
        <Text style={s.sub}>毎日の小さな達成をポイントに変える</Text>
      </View>
>>>>>>> codex/mvp-stabilization-20260919

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsWrap} contentContainerStyle={s.tabs}>
        {tabs.map((item) => (
          <Pressable key={item.key} style={[s.tab, tab === item.key && s.tabOn]} onPress={() => setTab(item.key)}>
            <Text style={[s.tabText, tab === item.key && s.tabTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

<<<<<<< HEAD
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}
        {actionMessage && <Text accessibilityRole="alert" style={s.actionMessage}>{actionMessage}</Text>}

        {!loading && !error && list.length === 0 && <Text style={s.empty}>このカテゴリのミッションはありません</Text>}
        {list.map((m) => {
          const c = completions[m.id];
          const done = c?.status === 'confirmed';
          const pending = c?.status === 'pending';
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
        {tab === 'event' && (
          <View style={s.fireBanner}>
            <Text style={s.fireTitle}>週末限定ブースト</Text>
            <Text style={s.fireText}>イベントミッションは期限と検証状態をはっきり見せます。</Text>
          </View>
        )}

        {list.length === 0 && <Text style={s.empty}>このカテゴリのミッションはまだありません</Text>}
        {list.map((mission) => {
          const completion = completions[mission.id];
          const done = completion?.status === 'confirmed';
          const pending = completion?.status === 'pending';
>>>>>>> codex/mvp-stabilization-20260919
          return (
            <View key={mission.id} style={s.card}>
              <View style={s.iconBox}>
                <Text style={s.iconText}>{mission.icon ?? 'M'}</Text>
              </View>
              <View style={{ flex: 1 }}>
<<<<<<< HEAD
                <Text style={s.title}>{m.icon ? `${m.icon} ` : ''}{m.title}</Text>
                {m.description && <Text style={s.desc} numberOfLines={2}>{m.description}</Text>}
                <Text style={s.reward}>＋{m.reward_points} P{m.requires_verification ? ' ・ 検証あり' : ''}</Text>
                {m.max_progress > 1 && !done && (
                  <View style={s.progressWrap}>
                    <View style={s.progressTrack}>
                      <View style={[s.progressFill, { width: `${Math.min(100, ((c?.progress ?? 0) / m.max_progress) * 100)}%` }]} />
                    </View>
                    <Text style={s.progressText}>{c?.progress ?? 0} / {m.max_progress}</Text>
                  </View>
                )}
=======
                <Text style={s.title}>{mission.title}</Text>
                {!!mission.description && <Text style={s.desc} numberOfLines={2}>{mission.description}</Text>}
                <Text style={s.reward}>+{mission.reward_points.toLocaleString()} P{mission.requires_verification ? ' ・ 検証あり' : ''}</Text>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: done || pending ? '100%' : '42%' }]} />
                </View>
                <Text style={s.progress}>{done || pending ? '1 / 1' : '進行中'}</Text>
>>>>>>> codex/mvp-stabilization-20260919
              </View>
              {done ? (
                <View style={[s.badge, s.badgeOk]}><Text style={s.badgeOkText}>完了</Text></View>
              ) : pending ? (
                <View style={[s.badge, s.badgeWarn]}><Text style={s.badgeWarnText}>検証中</Text></View>
              ) : m.requires_verification ? (
                <Text style={s.verificationHint}>条件達成後に自動反映</Text>
              ) : (
<<<<<<< HEAD
                <Pressable style={[s.btn, busy === mission.id && { opacity: 0.5 }]} disabled={busy === mission.id} onPress={() => claim(mission)}>
                  <Text style={s.btnText}>{busy === mission.id ? '...' : '挑戦'}</Text>
=======
                <Pressable accessibilityRole="button" style={[s.btn, busy !== null && { opacity: 0.5 }]}
                  disabled={busy !== null || loading || refreshing || !!error} onPress={() => claim(m)}>
                  <Text style={s.btnText}>{busy === m.id ? '受取中…' : '達成'}</Text>
>>>>>>> codex/points-exchange-ux
                </Pressable>
              )}
            </View>
          );
        })}

<<<<<<< HEAD
        {offers.length > 0 && (
          <>
            <Text style={s.section}>提携オファー（オファーウォール / 動画リワード）</Text>
            {offers.map((o) => {
              const st = offerStatus[o.id];
              const confirmed = st === 'confirmed';
              const pending = st === 'pending';
              return (
                <View key={o.id} style={[s.card, { borderColor: '#d7c9a0', backgroundColor: '#fffdf6' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{o.title}</Text>
                    {o.description && <Text style={s.desc} numberOfLines={2}>{o.description}</Text>}
                    <Text style={s.reward}>＋{o.reward_points} P ・ {o.event_type ?? 'offer'}</Text>
                  </View>
                  {confirmed ? (
                    <View style={[s.badge, s.badgeOk]}><Text style={s.badgeOkText}>✓ 獲得</Text></View>
                  ) : pending ? (
                    <View style={[s.badge, s.badgeWarn]}><Text style={s.badgeWarnText}>確認中</Text></View>
                  ) : (
                    <Pressable style={[s.btn, (loading || refreshing || !!error || offerBusy) && { opacity: 0.5 }]}
                      disabled={loading || refreshing || !!error || offerBusy}
                      onPress={() => openOffer(o).catch(() => {})}>
                      <Text style={s.btnText}>挑戦</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            <Text style={s.hint}>※ オファーは外部ネットワークで達成 → postback検証後に「確定」で付与されます。</Text>
          </>
        )}
=======
        <Text style={s.section}>提携オファー</Text>
        <View style={s.offerLead}>
          <Text style={s.offerLeadTitle}>外部成果は postback 検証後に確定</Text>
          <Text style={s.offerLeadText}>広告感が強くなりすぎないよう、後で実写寄りのサムネイルへ差し替えます。</Text>
        </View>
        {!!offerError && <Text style={s.offerError}>開始エラー: {offerError}</Text>}
        {offers.map((offer) => (
          <Pressable
            key={offer.id}
            style={[s.offer, busy === offer.id && { opacity: 0.55 }]}
            disabled={busy !== null}
            onPress={() => startOffer(offer)}
          >
            <View style={s.offerThumb}>
              <VisualSlot tone="offer" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{offer.title}</Text>
              {!!offer.description && <Text style={s.desc} numberOfLines={2}>{offer.description}</Text>}
              <Text style={s.reward}>+{offer.reward_points.toLocaleString()} P ・ {offer.event_type ?? 'offer'}</Text>
            </View>
            <View style={[s.badge, s.badgeWarn]}>
              <Text style={s.badgeWarnText}>{busy === offer.id ? '開始中' : '開く'}</Text>
            </View>
          </Pressable>
        ))}
>>>>>>> codex/mvp-stabilization-20260919
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  h: { fontSize: 21, fontWeight: '900', color: colors.ink },
  sub: { color: colors.sub, fontSize: 12, fontWeight: '700', marginTop: 3 },
  tabsWrap: { flexGrow: 0 },
  tabs: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 999, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontSize: 12, fontWeight: '800', color: colors.sub },
  tabTextOn: { color: '#fff' },
  content: { padding: 16, paddingBottom: 32 },
  fireBanner: { backgroundColor: '#fdecea', borderWidth: 1, borderColor: '#f3c6c0', borderRadius: 13, padding: 12, marginBottom: 12 },
  fireTitle: { color: '#a13226', fontWeight: '900', fontSize: 13 },
  fireText: { color: '#a13226', fontWeight: '700', fontSize: 11, marginTop: 3 },
  empty: { color: colors.muted, fontSize: 13 },
<<<<<<< HEAD
<<<<<<< HEAD
=======
  actionMessage: { color: colors.ink, backgroundColor: colors.warnSoft, borderWidth: 1, borderColor: colors.warn, borderRadius: 12, padding: 13, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  verificationHint: { color: colors.sub, fontSize: 11, lineHeight: 17, maxWidth: 95, marginLeft: 10 },
>>>>>>> codex/points-exchange-ux
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  title: { fontSize: 13, fontWeight: '700', color: colors.ink },
  desc: { fontSize: 12, color: colors.sub, marginTop: 3 },
  reward: { fontSize: 11, color: colors.gold, fontWeight: '800', marginTop: 5 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  progressText: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
=======
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 13, marginBottom: 10, gap: 12 },
  iconBox: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  title: { fontSize: 13, fontWeight: '800', color: colors.ink, lineHeight: 18 },
  desc: { fontSize: 12, color: colors.sub, marginTop: 3, lineHeight: 17 },
  reward: { fontSize: 11, color: colors.gold, fontWeight: '900', marginTop: 5 },
  bar: { height: 7, backgroundColor: colors.line, borderRadius: 99, overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 99 },
  progress: { fontSize: 10, color: colors.muted, marginTop: 4 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
>>>>>>> codex/mvp-stabilization-20260919
  badge: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
  badgeOk: { backgroundColor: colors.okSoft },
  badgeOkText: { color: colors.ok, fontWeight: '900', fontSize: 12 },
  badgeWarn: { backgroundColor: colors.warnSoft },
  badgeWarnText: { color: colors.warn, fontWeight: '900', fontSize: 12 },
  section: { fontSize: 12, fontWeight: '900', color: colors.sub, marginTop: 18, marginBottom: 10, letterSpacing: 0.4 },
  offerLead: { backgroundColor: '#e7f3ec', borderRadius: 13, padding: 12, marginBottom: 10 },
  offerLeadTitle: { color: '#1f7a5b', fontWeight: '900', fontSize: 13 },
  offerLeadText: { color: '#447765', fontWeight: '700', fontSize: 11, marginTop: 3, lineHeight: 16 },
  offerError: { color: colors.danger, fontWeight: '800', fontSize: 12, marginBottom: 10 },
  offer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffdf6', borderWidth: 1, borderColor: '#e8d7a9', borderRadius: 14, padding: 13, marginBottom: 10, gap: 12 },
  offerThumb: { width: 50, height: 50, borderRadius: 12, overflow: 'hidden' },
});

function appendQuery(url: string, params: Record<string, string>) {
  const separator = url.includes('?') ? '&' : '?';
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${url}${separator}${query}`;
}
