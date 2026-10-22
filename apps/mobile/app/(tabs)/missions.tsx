import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Linking } from 'react-native';
import { AppAlert as Alert } from '@/components/AppAlert';
import { useAction } from '@/lib/useAction';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { missionPeriodKey } from '@/lib/missionPeriod';
import { attributedOfferUrl, safeOfferUrl } from '@/lib/offerUrl';
import { isMissionRow, isMissionCompletionRow, isOfferRow, isOfferCompletionRow, hasUniqueKeys, offerCompletionStatus } from '@/lib/missionRows';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { useReward } from '@/components/RewardToast';
import type { Mission, MissionType, MissionCompletion, Offer } from '@/lib/types';
import { track, EVENTS } from '@/lib/analytics';

type MissionState = Pick<MissionCompletion, 'status' | 'progress' | 'period_key'>;

const TABS: { key: MissionType; label: string }[] = [
  { key: 'daily', label: 'デイリー' },
  { key: 'weekly', label: 'ウィークリー' },
  { key: 'achievement', label: '実績' },
  { key: 'event', label: '期間限定' },
];

/**
 * ミッション（prototype core-flow.html のミッションに対応）。
 * 種別タブ・提携オファー・postback検証ステータス（検証中→確定）。
 */
export default function Missions() {
  const { busy: offerBusy, run: runOffer } = useAction();
  const [tab, setTab] = useState<MissionType>('daily');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [completions, setCompletions] = useState<Record<string, MissionState>>({});
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerStatus, setOfferStatus] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
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
      supabase.from('missions').select('*').eq('is_active', true),
      supabase.from('mission_completions').select('*').eq('user_id', u.user.id),
      supabase.from('offers').select('*').eq('status', 'active').limit(20),
      supabase.from('offer_completions').select('user_id,offer_id,status').eq('user_id', u.user.id),
      supabase.rpc('service_today'),
    ]);
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
    const destination = safeOfferUrl(o.offer_url) ?? safeOfferUrl(o.target_url);
    if (!destination || !o.mission_id) {
      Alert.alert('準備中', 'このオファーのリンクまたは検証用ミッションは現在ご利用いただけません。');
      return;
    }
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
    const offerUrl = await attributedOfferUrl(o, async (missionId) => {
      const { data: clickId, error: clickError } = await supabase.rpc('track_click', { p_mission_id: missionId });
      if (clickError) throw clickError;
      return clickId as string;
    });
    if (!await isCurrentAction(userId, version)) return;
    if (!offerUrl) { Alert.alert('開けませんでした', 'リンクを確認できませんでした。'); return; }
    const can = await Linking.canOpenURL(offerUrl).catch(() => false);
    if (!await isCurrentAction(userId, version)) return;
    if (!can) { Alert.alert('開けませんでした', 'リンクを開けませんでした。'); return; }
    await Linking.openURL(offerUrl);
    if (!await isCurrentAction(userId, version)) return;
    Alert.alert('達成後に確定します', '外部で条件を達成すると、確認後にポイントが付与されます（アプリでは「確認中」と表示されます）。');
    }, 'オファーを開けませんでした');
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {reward.node}
      <Text style={s.h}>ミッション</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsWrap} contentContainerStyle={s.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={[s.tab, tab === t.key && s.tabOn]} onPress={() => setTab(t.key)}>
            <Text style={[s.tabText, tab === t.key && s.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

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
          return (
            <View key={m.id} style={s.card}>
              <View style={{ flex: 1 }}>
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
              </View>
              {done ? (
                <View style={[s.badge, s.badgeOk]}><Text style={s.badgeOkText}>✓ 完了</Text></View>
              ) : pending ? (
                <View style={[s.badge, s.badgeWarn]}><Text style={s.badgeWarnText}>検証中</Text></View>
              ) : m.requires_verification ? (
                <Text style={s.verificationHint}>条件達成後に自動反映</Text>
              ) : (
                <Pressable accessibilityRole="button" style={[s.btn, busy !== null && { opacity: 0.5 }]}
                  disabled={busy !== null || loading || refreshing || !!error} onPress={() => claim(m)}>
                  <Text style={s.btnText}>{busy === m.id ? '受取中…' : '達成'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}

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
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h: { fontSize: 20, fontWeight: '800', color: colors.ink, paddingHorizontal: 16, paddingTop: 6 },
  tabsWrap: { flexGrow: 0 },
  tabs: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontSize: 12, fontWeight: '800', color: colors.sub },
  tabTextOn: { color: '#fff' },
  empty: { color: colors.muted, fontSize: 13 },
  actionMessage: { color: colors.ink, backgroundColor: colors.warnSoft, borderWidth: 1, borderColor: colors.warn, borderRadius: 12, padding: 13, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  verificationHint: { color: colors.sub, fontSize: 11, lineHeight: 17, maxWidth: 95, marginLeft: 10 },
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
  badge: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
  badgeOk: { backgroundColor: colors.okSoft },
  badgeOkText: { color: colors.ok, fontWeight: '800', fontSize: 12 },
  badgeWarn: { backgroundColor: colors.warnSoft },
  badgeWarnText: { color: colors.warn, fontWeight: '800', fontSize: 12 },
  section: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 22, marginBottom: 10 },
  hint: { fontSize: 11, color: colors.muted, marginTop: 8, lineHeight: 16 },
});
