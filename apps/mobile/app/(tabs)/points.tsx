<<<<<<< HEAD
<<<<<<< HEAD
import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
=======
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
>>>>>>> codex/points-exchange-ux
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, pointsToYen } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { formatDate } from '@/lib/notifications';
<<<<<<< HEAD
import type { LedgerEntry, VipInfo, StakingAccrual, Wallet } from '@/lib/types';
=======
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { colors, pointsToYen } from '@/lib/theme';
import type { LedgerEntry, StakingAccrual, VipInfo, Wallet } from '@/lib/types';

const demoWallet: Wallet = {
  user_id: 'demo',
  balance: 125000,
  lifetime_earned: 386000,
  lifetime_spent: 261000,
};

const demoLedger: LedgerEntry[] = [
  { id: 'l1', delta: 3000, reason: 'mission', ref_type: null, status: 'confirmed', created_at: new Date().toISOString() },
  { id: 'l2', delta: 12000, reason: 'offer', ref_type: null, status: 'pending', created_at: new Date(Date.now() - 3600 * 1000).toISOString() },
  { id: 'l3', delta: -50000, reason: 'exchange', ref_type: null, status: 'confirmed', created_at: new Date(Date.now() - 86400 * 1000).toISOString() },
  { id: 'l4', delta: 8400, reason: 'staking', ref_type: null, status: 'confirmed', created_at: new Date(Date.now() - 86400 * 1000 * 7).toISOString() },
];

const demoStaking: StakingAccrual[] = [
  { id: 's1', period: '2026-06-01', base_balance: 120000, rate_bps: 150, accrued_points: 1800, created_at: '' },
  { id: 's2', period: '2026-05-01', base_balance: 94000, rate_bps: 150, accrued_points: 1410, created_at: '' },
];
>>>>>>> codex/mvp-stabilization-20260919

export default function Points() {
<<<<<<< HEAD
=======
import type { ExchangeItem, LedgerEntry, VipInfo, StakingAccrual, Wallet } from '@/lib/types';

type Section = 'exchange' | 'history';
const REQUEST_PAGE_SIZE = 20;
const REQUEST_COLUMNS = 'id,user_id,item_id,cost_points,status,requested_at,code';
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ExchangeRequest = {
  id: string;
  user_id: string;
  item_id: string;
  cost_points: number;
  status: 'processing' | 'fulfilled' | 'cancelled';
  requested_at: string;
  code: string | null;
};

/** ポイント・交換・履歴を一画面にまとめ、残高を見てすぐ交換できるようにする。 */
export default function Points() {
  const { section: requestedSection, request_id: requestedRequest } = useLocalSearchParams<{ section?: string; request_id?: string }>();
  const hasRequestedRequest = !!requestedRequest;
  const requestedRequestId = typeof requestedRequest === 'string' && REQUEST_ID_PATTERN.test(requestedRequest) ? requestedRequest : null;
  const [section, setSection] = useState<Section>(() => requestedSection === 'history' ? 'history' : 'exchange');
>>>>>>> codex/points-exchange-ux
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);
  const [exchangeRequests, setExchangeRequests] = useState<ExchangeRequest[]>([]);
  const [focusedRequest, setFocusedRequest] = useState<ExchangeRequest | null>(null);
  const [requestLookupMessage, setRequestLookupMessage] = useState<string | null>(null);
  const [hasMoreRequests, setHasMoreRequests] = useState(false);
  const [loadingMoreRequests, setLoadingMoreRequests] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [vip, setVip] = useState<VipInfo | null>(null);
  const [staking, setStaking] = useState<StakingAccrual[]>([]);
  const [expiresOn, setExpiresOn] = useState<string | null>(null);
<<<<<<< HEAD
=======
  const [wallet, setWallet] = useState<Wallet | null>(demoWallet);
  const [ledger, setLedger] = useState<LedgerEntry[]>(demoLedger);
  const [vip, setVip] = useState<VipInfo | null>({ user_id: 'demo', xp: 6400, tier_name: 'シルバー', staking_rate_bps: 150 });
  const [staking, setStaking] = useState<StakingAccrual[]>(demoStaking);
  const [refreshing, setRefreshing] = useState(false);
>>>>>>> codex/mvp-stabilization-20260919

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
<<<<<<< HEAD
    const [{ data: w }, { data: l }, { data: v }, { data: st }, { data: ex }] = await Promise.all([
=======

    const [{ data: w }, { data: l }, { data: v }, { data: st }] = await Promise.all([
>>>>>>> codex/mvp-stabilization-20260919
=======
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ExchangeItem | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const exchangeInFlight = useRef(false);
  const historyVersion = useRef(0);
  const historyOwner = useRef<string | null>(null);
  const historyPageAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (requestedSection === 'history' || requestedSection === 'exchange') {
      setSection(requestedSection);
    }
  }, [requestedSection]);

  const load = useCallback(async (isCurrent: () => boolean) => {
    const version = ++historyVersion.current;
    setSelectedItem(null);
    setWallet(null);
    setLedger([]);
    setExchangeItems([]);
    setExchangeRequests([]);
    setFocusedRequest(null);
    setHasMoreRequests(false);
    setLoadMoreError(null);
    setVip(null);
    setStaking([]);
    setExpiresOn(null);
    historyOwner.current = null;
    historyPageAbort.current?.abort();
    historyPageAbort.current = null;
    setLoadingMoreRequests(false);
    setRequestLookupMessage(null);
    const { data: u, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!u.user) throw new Error('ログイン状態を確認できません。');
    const results = await Promise.all([
>>>>>>> codex/points-exchange-ux
      supabase.from('point_wallets').select('*').eq('user_id', u.user.id).single(),
      supabase.from('point_ledger').select('*').eq('user_id', u.user.id).order('created_at', { ascending: false }).limit(40),
      supabase.from('exchange_items').select('*').eq('is_active', true).order('sort'),
      supabase.from('exchange_requests').select(REQUEST_COLUMNS).eq('user_id', u.user.id)
        .order('requested_at', { ascending: false }).order('id', { ascending: false }).limit(REQUEST_PAGE_SIZE + 1),
      supabase.from('user_vip').select('*').eq('user_id', u.user.id).single(),
      supabase.from('staking_accruals').select('*').eq('user_id', u.user.id).order('period', { ascending: false }).limit(6),
      supabase.from('wallet_expiry').select('expires_on').eq('user_id', u.user.id).single(),
      requestedRequestId
        ? supabase.from('exchange_requests').select(REQUEST_COLUMNS).eq('user_id', u.user.id).eq('id', requestedRequestId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
<<<<<<< HEAD
<<<<<<< HEAD
    setWallet(w ?? null);
    setLedger(l ?? []);
=======
    if (version !== historyVersion.current || !isCurrent()) return;
    const failed = results.slice(0, 7).find((result) => result.error);
    if (failed?.error) throw failed.error;
    const [{ data: w }, { data: l }, { data: items }, { data: requests }, { data: v }, { data: st }, { data: ex }, target] = results;
    if (!isWallet(w, u.user.id)
      || !Array.isArray(l) || !l.every((entry) => isLedgerEntry(entry, u.user.id))
      || !Array.isArray(items) || !items.every(isExchangeItem) || !Array.isArray(requests)
      || !requests.every((request) => isExchangeRequest(request, u.user.id))
      || !isVipInfo(v, u.user.id) || !Array.isArray(st)
      || !st.every((accrual) => isStakingAccrual(accrual, u.user.id))
      || !isWalletExpiry(ex, u.user.id)) {
      throw new Error('ポイント残高と交換履歴を確認できませんでした。');
    }
    setWallet(w);
    setLedger(l);
    setExchangeItems(items);
    setExchangeRequests(requests.slice(0, REQUEST_PAGE_SIZE));
    setHasMoreRequests(requests.length > REQUEST_PAGE_SIZE);
    historyOwner.current = u.user.id;
    setLoadMoreError(null);
    const targetRequest = requestedRequestId && isExchangeRequest(target.data, u.user.id)
      && target.data.id.toLowerCase() === requestedRequestId.toLowerCase() ? target.data : null;
    setFocusedRequest(targetRequest);
    setRequestLookupMessage(target.error || (target.data && !targetRequest)
      ? '通知の交換申請を取得できませんでした。再読み込みしてご確認ください。'
      : hasRequestedRequest && !targetRequest ? '指定された交換申請が見つかりませんでした。ご自身の交換履歴をご確認ください。' : null);
>>>>>>> codex/points-exchange-ux
    setVip(v ?? null);
    setStaking(st);
    setExpiresOn((ex as { expires_on: string | null } | null)?.expires_on ?? null);
  }, [hasRequestedRequest, requestedRequestId]);

  useEffect(() => () => {
    historyVersion.current += 1;
    historyPageAbort.current?.abort();
  }, []);

<<<<<<< HEAD
  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);
=======

    if (w) setWallet(w as Wallet);
    if (l?.length) setLedger(l as LedgerEntry[]);
    if (v) setVip(v as VipInfo);
    if (st?.length) setStaking(st as StakingAccrual[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
>>>>>>> codex/mvp-stabilization-20260919

  const spark = useMemo(() => {
    const balance = wallet?.balance ?? 0;
<<<<<<< HEAD
    // 末尾（現在）= balance から逆算して各時点の残高列を作る
    let running = balance;
    const seriesDesc: number[] = [balance];
    for (const e of ledger) { running -= e.delta; seriesDesc.push(running); }
    const series = seriesDesc.reverse(); // 古い→新しい
=======
    let running = balance;
    const seriesDesc: number[] = [balance];
    for (const entry of ledger) {
      running -= entry.delta;
      seriesDesc.push(running);
    }
    const series = seriesDesc.reverse();
>>>>>>> codex/mvp-stabilization-20260919
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const range = Math.max(max - min, 1);
    return series.slice(-18).map((value) => (value - min) / range);
  }, [ledger, wallet]);
=======
  const { loading, error, refreshing, reload, onRefresh, cancel } = useLoader(load, { auto: false });
  useFocusEffect(useCallback(() => {
    void reload();
    return cancel;
  }, [reload, cancel]));
  const balance = wallet?.balance ?? 0;
  const walletCurrent = !!wallet && !loading && !refreshing && !error;
  const visibleRequests = useMemo(() => focusedRequest
    ? [focusedRequest, ...exchangeRequests.filter((request) => request.id !== focusedRequest.id)]
    : exchangeRequests, [exchangeRequests, focusedRequest]);
  const itemNames = useMemo(() => new Map(exchangeItems.map((item) => [item.id, item.name])), [exchangeItems]);
  const availableItems = useMemo(() => exchangeItems.filter((item) => item.is_active), [exchangeItems]);
  const canExchangeAny = availableItems.some((item) =>
    balance >= item.cost_points && (item.stock === null || item.stock > 0));
  const nextGoal = useMemo(() => availableItems
    .filter((item) => item.cost_points > balance && (item.stock === null || item.stock > 0))
    .sort((a, b) => a.cost_points - b.cost_points)[0] ?? null, [availableItems, balance]);

  const spark = useMemo(() => {
    let running = balance;
    const descending = [balance];
    for (const entry of ledger) {
      // pending / rejected は残高に反映されていないため、推移の復元には使わない。
      if (entry.status !== 'confirmed') continue;
      running -= entry.delta;
      descending.push(running);
    }
    const series = descending.reverse();
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const range = Math.max(max - min, 1);
    return series.slice(-20).map((value) => (value - min) / range);
  }, [balance, ledger]);
>>>>>>> codex/points-exchange-ux

  async function loadMoreRequests() {
    const cursor = exchangeRequests[exchangeRequests.length - 1];
    const userId = historyOwner.current;
    if (!cursor || !userId || !hasMoreRequests || historyPageAbort.current || loading || refreshing || error) return;
    const version = historyVersion.current;
    const controller = new AbortController();
    historyPageAbort.current = controller;
    setLoadingMoreRequests(true);
    setLoadMoreError(null);
    try {
      const { data, error: pageError } = await supabase.from('exchange_requests').select(REQUEST_COLUMNS).eq('user_id', userId)
        .order('requested_at', { ascending: false }).order('id', { ascending: false })
        .or(`requested_at.lt.${cursor.requested_at},and(requested_at.eq.${cursor.requested_at},id.lt.${cursor.id})`)
        .limit(REQUEST_PAGE_SIZE + 1).abortSignal(controller.signal);
      if (version !== historyVersion.current) return;
      if (pageError) throw pageError;
      if (!Array.isArray(data) || !data.every((request) => isExchangeRequest(request, userId))) {
        throw new Error('Invalid exchange history page');
      }
      const next = data.slice(0, REQUEST_PAGE_SIZE);
      setExchangeRequests((previous) => {
        const ids = new Set(previous.map((request) => request.id));
        return [...previous, ...next.filter((request) => !ids.has(request.id))];
      });
      setHasMoreRequests(data.length > REQUEST_PAGE_SIZE);
    } catch {
      if (version === historyVersion.current) setLoadMoreError('過去の交換申請を読み込めませんでした。表示中の履歴はそのまま確認できます。');
    } finally {
      if (historyPageAbort.current === controller) {
        historyPageAbort.current = null;
        setLoadingMoreRequests(false);
      }
    }
  }

  async function doExchange(item: ExchangeItem) {
    if (exchangeInFlight.current || !walletCurrent) return;
    exchangeInFlight.current = true;
    const ownerId = historyOwner.current;
    const ownerVersion = historyVersion.current;
    let requestSent = false;
    const exchangeContext = async (): Promise<'current' | 'account-changed' | 'view-changed' | 'unverified'> => {
      try {
        const { data, error: userError } = await supabase.auth.getUser();
        if (userError || !ownerId) return 'unverified';
        if (data.user?.id !== ownerId) return 'account-changed';
        return historyOwner.current === ownerId && historyVersion.current === ownerVersion
          ? 'current' : 'view-changed';
      } catch {
        return 'unverified';
      }
    };
    const contextMessage = (context: 'account-changed' | 'view-changed' | 'unverified', sent: boolean) => {
      if (context === 'account-changed') return sent
        ? 'ログイン状態が変わりました。交換申請の結果は現在のアカウントでは確認できません。'
        : 'ログイン状態が変わりました。交換を申請せず、現在のアカウントの情報を読み込み直します。';
      if (context === 'view-changed') return sent
        ? '画面の情報が更新されました。交換申請の結果は履歴と残高を再確認してください。'
        : '画面の情報が更新されました。交換を申請せず、最新の情報を読み込み直します。';
      return sent
        ? 'ログイン状態を確認できませんでした。再申請する前に交換履歴と残高をご確認ください。'
        : 'ログイン状態を確認できませんでした。交換は申請していません。再読み込みしてお試しください。';
    };
    setSelectedItem(null);
    setBusy(item.id);
    setFeedback(null);
    try {
      const beforeSend = await exchangeContext();
      if (beforeSend !== 'current') {
        setFeedback({ kind: 'warning', message: contextMessage(beforeSend, false) });
        await reload();
        return;
      }
      requestSent = true;
      const { data: exchangeResult, error: exchangeError } = await supabase.rpc('request_exchange', { p_item_id: item.id });
      const afterSend = await exchangeContext();
      if (afterSend !== 'current') {
        setFeedback({ kind: 'warning', message: contextMessage(afterSend, true) });
        await reload();
        return;
      }
      if (exchangeError) {
        setFeedback({ kind: 'error', message: exchangeError.message.includes('insufficient points')
          ? 'ポイントが不足しています。残高を更新してご確認ください。'
          : exchangeError.message.includes('out of stock')
            ? 'このアイテムは売り切れました。交換アイテム一覧を更新してください。'
            : exchangeError.message.includes('item not found')
              ? 'このアイテムは現在交換できません。一覧を更新してください。'
              : '交換申請を受け付けられませんでした。交換履歴と残高をご確認ください。' });
        await reload();
        return;
      }
      if (!isConfirmedExchangeResult(exchangeResult)) {
        setSection('history');
        setFeedback({ kind: 'warning', message: '交換申請の結果を確認できませんでした。再申請する前に、交換履歴と残高を更新して申請状況をご確認ください。' });
        await reload();
        return;
      }
      setSection('history');
      setFeedback({ kind: 'success', message: `「${item.name}」を交換申請しました。進捗は交換申請の一覧から確認できます。` });
      await reload();
    } catch {
      const context = await exchangeContext();
      if (requestSent) setSection('history');
      setFeedback({ kind: 'warning', message: context !== 'current' ? contextMessage(context, requestSent)
        : requestSent
          ? '通信結果を確認できませんでした。再申請する前に、交換履歴と残高を更新して申請状況をご確認ください。'
          : 'ログイン状態を確認できませんでした。交換は申請していません。再読み込みしてお試しください。' });
      await reload();
    } finally {
      exchangeInFlight.current = false;
      setBusy(null);
    }
  }

  function confirmExchange(item: ExchangeItem) {
    if (!exchangeInFlight.current && walletCurrent) setSelectedItem(item);
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
<<<<<<< HEAD
<<<<<<< HEAD
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

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
=======
      <ScrollView contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
>>>>>>> codex/points-exchange-ux
        <Text style={s.h}>ポイント</Text>
        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}
        {feedback && (
          <View accessibilityRole="alert" style={[s.feedback, feedback.kind === 'success' ? s.feedbackSuccess : s.feedbackWarning]}>
            <Text style={s.feedbackText}>{feedback.message}</Text>
            {feedback.kind === 'warning' && (
              <Pressable accessibilityRole="button" onPress={() => setSection('history')}>
                <Text style={s.feedbackLink}>交換履歴を確認 ›</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="交換の案内を閉じる" onPress={() => setFeedback(null)}>
              <Text style={s.feedbackLink}>閉じる</Text>
            </Pressable>
          </View>
        )}

        <View style={s.balCard}>
          <Text style={s.balLabel}>保有ポイント</Text>
<<<<<<< HEAD
          <Text style={s.balNum}>
            {(wallet?.balance ?? 0).toLocaleString()} <Text style={s.p}>P</Text>
          </Text>
          <Text style={s.balYen}>約 {pointsToYen(wallet?.balance ?? 0).toLocaleString()} 円相当 ・ 1,000P=1円</Text>
          <View style={s.balRow}>
            <View style={s.miniBox}>
              <Text style={s.miniLabel}>累計獲得</Text>
              <Text style={s.miniVal}>{(wallet?.lifetime_earned ?? 0).toLocaleString()} P</Text>
            </View>
            <View style={s.miniBox}>
              <Text style={s.miniLabel}>累計利用</Text>
              <Text style={s.miniVal}>{(wallet?.lifetime_spent ?? 0).toLocaleString()} P</Text>
            </View>
=======
          <Text style={s.balNum}>{walletCurrent ? balance.toLocaleString() : '—'} <Text style={s.p}>P</Text></Text>
          {walletCurrent && <Text style={s.balYen}>{yenEquivalent(balance)} 相当（1,000P=1円）</Text>}
          <View style={s.balRow}>
            <View><Text style={s.miniLabel}>累計獲得</Text><Text style={s.miniVal}>{walletCurrent ? wallet.lifetime_earned.toLocaleString() : '—'} P</Text></View>
            <View><Text style={s.miniLabel}>累計使用</Text><Text style={s.miniVal}>{walletCurrent ? wallet.lifetime_spent.toLocaleString() : '—'} P</Text></View>
>>>>>>> codex/points-exchange-ux
          </View>
          {walletCurrent && expiresOn && balance > 0 && (
            <Text style={s.expiry}>有効期限: {formatDate(expiresOn)}（ポイントを獲得・使用すると延長されます）</Text>
          )}
        </View>

<<<<<<< HEAD
        <Text style={s.section}>ポイント推移</Text>
        <View style={s.sparkCard}>
          {spark.length <= 1 ? (
            <Text style={s.empty}>まだ履歴がありません</Text>
          ) : (
            <View style={s.spark}>
              {spark.map((value, index) => (
                <View key={index} style={[s.bar, { height: 10 + value * 66 }]} />
              ))}
            </View>
          )}
        </View>

        <Text style={s.section}>VIP / ステーキング</Text>
        <View style={s.vipCard}>
          <View style={s.vipTop}>
            <View style={s.vipBadge}><Text style={s.vipBadgeText}>V</Text></View>
            <View>
              <Text style={s.vipName}>VIP {vip?.tier_name ?? 'ブロンズ'} ランク</Text>
              <Text style={s.vipSub}>{(vip?.xp ?? 0).toLocaleString()} XP ・ 保有ボーナス対象</Text>
            </View>
          </View>
          <View style={s.vipMeter}>
            <View style={[s.vipMeterFill, { width: `${Math.min(100, Math.max(18, ((vip?.xp ?? 0) / 10000) * 100))}%` }]} />
          </View>
        </View>

        <View style={s.stakeCard}>
          <Text style={s.stakeRate}>現在の月利 {(rateBps / 100).toFixed(1)}%</Text>
          <Text style={s.stakeNote}>交換せずに保有しているポイントへ、ランクに応じた月次ボーナスを付与します。</Text>
          {staking.map((item) => (
            <View key={item.id} style={s.stakeRow}>
              <Text style={s.stakeMonth}>{item.period.slice(0, 7)}</Text>
              <Text style={s.stakeAcc}>+{item.accrued_points.toLocaleString()} P</Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>履歴</Text>
        {ledger.map((entry) => (
          <View key={entry.id} style={s.logRow}>
            <View style={s.logIcon}>
              <Text style={s.logIconText}>{entry.delta >= 0 ? '+' : '-'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.logReason}>
                {reasonLabel(entry.reason)}
                {entry.status === 'pending' ? ' ・ 検証中' : ''}
              </Text>
              <Text style={s.logDate}>{fmt(entry.created_at)}</Text>
            </View>
            <Text style={[s.logDelta, { color: entry.delta >= 0 ? colors.ok : colors.danger }]}>
              {entry.delta >= 0 ? '+' : '-'}{Math.abs(entry.delta).toLocaleString()} P
            </Text>
          </View>
        ))}
=======
        <View style={s.switcher} accessibilityRole="tablist">
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'exchange' }}
            style={[s.switchTab, section === 'exchange' && s.switchTabOn]} onPress={() => setSection('exchange')}>
            <Text style={[s.switchText, section === 'exchange' && s.switchTextOn]}>交換する</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: section === 'history' }}
            style={[s.switchTab, section === 'history' && s.switchTabOn]} onPress={() => setSection('history')}>
            <Text style={[s.switchText, section === 'history' && s.switchTextOn]}>ポイント・履歴</Text>
          </Pressable>
        </View>

        {section === 'exchange' ? (
          <>
            <Text style={s.intro}>保有ポイントをゲームアイテムや特典に交換できます。</Text>
            {availableItems.length === 0 && !loading && !error && <Text style={s.empty}>現在交換できるアイテムはありません。</Text>}
            {availableItems.map((item) => {
              const soldOut = item.stock !== null && item.stock <= 0;
              const enough = balance >= item.cost_points;
              const canExchange = walletCurrent && enough && !soldOut && busy === null;
              return (
                <View key={item.id} style={s.item}>
                  <View style={s.itemBody}>
                    <Text style={s.itemName}>{item.name}</Text>
                    {item.description && <Text style={s.itemDescription}>{item.description}</Text>}
                    <Text style={s.itemCost}>{item.cost_points.toLocaleString()} P <Text style={s.yen}>{yenEquivalent(item.cost_points)}</Text></Text>
                    <View style={s.metaRow}>
                      {item.stock !== null && <Text style={[s.meta, soldOut && s.metaOut]}>{soldOut ? '在庫切れ' : `残り ${item.stock.toLocaleString()}`}</Text>}
                      {!enough && !soldOut && <Text style={s.gap}>あと {(item.cost_points - balance).toLocaleString()}P</Text>}
                    </View>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canExchange }} disabled={!canExchange}
                    style={[s.btn, !canExchange && s.btnOff]} onPress={() => confirmExchange(item)}>
                    <Text style={[s.btnText, !canExchange && s.btnTextOff]}>{soldOut ? '在庫切れ' : enough ? (busy === item.id ? '申請中…' : '交換') : '不足'}</Text>
                  </Pressable>
                </View>
              );
            })}
            {!loading && !error && !canExchangeAny && nextGoal && (
              <View style={s.goalCard}>
                <Text style={s.goalEyebrow}>🎯 次の交換目標</Text>
                <Text style={s.goalText}>「{nextGoal.name}」まであと <Text style={s.goalGap}>{(nextGoal.cost_points - balance).toLocaleString()} P</Text></Text>
                <Pressable accessibilityRole="button" style={s.goalButton} onPress={() => router.push('/missions')}>
                  <Text style={s.goalButtonText}>ミッションでポイントをためる ›</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={s.section}>ポイント推移</Text>
            <View accessible accessibilityRole="image" style={s.sparkCard}
              accessibilityLabel={`直近のポイント残高推移。現在 ${balance.toLocaleString()} ポイント。左が古く、右が新しい履歴です。`}>
              {spark.length <= 1 && !loading && !error ? <Text style={s.empty}>履歴が増えると推移を表示します。</Text> : spark.length > 1 ? (
                <View style={s.spark}>{spark.map((value, index) => <View key={index} style={[s.bar, { height: 8 + value * 64 }]} />)}</View>
              ) : null}
            </View>
            {spark.length > 1 && !error && <Text style={s.sparkCaption}>直近の履歴をもとにした残高の推移（古い ← → 新しい）</Text>}

            <Text style={s.section}>交換申請</Text>
            {requestLookupMessage && <Text accessibilityRole="alert" style={s.historyNotice}>{requestLookupMessage}</Text>}
            {visibleRequests.length > 0 && <Text style={s.historyCount}>{visibleRequests.length}件表示</Text>}
            {visibleRequests.length === 0 && !loading && !error && <Text style={s.empty}>交換申請はまだありません。</Text>}
            {visibleRequests.map((request) => (
              <View key={request.id} style={[s.historyRow, request.id === focusedRequest?.id && s.focusedRequest]}>
                <View style={s.historyCopy}>
                  {request.id === focusedRequest?.id && <Text style={s.focusedRequestLabel}>通知の交換申請</Text>}
                  <Text style={s.logReason}>{itemNames.get(request.item_id) ?? '現在は掲載終了したアイテム'}</Text>
                  <Text style={s.logDate}>{fmt(request.requested_at)} ・ {request.cost_points.toLocaleString()} P</Text>
                  {request.status === 'fulfilled' && request.code && (
                    <>
                      <Text selectable style={s.rewardCode}>受取コード: {request.code}</Text>
                      <Text style={s.codeHint}>コードを選択してコピーできます。</Text>
                    </>
                  )}
                </View>
                <Text style={[s.requestStatus, request.status === 'fulfilled' && s.statusDone, request.status === 'cancelled' && s.statusCancelled]}>
                  {request.status === 'fulfilled' ? '交換完了' : request.status === 'cancelled' ? '取消・返還' : '確認中'}
                </Text>
              </View>
            ))}
            {loadMoreError && <Text accessibilityRole="alert" style={s.historyNotice}>{loadMoreError}</Text>}
            {hasMoreRequests && (
              <Pressable accessibilityRole="button" disabled={loadingMoreRequests || loading || refreshing || !!error}
                style={s.historyMore} onPress={() => { void loadMoreRequests(); }}>
                <Text style={s.historyMoreText}>{loadingMoreRequests ? '読み込み中…' : loadMoreError ? 'もう一度読み込む' : '以前の交換申請を表示'}</Text>
              </Pressable>
            )}

            <Text style={s.section}>ポイント履歴（直近40件）</Text>
            {ledger.length === 0 && !loading && !error && <Text style={s.empty}>ポイント履歴はまだありません。</Text>}
            {ledger.map((entry) => (
              <View key={entry.id} style={s.historyRow}>
                <View style={s.historyCopy}>
                  <Text style={s.logReason}>{reasonLabel(entry.reason)}{entry.status !== 'confirmed' ? `（${ledgerStatus(entry.status)}）` : ''}</Text>
                  <Text style={s.logDate}>{fmt(entry.created_at)}</Text>
                </View>
                <Text style={[s.logDelta, { color: entry.delta >= 0 ? colors.ok : colors.danger }]}>
                  {entry.delta >= 0 ? '＋' : '−'}{Math.abs(entry.delta).toLocaleString()} P
                </Text>
              </View>
            ))}

            <Text style={s.section}>保有ボーナス（直近6件）</Text>
            {walletCurrent && <View style={s.stakeCard}>
              <Text style={s.stakeRate}>現在の月利 {((vip?.staking_rate_bps ?? 0) / 100).toFixed(1)}%{vip?.tier_name ? `（VIP ${vip.tier_name}）` : ''}</Text>
              <Text style={s.stakeNote}>保有ポイントに応じた月次ボーナスです。</Text>
              {staking.map((accrual) => (
                <View key={accrual.id} style={s.stakeRow}>
                  <Text style={s.stakeMonth}>{accrual.period.slice(0, 7)}</Text>
                  <Text style={s.stakeAcc}>＋{accrual.accrued_points.toLocaleString()} P</Text>
                </View>
              ))}
              {staking.length === 0 && <Text style={s.empty}>付与実績はまだありません。</Text>}
            </View>}
          </>
        )}
>>>>>>> codex/points-exchange-ux
      </ScrollView>
      <Modal transparent animationType="fade" visible={selectedItem !== null} onRequestClose={() => setSelectedItem(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard} accessibilityViewIsModal>
            <Text accessibilityRole="header" style={s.modalTitle}>交換の確認</Text>
            {selectedItem && (
              <>
                <Text style={s.modalItem}>{selectedItem.name}</Text>
                <Text style={s.modalDescription}>必要ポイント: {selectedItem.cost_points.toLocaleString()} P（{yenEquivalent(selectedItem.cost_points)}相当）</Text>
                <Text style={s.modalDescription}>交換後の残高: {Math.max(0, balance - selectedItem.cost_points).toLocaleString()} P</Text>
                <Text style={s.modalDescription}>この内容で交換を申請しますか？</Text>
                <View style={s.modalActions}>
                  <Pressable accessibilityRole="button" style={[s.modalButton, s.modalCancel]} onPress={() => setSelectedItem(null)}>
                    <Text style={s.modalCancelText}>キャンセル</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" style={[s.modalButton, s.modalSubmit]}
                    disabled={!walletCurrent} onPress={() => { void doExchange(selectedItem); }}>
                    <Text style={s.btnText}>交換を申請</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

<<<<<<< HEAD
function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    mission: 'ミッション達成',
    offer: '提携オファー',
    exchange: 'ポイント交換',
    staking: 'ステーキング付与',
    bounty: '賞金質問報酬',
    signup: '新規登録ボーナス',
  };
  return labels[reason] ?? reason;
}

function fmt(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
=======
function isConfirmedExchangeResult(value: unknown): value is { ok: true; status: 'processing'; request_id: string } {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return result.ok === true && result.status === 'processing'
    && typeof result.request_id === 'string' && REQUEST_ID_PATTERN.test(result.request_id);
}

function isWallet(value: unknown, userId: string): value is Wallet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const wallet = value as Record<string, unknown>;
  return wallet.user_id === userId
    && [wallet.balance, wallet.lifetime_earned, wallet.lifetime_spent].every((amount) =>
      typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0);
}

function isExchangeRequest(value: unknown, userId: string): value is ExchangeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return typeof request.id === 'string' && REQUEST_ID_PATTERN.test(request.id)
    && request.user_id === userId
    && typeof request.item_id === 'string' && request.item_id.length > 0
    && typeof request.cost_points === 'number' && Number.isSafeInteger(request.cost_points) && request.cost_points >= 0
    && (request.status === 'processing' || request.status === 'fulfilled' || request.status === 'cancelled')
    && typeof request.requested_at === 'string' && Number.isFinite(Date.parse(request.requested_at))
    && (request.code === null || typeof request.code === 'string');
}

function isExchangeItem(value: unknown): value is ExchangeItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length > 0
    && typeof item.name === 'string' && item.name.trim().length > 0
    && (item.description === null || typeof item.description === 'string')
    && typeof item.cost_points === 'number' && Number.isSafeInteger(item.cost_points) && item.cost_points > 0
    && (item.stock === null || (typeof item.stock === 'number' && Number.isSafeInteger(item.stock) && item.stock >= 0))
    && typeof item.is_active === 'boolean';
}

function isLedgerEntry(value: unknown, userId: string): value is LedgerEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string' && REQUEST_ID_PATTERN.test(entry.id)
    && entry.user_id === userId
    && typeof entry.delta === 'number' && Number.isSafeInteger(entry.delta)
    && typeof entry.reason === 'string' && entry.reason.trim().length > 0
    && (entry.status === 'pending' || entry.status === 'confirmed'
      || entry.status === 'rejected' || entry.status === 'reversed')
    && typeof entry.created_at === 'string' && Number.isFinite(Date.parse(entry.created_at));
}

function isVipInfo(value: unknown, userId: string): value is VipInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const vip = value as Record<string, unknown>;
  return vip.user_id === userId
    && typeof vip.xp === 'number' && Number.isSafeInteger(vip.xp) && vip.xp >= 0
    && (vip.tier_name === null || (typeof vip.tier_name === 'string' && vip.tier_name.trim().length > 0))
    && (vip.staking_rate_bps === null || (typeof vip.staking_rate_bps === 'number'
      && Number.isSafeInteger(vip.staking_rate_bps) && vip.staking_rate_bps >= 0));
}

function isStakingAccrual(value: unknown, userId: string): value is StakingAccrual {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const accrual = value as Record<string, unknown>;
  return typeof accrual.id === 'string' && REQUEST_ID_PATTERN.test(accrual.id)
    && accrual.user_id === userId
    && typeof accrual.period === 'string' && /^\d{4}-\d{2}-01$/.test(accrual.period)
    && Number.isFinite(Date.parse(accrual.period))
    && typeof accrual.accrued_points === 'number' && Number.isSafeInteger(accrual.accrued_points)
    && accrual.accrued_points >= 0;
}

function isWalletExpiry(value: unknown, userId: string): value is { expires_on: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const expiry = value as Record<string, unknown>;
  return expiry.user_id === userId
    && (expiry.expires_on === null || (typeof expiry.expires_on === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(expiry.expires_on)
      && Number.isFinite(Date.parse(expiry.expires_on))));
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    mission: 'ミッション達成', offer: '提携オファー', exchange: 'ポイント交換',
    staking: '保有ボーナス', bounty: 'コミュニティ報酬', signup: '新規登録ボーナス',
  };
  return labels[reason] ?? reason;
}

function ledgerStatus(status: string): string {
  const labels: Record<string, string> = { pending: '確認中', rejected: '対象外', reversed: '取消' };
  return labels[status] ?? status;
}

function fmt(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function yenEquivalent(points: number): string {
  const yen = pointsToYen(points);
  return points > 0 && yen === 0 ? '≒ ¥1未満' : `≒ ¥${yen.toLocaleString()}`;
>>>>>>> codex/points-exchange-ux
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
<<<<<<< HEAD
  h: { fontSize: 21, fontWeight: '900', color: colors.ink, marginBottom: 14 },
=======
  h: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 14 },
  feedback: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 14, gap: 8 },
  feedbackSuccess: { backgroundColor: colors.okSoft, borderColor: colors.ok },
  feedbackWarning: { backgroundColor: colors.warnSoft, borderColor: colors.warn },
  feedbackText: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  feedbackLink: { color: colors.accent, fontSize: 12, fontWeight: '800', paddingVertical: 4 },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 20 },
  modalCard: { backgroundColor: colors.paper, borderRadius: 18, padding: 22, width: '100%', maxWidth: 420 },
  modalTitle: { color: colors.ink, fontSize: 20, fontWeight: '800', marginBottom: 16 },
  modalItem: { color: colors.ink, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  modalDescription: { color: colors.sub, fontSize: 13, lineHeight: 21, marginBottom: 6 },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  modalButton: { flexGrow: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16 },
  modalCancel: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line },
  modalCancelText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  modalSubmit: { backgroundColor: colors.accent },
>>>>>>> codex/points-exchange-ux
  balCard: { backgroundColor: colors.ink, borderRadius: 18, padding: 20 },
  balLabel: { color: '#c2c6d8', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  balNum: { color: '#fff', fontSize: 38, fontWeight: '900', marginTop: 4 },
  p: { fontSize: 18 },
<<<<<<< HEAD
  balYen: { color: '#aeb3c8', fontSize: 12, marginTop: 4 },
  expiry: { fontSize: 11, color: colors.warn, fontWeight: '700', marginTop: 10 },
  balRow: { flexDirection: 'row', gap: 28, marginTop: 16 },
  miniLabel: { color: '#9aa0c0', fontSize: 11, fontWeight: '700' },
  miniVal: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 2 },
  switcher: { flexDirection: 'row', padding: 4, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, marginTop: 16 },
  switchTab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10 },
  switchTabOn: { backgroundColor: colors.ink },
  switchText: { color: colors.sub, fontSize: 13, fontWeight: '800' },
  switchTextOn: { color: '#fff' },
  intro: { color: colors.sub, fontSize: 12, lineHeight: 18, marginTop: 14, marginBottom: 10 },
  section: { fontSize: 13, fontWeight: '800', color: colors.sub, marginTop: 20, marginBottom: 10 },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingVertical: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  itemBody: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '800', color: colors.ink },
  itemDescription: { fontSize: 12, lineHeight: 17, color: colors.sub, marginTop: 4 },
  itemCost: { fontSize: 15, fontWeight: '900', color: colors.accent, marginTop: 6 },
  yen: { fontSize: 11, fontWeight: '700', color: colors.muted },
  goalCard: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: '#e7d6a6', borderRadius: 14, padding: 15, marginTop: 4, marginBottom: 10 },
  goalEyebrow: { color: '#7a5b16', fontSize: 11, fontWeight: '800', marginBottom: 5 },
  goalText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  goalGap: { color: colors.gold, fontWeight: '900' },
  goalButton: { alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10, marginTop: 11 },
  goalButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5, alignItems: 'center' },
  meta: { fontSize: 11, color: colors.sub, fontWeight: '700' },
  metaOut: { color: colors.danger },
  gap: { fontSize: 11, color: '#9a6b16', fontWeight: '800' },
  btn: { backgroundColor: colors.accent, borderRadius: 10, minWidth: 74, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  btnOff: { backgroundColor: '#cfd2db' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  btnTextOff: { color: colors.ink },
  sparkCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, height: 100, justifyContent: 'flex-end' },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 72 },
  bar: { flex: 1, backgroundColor: colors.accent, borderRadius: 3, minWidth: 4 },
  sparkCaption: { color: colors.muted, fontSize: 11, marginTop: 6 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, marginBottom: 8 },
  historyCopy: { flex: 1 },
  focusedRequest: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  focusedRequestLabel: { color: colors.accent, fontSize: 11, fontWeight: '800', marginBottom: 5 },
  historyCount: { color: colors.sub, fontSize: 11, marginBottom: 8 },
  historyNotice: { color: colors.sub, fontSize: 12, lineHeight: 19, marginBottom: 10 },
  historyMore: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 10, alignItems: 'center', padding: 13, marginBottom: 10 },
  historyMoreText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  codeHint: { color: colors.sub, fontSize: 10, marginTop: 3 },
  logReason: { fontSize: 13, fontWeight: '700', color: colors.ink },
  logDate: { fontSize: 11, color: colors.muted, marginTop: 3 },
  rewardCode: { color: colors.ink, fontSize: 12, fontWeight: '800', marginTop: 6 },
  logDelta: { fontSize: 14, fontWeight: '900' },
  requestStatus: { color: colors.warn, fontSize: 11, fontWeight: '800' },
  statusDone: { color: colors.ok },
  statusCancelled: { color: colors.muted },
  stakeCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16 },
=======
  balYen: { color: '#aeb3c8', fontSize: 12, marginTop: 4, fontWeight: '700' },
  balRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  miniBox: { flex: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: 12, padding: 11 },
  miniLabel: { color: '#9aa0c0', fontSize: 11, fontWeight: '800' },
  miniVal: { color: '#fff', fontSize: 13, fontWeight: '900', marginTop: 3 },
  section: { fontSize: 12, fontWeight: '900', color: colors.sub, marginTop: 22, marginBottom: 10, letterSpacing: 0.4 },
  sparkCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, height: 116, justifyContent: 'flex-end' },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 82 },
  bar: { flex: 1, backgroundColor: colors.accent, borderRadius: 4, minWidth: 4 },
  vipCard: { backgroundColor: '#7d8694', borderRadius: 16, padding: 16 },
  vipTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vipBadge: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  vipBadgeText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  vipName: { color: '#fff', fontSize: 16, fontWeight: '900' },
  vipSub: { color: '#e7ebf3', fontSize: 11, marginTop: 3, fontWeight: '700' },
  vipMeter: { height: 8, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden', marginTop: 15 },
  vipMeterFill: { height: '100%', backgroundColor: '#f1d37a', borderRadius: 99 },
  stakeCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, marginTop: 10 },
>>>>>>> codex/mvp-stabilization-20260919
  stakeRate: { fontSize: 15, fontWeight: '900', color: colors.accent },
  stakeNote: { fontSize: 12, color: colors.sub, marginTop: 6, lineHeight: 18 },
  stakeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
<<<<<<< HEAD
  stakeMonth: { fontSize: 13, color: colors.ink, fontWeight: '800' },
  stakeAcc: { fontSize: 13, color: colors.ok, fontWeight: '900' },
  logRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, marginBottom: 8, gap: 11 },
  logIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  logIconText: { color: colors.accent, fontWeight: '900' },
  logReason: { fontSize: 13, fontWeight: '800', color: colors.ink },
  logDate: { fontSize: 11, color: colors.muted, marginTop: 3, fontFamily: 'monospace' },
  logDelta: { fontSize: 14, fontWeight: '900' },
  empty: { color: colors.muted, fontSize: 13 },
=======
  stakeMonth: { fontSize: 13, color: colors.ink, fontWeight: '700' },
  stakeAcc: { fontSize: 13, color: colors.ok, fontWeight: '800' },
>>>>>>> codex/points-exchange-ux
});
