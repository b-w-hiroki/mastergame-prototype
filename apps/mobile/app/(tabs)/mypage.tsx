import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { GENRES } from '@/lib/types';
import type { Genre, Profile, VipInfo } from '@/lib/types';

type Tier = { name: string; min_xp: number; sort: number };

const demoProfile: Profile = {
  id: 'demo',
  username: 'Player',
  handle: '@mastergame',
  avatar_url: null,
  bio: 'ミッションでポイントを貯めて、好きなゲーム報酬に交換中。',
  xp: 6400,
};

const demoTiers: Tier[] = [
  { name: 'ブロンズ', min_xp: 0, sort: 1 },
  { name: 'シルバー', min_xp: 3000, sort: 2 },
  { name: 'ゴールド', min_xp: 10000, sort: 3 },
];

export default function MyPage() {
  const [profile, setProfile] = useState<Profile | null>(demoProfile);
  const [vip, setVip] = useState<VipInfo | null>({ user_id: 'demo', xp: 6400, tier_name: 'シルバー', staking_rate_bps: 150 });
  const [tiers, setTiers] = useState<Tier[]>(demoTiers);
  const [genres, setGenres] = useState<Genre[]>(['rpg', 'puzzle', 'casual']);
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

    if (p) setProfile(p as Profile);
    if (v) setVip(v as VipInfo);
    if (t?.length) setTiers(t as Tier[]);
    if (g?.length) setGenres(((g as { genre: Genre }[]) ?? []).map((x) => x.genre));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const xp = vip?.xp ?? profile?.xp ?? 0;
  const current = [...tiers].reverse().find((tier) => xp >= tier.min_xp) ?? tiers[0];
  const next = tiers.find((tier) => tier.min_xp > xp);
  const progress = next && current ? Math.min(1, (xp - current.min_xp) / (next.min_xp - current.min_xp)) : 1;

  async function logout() {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

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
        <Text style={s.h}>マイページ</Text>

        <View style={s.profile}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(profile?.username ?? 'P').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{profile?.username ?? 'Player'}</Text>
            <Text style={s.handle}>{profile?.handle ?? '@mastergame'}</Text>
            {!!profile?.bio && <Text style={s.bio} numberOfLines={2}>{profile.bio}</Text>}
          </View>
        </View>

        <View style={s.vipCard}>
          <View style={s.vipHead}>
            <Text style={s.vipTier}>VIP {vip?.tier_name ?? current?.name ?? 'ブロンズ'}</Text>
            <Text style={s.vipXp}>{xp.toLocaleString()} XP</Text>
          </View>
          <View style={s.track}><View style={[s.fill, { width: `${progress * 100}%` }]} /></View>
          <Text style={s.vipNext}>
            {next ? `次のランク「${next.name}」まで あと ${(next.min_xp - xp).toLocaleString()} XP` : '最高ランクに到達しています'}
          </Text>
        </View>

        <Text style={s.section}>好きなジャンル</Text>
        <View style={s.genreWrap}>
          {genres.map((genre) => {
            const meta = GENRES.find((item) => item.key === genre);
            return <View key={genre} style={s.genreChip}><Text style={s.genreText}>{meta?.label ?? genre}</Text></View>;
          })}
        </View>
        <Pressable style={s.editBtn} onPress={() => router.push('/genres')}>
          <Text style={s.editText}>ジャンルを編集</Text>
        </Pressable>

        <Text style={s.section}>設定</Text>
        <View style={s.settings}>
          <Pressable style={s.setRow} onPress={() => router.push('/exchange')}>
            <Text style={s.setText}>交換履歴・ポイント交換</Text>
            <Text style={s.chevron}>›</Text>
          </Pressable>
          <View style={s.sep} />
          <Pressable style={s.setRow} onPress={() => Alert.alert('プッシュ通知', '本番では端末の通知設定と連動します。')}>
            <Text style={s.setText}>プッシュ通知</Text>
            <Text style={s.chevron}>›</Text>
          </Pressable>
          <View style={s.sep} />
          <Pressable style={s.setRow} onPress={() => Alert.alert('利用規約 / プライバシー', '本番では各ドキュメントを表示します。')}>
            <Text style={s.setText}>利用規約・プライバシー</Text>
            <Text style={s.chevron}>›</Text>
          </Pressable>
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
  content: { padding: 16, paddingBottom: 32 },
  h: { fontSize: 21, fontWeight: '900', color: colors.ink, marginBottom: 14 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900', fontSize: 22 },
  name: { fontSize: 16, fontWeight: '900', color: colors.ink },
  handle: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: '700' },
  bio: { color: colors.sub, fontSize: 12, lineHeight: 17, marginTop: 7 },
  vipCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, marginTop: 12 },
  vipHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vipTier: { fontSize: 15, fontWeight: '900', color: colors.gold },
  vipXp: { fontSize: 13, fontWeight: '800', color: colors.sub },
  track: { height: 10, backgroundColor: '#eceef4', borderRadius: 999, marginTop: 12, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: colors.gold, borderRadius: 999 },
  vipNext: { fontSize: 12, color: colors.sub, marginTop: 8, fontWeight: '700' },
  section: { fontSize: 12, fontWeight: '900', color: colors.sub, marginTop: 22, marginBottom: 10, letterSpacing: 0.4 },
  genreWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: { backgroundColor: colors.accentSoft, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 },
  genreText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  editBtn: { marginTop: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line2, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: colors.paper },
  editText: { color: colors.ink, fontWeight: '800', fontSize: 12 },
  settings: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden' },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15 },
  setText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  chevron: { fontSize: 18, color: colors.muted },
  sep: { height: 1, backgroundColor: colors.line },
  logout: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  logoutText: { color: colors.danger, fontWeight: '900' },
});
