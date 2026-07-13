import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { colors, pointsToYen } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import type { LedgerEntry, VipInfo, StakingAccrual, Wallet } from '@/lib/types';

/**
 * ポイント（prototype core-flow.html のポイントに対応）。
 * 残高・ポイント推移グラフ（簡易スパークライン）・ステーキング（保有ボーナス）・履歴。
 */
export default function Points() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [vip, setVip] = useState<VipInfo | null>(null);
  const [staking, setStaking] = useState<StakingAccrual[]>([]);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: w }, { data: l }, { data: v }, { data: st }] = await Promise.all([
      supabase.from('point_wallets').select('*').eq('user_id', u.user.id).single(),
      supabase.from('point_ledger').select('*').order('created_at', { ascending: false }).limit(40),
      supabase.from('user_vip').select('*').eq('user_id', u.user.id).single(),
      supabase.from('staking_accruals').select('*').order('period', { ascending: false }).limit(6),
    ]);
    setWallet(w ?? null);
    setLedger(l ?? []);
    setVip(v ?? null);
    setStaking(st ?? []);
  }, []);

  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);

  // 直近のレジャーから残高推移（古い→新しい）を復元してスパークライン化
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
    return series.slice(-20).map((v) => (v - min) / range); // 0..1
  }, [ledger, wallet]);

  const rateBps = vip?.staking_rate_bps ?? 0;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        <Text style={s.h}>ポイント</Text>
        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        <View style={s.balCard}>
          <Text style={s.balLabel}>保有ポイント</Text>
          <Text style={s.balNum}>{(wallet?.balance ?? 0).toLocaleString()} <Text style={s.p}>P</Text></Text>
          <Text style={s.balYen}>≒ ¥{pointsToYen(wallet?.balance ?? 0).toLocaleString()} 相当（1,000P=1円）</Text>
          <View style={s.balRow}>
            <View><Text style={s.miniLabel}>累計獲得</Text><Text style={s.miniVal}>{(wallet?.lifetime_earned ?? 0).toLocaleString()} P</Text></View>
            <View><Text style={s.miniLabel}>累計使用</Text><Text style={s.miniVal}>{(wallet?.lifetime_spent ?? 0).toLocaleString()} P</Text></View>
          </View>
        </View>

        <Text style={s.section}>ポイント推移</Text>
        <View style={s.sparkCard}>
          {spark.length <= 1 ? (
            <Text style={s.empty}>まだ履歴がありません</Text>
          ) : (
            <View style={s.spark}>
              {spark.map((v, i) => (
                <View key={i} style={[s.bar, { height: 8 + v * 64 }]} />
              ))}
            </View>
          )}
        </View>

        <Text style={s.section}>ステーキング（保有ボーナス）</Text>
        <View style={s.stakeCard}>
          <Text style={s.stakeRate}>現在の月利 {(rateBps / 100).toFixed(1)}%{vip?.tier_name ? `（VIP ${vip.tier_name}）` : ''}</Text>
          <Text style={s.stakeNote}>保有ポイントに応じて毎月ボーナスが付与されます。ランクが上がるほど月利アップ。</Text>
          {staking.map((a) => (
            <View key={a.id} style={s.stakeRow}>
              <Text style={s.stakeMonth}>{a.period.slice(0, 7)}</Text>
              <Text style={s.stakeAcc}>＋{a.accrued_points.toLocaleString()} P</Text>
            </View>
          ))}
          {staking.length === 0 && <Text style={s.empty}>付与実績はまだありません</Text>}
        </View>

        <Text style={s.section}>履歴</Text>
        {ledger.length === 0 && <Text style={s.empty}>履歴がありません</Text>}
        {ledger.map((e) => (
          <View key={e.id} style={s.logRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.logReason}>{reasonLabel(e.reason)}{e.status === 'pending' ? '（検証中）' : ''}</Text>
              <Text style={s.logDate}>{fmt(e.created_at)}</Text>
            </View>
            <Text style={[s.logDelta, { color: e.delta >= 0 ? colors.ok : colors.danger }]}>
              {e.delta >= 0 ? '＋' : '−'}{Math.abs(e.delta).toLocaleString()} P
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function reasonLabel(reason: string): string {
  const m: Record<string, string> = {
    mission: 'ミッション達成', offer: '提携オファー', exchange: 'ポイント交換',
    staking: 'ステーキング付与', bounty: '賭け質問報酬', signup: '新規登録ボーナス',
  };
  return m[reason] ?? reason;
}
function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 14 },
  balCard: { backgroundColor: colors.ink, borderRadius: 18, padding: 20 },
  balLabel: { color: '#c2c6d8', fontSize: 12, fontWeight: '700' },
  balNum: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 4 },
  p: { fontSize: 18 },
  balYen: { color: '#aeb3c8', fontSize: 12, marginTop: 4 },
  balRow: { flexDirection: 'row', gap: 28, marginTop: 16 },
  miniLabel: { color: '#9aa0c0', fontSize: 11, fontWeight: '700' },
  miniVal: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 2 },
  section: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 22, marginBottom: 10 },
  sparkCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, height: 100, justifyContent: 'flex-end' },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 72 },
  bar: { flex: 1, backgroundColor: colors.accent, borderRadius: 3, minWidth: 4 },
  stakeCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16 },
  stakeRate: { fontSize: 15, fontWeight: '900', color: colors.accent },
  stakeNote: { fontSize: 12, color: colors.sub, marginTop: 6, lineHeight: 18 },
  stakeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  stakeMonth: { fontSize: 13, color: colors.ink, fontWeight: '700' },
  stakeAcc: { fontSize: 13, color: colors.ok, fontWeight: '800' },
  logRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 13, marginBottom: 8 },
  logReason: { fontSize: 13, fontWeight: '700', color: colors.ink },
  logDate: { fontSize: 11, color: colors.muted, marginTop: 3, fontFamily: 'monospace' },
  logDelta: { fontSize: 14, fontWeight: '900' },
  empty: { color: colors.muted, fontSize: 13 },
});
