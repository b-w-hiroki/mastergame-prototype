import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { GENRES } from '@/lib/types';
import type { Profile, VipInfo, Genre } from '@/lib/types';

type Tier = { name: string; min_xp: number; sort: number };

/**
 * マイページ（prototype core-flow.html のマイページに対応）。
 * プロフィール・VIPランク（次ランクまでの進捗）・好きなジャンル・設定・ログアウト。
 */
export default function MyPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vip, setVip] = useState<VipInfo | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: p }, { data: v }, { data: t }, { data: g }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', u.user.id).single(),
      supabase.from('user_vip').select('*').eq('user_id', u.user.id).single(),
      supabase.from('vip_tiers').select('name,min_xp,sort').order('sort'),
      supabase.from('user_genres').select('genre').eq('user_id', u.user.id),
    ]);
    setProfile((p as Profile) ?? null);
    setVip((v as VipInfo) ?? null);
    setTiers((t as Tier[]) ?? []);
    setGenres(((g as { genre: Genre }[]) ?? []).map((x) => x.genre));
  }, []);

  useEffect(() => { load(); }, [load]);

  const xp = vip?.xp ?? profile?.xp ?? 0;
  const current = [...tiers].reverse().find((t) => xp >= t.min_xp) ?? tiers[0];
  const next = tiers.find((t) => t.min_xp > xp);
  const progress = next && current ? Math.min(1, (xp - current.min_xp) / (next.min_xp - current.min_xp)) : 1;

  async function logout() {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        <Text style={s.h}>マイページ</Text>

        <View style={s.profile}>
          <View style={s.avatar}><Text style={s.avatarText}>{(profile?.username ?? 'P').slice(0, 1).toUpperCase()}</Text></View>
          <View>
            <Text style={s.name}>{profile?.username ?? 'Player'}</Text>
            <Text style={s.handle}>{profile?.handle ?? ''}</Text>
          </View>
        </View>

        <View style={s.vipCard}>
          <View style={s.vipHead}>
            <Text style={s.vipTier}>👑 VIP {vip?.tier_name ?? current?.name ?? '—'}</Text>
            <Text style={s.vipXp}>{xp.toLocaleString()} XP</Text>
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${progress * 100}%` }]} /></View>
          <Text style={s.vipNext}>
            {next ? `次のランク「${next.name}」まで あと ${(next.min_xp - xp).toLocaleString()} XP` : '最高ランクに到達しています 🎉'}
          </Text>
        </View>

        <Text style={s.section}>好きなジャンル</Text>
        <View style={s.genreWrap}>
          {genres.length === 0 && <Text style={s.empty}>未設定</Text>}
          {genres.map((g) => {
            const meta = GENRES.find((x) => x.key === g);
            return <View key={g} style={s.genreChip}><Text style={s.genreText}>{meta?.emoji} {meta?.label ?? g}</Text></View>;
          })}
        </View>
        <Pressable style={s.editBtn} onPress={() => router.push('/genres')}>
          <Text style={s.editText}>ジャンルを編集</Text>
        </Pressable>

        <Text style={s.section}>設定</Text>
        <View style={s.settings}>
          <Pressable style={s.setRow} onPress={() => router.push('/exchange')}><Text style={s.setText}>交換履歴・ポイント交換</Text><Text style={s.chevron}>›</Text></Pressable>
          <View style={s.sep} />
          <Pressable style={s.setRow} onPress={() => Alert.alert('プッシュ通知', '本番では端末の通知設定と連動します。')}><Text style={s.setText}>プッシュ通知</Text><Text style={s.chevron}>›</Text></Pressable>
          <View style={s.sep} />
          <Pressable style={s.setRow} onPress={() => Alert.alert('利用規約 / プライバシー', '本番では各ドキュメントを表示します。')}><Text style={s.setText}>利用規約・プライバシー</Text><Text style={s.chevron}>›</Text></Pressable>
        </View>

        <Pressable style={s.logout} onPress={logout}>
          <Text style={s.logoutText}>ログアウト</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 14 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16 },
  avatar: { width: 54, height: 54, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 22 },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  handle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  vipCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, marginTop: 12 },
  vipHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vipTier: { fontSize: 15, fontWeight: '900', color: colors.gold },
  vipXp: { fontSize: 13, fontWeight: '800', color: colors.sub },
  track: { height: 10, backgroundColor: '#eceef4', borderRadius: 999, marginTop: 12, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: colors.gold, borderRadius: 999 },
  vipNext: { fontSize: 12, color: colors.sub, marginTop: 8 },
  section: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 22, marginBottom: 10 },
  genreWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 },
  genreText: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  editBtn: { marginTop: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line2, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  editText: { color: colors.ink, fontWeight: '700', fontSize: 12 },
  settings: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden' },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15 },
  setText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  chevron: { fontSize: 18, color: colors.muted },
  sep: { height: 1, backgroundColor: colors.line },
  logout: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  logoutText: { color: colors.danger, fontWeight: '800' },
  empty: { color: colors.muted, fontSize: 13 },
});
