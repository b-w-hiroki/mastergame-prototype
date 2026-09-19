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

export default function Points() {
  const [wallet, setWallet] = useState<Wallet | null>(demoWallet);
  const [ledger, setLedger] = useState<LedgerEntry[]>(demoLedger);
  const [vip, setVip] = useState<VipInfo | null>({ user_id: 'demo', xp: 6400, tier_name: 'シルバー', staking_rate_bps: 150 });
  const [staking, setStaking] = useState<StakingAccrual[]>(demoStaking);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const [{ data: w }, { data: l }, { data: v }, { data: st }] = await Promise.all([
      supabase.from('point_wallets').select('*').eq('user_id', u.user.id).single(),
      supabase.from('point_ledger').select('*').order('created_at', { ascending: false }).limit(40),
      supabase.from('user_vip').select('*').eq('user_id', u.user.id).single(),
      supabase.from('staking_accruals').select('*').order('period', { ascending: false }).limit(6),
    ]);

    if (w) setWallet(w as Wallet);
    if (l?.length) setLedger(l as LedgerEntry[]);
    if (v) setVip(v as VipInfo);
    if (st?.length) setStaking(st as StakingAccrual[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const spark = useMemo(() => {
    const balance = wallet?.balance ?? 0;
    let running = balance;
    const seriesDesc: number[] = [balance];
    for (const entry of ledger) {
      running -= entry.delta;
      seriesDesc.push(running);
    }
    const series = seriesDesc.reverse();
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const range = Math.max(max - min, 1);
    return series.slice(-18).map((value) => (value - min) / range);
  }, [ledger, wallet]);

  const rateBps = vip?.staking_rate_bps ?? 0;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
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
        <Text style={s.h}>ポイント</Text>

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
