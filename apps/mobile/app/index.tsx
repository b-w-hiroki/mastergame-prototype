import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import type { Mission, NudgeTarget } from '@/lib/types';

/**
 * ホーム（prototype core-flow.html のホームに対応）。
 * 残高・スマートナッジ・デイリーミッションを Supabase から取得し、claim_mission RPC で付与。
 */
export default function Home() {
  const [balance, setBalance] = useState<number>(0);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [nudge, setNudge] = useState<NudgeTarget | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: wallet }, { data: ms }, { data: n }] = await Promise.all([
      supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single(),
      supabase.from('missions').select('*').eq('type', 'daily').eq('is_active', true),
      supabase.rpc('next_nudge_target'),
    ]);
    setBalance(wallet?.balance ?? 0);
    setMissions((ms as Mission[]) ?? []);
    setNudge((n as NudgeTarget) ?? null);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function claim(m: Mission) {
    const { error } = await supabase.rpc('claim_mission', { p_mission_id: m.id });
    if (!error) load();
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={s.head}>
          <Text style={s.h}>ホーム</Text>
          <View style={s.chip}><Text style={s.chipText}>🪙 {balance.toLocaleString()} P</Text></View>
        </View>

        {nudge?.gap != null && (
          <View style={s.nudge}>
            <Text style={s.nudgeText}>あと <Text style={s.gold}>{nudge.gap.toLocaleString()}P</Text> で「{nudge.item_name}」と交換できます</Text>
          </View>
        )}

        <Text style={s.section}>デイリーミッション</Text>
        {missions.map((m) => (
          <View key={m.id} style={s.mission}>
            <View style={{ flex: 1 }}>
              <Text style={s.mTitle}>{m.title}</Text>
              <Text style={s.mReward}>＋{m.reward_points} P</Text>
            </View>
            <Pressable style={s.claim} onPress={() => claim(m)}>
              <Text style={s.claimText}>受け取る</Text>
            </Pressable>
          </View>
        ))}

        <Pressable style={s.logout} onPress={() => supabase.auth.signOut()}>
          <Text style={s.logoutText}>ログアウト</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f5f8' },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  h: { fontSize: 20, fontWeight: '800', color: '#1f2430' },
  chip: { marginLeft: 'auto', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ec', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontWeight: '800', fontSize: 13 },
  nudge: { backgroundColor: '#f6efda', borderWidth: 1, borderColor: '#e7d6a6', borderRadius: 14, padding: 13, marginBottom: 14 },
  nudgeText: { color: '#7a5b16', fontWeight: '700', fontSize: 13 },
  gold: { color: '#b88a2e', fontWeight: '900' },
  section: { fontSize: 12, fontWeight: '800', color: '#6b7280', marginVertical: 10 },
  mission: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ec', borderRadius: 14, padding: 13, marginBottom: 10 },
  mTitle: { fontSize: 13, fontWeight: '700' },
  mReward: { fontSize: 11, color: '#b88a2e', fontWeight: '800', marginTop: 3 },
  claim: { backgroundColor: '#179a5b', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 },
  claimText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  logout: { marginTop: 24, alignItems: 'center' },
  logoutText: { color: '#9aa0ac', fontWeight: '700' },
});
