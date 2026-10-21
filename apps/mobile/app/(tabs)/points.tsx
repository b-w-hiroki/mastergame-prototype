import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, pointsToYen } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { formatDate } from '@/lib/notifications';
import type { LedgerEntry, VipInfo, StakingAccrual, Wallet } from '@/lib/types';

export default function Points() {
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

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: w }, { data: l }, { data: v }, { data: st }, { data: ex }] = await Promise.all([
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
    setWallet(w ?? null);
    setLedger(l ?? []);
    setVip(v ?? null);
    setStaking(st);
    setExpiresOn((ex as { expires_on: string | null } | null)?.expires_on ?? null);
  }, [hasRequestedRequest, requestedRequestId]);

  useEffect(() => () => {
    historyVersion.current += 1;
    historyPageAbort.current?.abort();
  }, []);

  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);

  const spark = useMemo(() => {
    const balance = wallet?.balance ?? 0;
    // 末尾（現在）= balance から逆算して各時点の残高列を作る
    let running = balance;
    const seriesDesc: number[] = [balance];
    for (const e of ledger) { running -= e.delta; seriesDesc.push(running); }
    const series = seriesDesc.reverse(); // 古い→新しい
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const range = Math.max(max - min, 1);
    return series.slice(-18).map((value) => (value - min) / range);
  }, [ledger, wallet]);

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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

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
          </View>
          {walletCurrent && expiresOn && balance > 0 && (
            <Text style={s.expiry}>有効期限: {formatDate(expiresOn)}（ポイントを獲得・使用すると延長されます）</Text>
          )}
        </View>

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
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  h: { fontSize: 21, fontWeight: '900', color: colors.ink, marginBottom: 14 },
  balCard: { backgroundColor: colors.ink, borderRadius: 18, padding: 20 },
  balLabel: { color: '#c2c6d8', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  balNum: { color: '#fff', fontSize: 38, fontWeight: '900', marginTop: 4 },
  p: { fontSize: 18 },
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
  stakeRate: { fontSize: 15, fontWeight: '900', color: colors.accent },
  stakeNote: { fontSize: 12, color: colors.sub, marginTop: 6, lineHeight: 18 },
  stakeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  stakeMonth: { fontSize: 13, color: colors.ink, fontWeight: '800' },
  stakeAcc: { fontSize: 13, color: colors.ok, fontWeight: '900' },
  logRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, marginBottom: 8, gap: 11 },
  logIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  logIconText: { color: colors.accent, fontWeight: '900' },
  logReason: { fontSize: 13, fontWeight: '800', color: colors.ink },
  logDate: { fontSize: 11, color: colors.muted, marginTop: 3, fontFamily: 'monospace' },
  logDelta: { fontSize: 14, fontWeight: '900' },
  empty: { color: colors.muted, fontSize: 13 },
});
