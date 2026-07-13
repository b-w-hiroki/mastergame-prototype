import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import type { Mission, NudgeTarget, VipInfo, AppNotification } from '@/lib/types';

/**
 * ホーム（prototype core-flow.html のホームに対応）。
 * 残高・VIPランク・スマートナッジ・お知らせ・デイリーミッションを Supabase から取得。
 */
export default function Home() {
  const [balance, setBalance] = useState(0);
  const [vip, setVip] = useState<VipInfo | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [nudge, setNudge] = useState<NudgeTarget | null>(null);
  const [news, setNews] = useState<AppNotification[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: wallet }, { data: ms }, { data: n }, { data: v }, { data: nt }] = await Promise.all([
      supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single(),
      supabase.from('missions').select('*').eq('type', 'daily').eq('is_active', true),
      supabase.rpc('next_nudge_target'),
      supabase.from('user_vip').select('*').eq('user_id', u.user.id).single(),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(3),
    ]);
    setBalance(wallet?.balance ?? 0);
    setMissions(ms ?? []);
    // n は RPC(jsonb) / nt.payload は jsonb 列。境界で domain 形へ変換する。
    setNudge((n as NudgeTarget | null) ?? null);
    setVip(v ?? null);
    setNews((nt ?? []) as AppNotification[]);
  }, []);

  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);

  async function claim(m: Mission) {
    setClaiming(m.id);
    const { error: claimError } = await supabase.rpc('claim_mission', { p_mission_id: m.id });
    setClaiming(null);
    if (claimError) {
      Alert.alert('受け取れませんでした', claimError.message);
      return;
    }
    reload().catch(() => {});
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        <View style={s.head}>
          <View>
            <Text style={s.hello}>こんにちは 👋</Text>
            {vip?.tier_name && <Text style={s.rank}>VIP {vip.tier_name}</Text>}
          </View>
          <View style={s.chip}><Text style={s.chipText}>🪙 {balance.toLocaleString()} P</Text></View>
        </View>

        {nudge?.gap != null && nudge.gap > 0 && (
          <View style={s.nudge}>
            <Text style={s.nudgeText}>あと <Text style={s.gold}>{nudge.gap.toLocaleString()}P</Text> で「{nudge.item_name}」と交換できます</Text>
          </View>
        )}

        <View style={s.actions}>
          <Pressable style={s.action} onPress={() => router.push('/exchange')}>
            <Text style={s.actionEmoji}>🎁</Text><Text style={s.actionText}>交換</Text>
          </Pressable>
          <Pressable style={s.action} onPress={() => router.push('/missions')}>
            <Text style={s.actionEmoji}>✅</Text><Text style={s.actionText}>ミッション</Text>
          </Pressable>
          <Pressable style={s.action} onPress={() => router.push('/points')}>
            <Text style={s.actionEmoji}>📈</Text><Text style={s.actionText}>ポイント</Text>
          </Pressable>
        </View>

        {news.length > 0 && (
          <>
            <Text style={s.section}>お知らせ</Text>
            {news.map((n) => (
              <View key={n.id} style={s.newsItem}>
                <Text style={s.newsType}>{labelOf(n.type)}</Text>
                <Text style={s.newsBody} numberOfLines={2}>{String(n.payload?.message ?? n.payload?.title ?? '通知があります')}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={s.section}>デイリーミッション</Text>
        {missions.length === 0 && <Text style={s.empty}>本日のミッションはありません</Text>}
        {missions.map((m) => (
          <View key={m.id} style={s.mission}>
            <View style={{ flex: 1 }}>
              <Text style={s.mTitle}>{m.icon ? `${m.icon} ` : ''}{m.title}</Text>
              <Text style={s.mReward}>＋{m.reward_points} P</Text>
            </View>
            <Pressable style={[s.claim, claiming === m.id && { opacity: 0.5 }]} disabled={claiming === m.id} onPress={() => claim(m)}>
              <Text style={s.claimText}>{claiming === m.id ? '...' : '受け取る'}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function labelOf(type: string): string {
  const m: Record<string, string> = {
    reply: '返信', best_answer: 'ベストアンサー', reaction: 'リアクション',
    report_result: '通報結果', system: 'お知らせ',
  };
  return m[type] ?? 'お知らせ';
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  hello: { fontSize: 18, fontWeight: '800', color: colors.ink },
  rank: { fontSize: 12, fontWeight: '800', color: colors.gold, marginTop: 2 },
  chip: { marginLeft: 'auto', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontWeight: '800', fontSize: 13 },
  nudge: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: '#e7d6a6', borderRadius: 14, padding: 13, marginBottom: 14 },
  nudgeText: { color: '#7a5b16', fontWeight: '700', fontSize: 13 },
  gold: { color: colors.gold, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  action: { flex: 1, backgroundColor: colors.accentSoft, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  actionEmoji: { fontSize: 20 },
  actionText: { color: colors.accent, fontWeight: '800', fontSize: 12, marginTop: 4 },
  section: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 20, marginBottom: 10 },
  empty: { color: colors.muted, fontSize: 13 },
  newsItem: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, marginBottom: 8 },
  newsType: { fontSize: 10, fontWeight: '800', color: colors.accent },
  newsBody: { fontSize: 13, color: colors.ink, marginTop: 2 },
  mission: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 13, marginBottom: 10 },
  mTitle: { fontSize: 13, fontWeight: '700' },
  mReward: { fontSize: 11, color: colors.gold, fontWeight: '800', marginTop: 3 },
  claim: { backgroundColor: colors.ok, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 },
  claimText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
