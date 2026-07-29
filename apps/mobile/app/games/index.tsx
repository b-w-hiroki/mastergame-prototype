import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { GENRES } from '@/lib/types';

type GameRow = {
  id: string; slug: string; name: string; genre: string;
  description: string | null; platforms: string[];
  is_featured: boolean; followers: number; topic_count: number;
};

const PLATFORM_LABEL: Record<string, string> = { ios: 'iOS', android: 'Android', pc: 'PC' };

/**
 * ゲーム一覧（タイトルハブ）。
 * ここが「ポイ活アプリ」ではなく「ゲーマー向けポイ活」であることを見せる面。
 * タイトルをフォローすると、そのタイトルの動きだけがコミュニティのフィードに流れる。
 */
export default function Games() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const [{ data: rows, error: gErr }, { data: mine }] = await Promise.all([
      supabase.from('game_hub_rows').select('*').order('is_featured', { ascending: false }).order('name'),
      u.user
        ? supabase.from('user_games').select('game_id').eq('user_id', u.user.id)
        : Promise.resolve({ data: [] as { game_id: string }[] }),
    ]);
    if (gErr) throw gErr;
    setGames((rows as unknown as GameRow[]) ?? []);
    setFollowing(new Set(((mine as { game_id: string }[]) ?? []).map((r) => r.game_id)));
  }, []);

  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);

  async function toggleFollow(game: GameRow) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const on = following.has(game.id);
    setBusy(game.id);
    // 楽観更新：失敗したら戻す
    setFollowing((prev) => {
      const next = new Set(prev);
      if (on) next.delete(game.id); else next.add(game.id);
      return next;
    });
    const { error: wErr } = on
      ? await supabase.from('user_games').delete().eq('user_id', u.user.id).eq('game_id', game.id)
      : await supabase.from('user_games').insert({ user_id: u.user.id, game_id: game.id });
    setBusy(null);
    if (wErr) {
      setFollowing((prev) => {
        const next = new Set(prev);
        if (on) next.add(game.id); else next.delete(game.id);
        return next;
      });
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: true, title: 'ゲーム' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        <Text style={s.lead}>
          気になるタイトルをフォローすると、そのゲームの攻略・質問だけがコミュニティに流れます。
        </Text>

        {games.map((g) => {
          const meta = GENRES.find((x) => x.key === g.genre);
          const on = following.has(g.id);
          return (
            <Pressable key={g.id} style={s.card} onPress={() => router.push(`/games/${g.slug}`)}>
              <View style={s.icon}><Text style={s.iconText}>{meta?.emoji ?? '🎮'}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={s.titleRow}>
                  <Text style={s.name} numberOfLines={1}>{g.name}</Text>
                  {g.is_featured && <View style={s.featured}><Text style={s.featuredText}>注目</Text></View>}
                </View>
                {g.description && <Text style={s.desc} numberOfLines={2}>{g.description}</Text>}
                <Text style={s.meta}>
                  {meta?.label ?? g.genre}
                  {g.platforms?.length ? ` ・ ${g.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join('/')}` : ''}
                  {` ・ 投稿 ${g.topic_count}`}
                  {` ・ フォロー ${g.followers}`}
                </Text>
              </View>
              <Pressable
                style={[s.followBtn, on && s.followOn, busy === g.id && { opacity: 0.5 }]}
                onPress={() => toggleFollow(g)}
                disabled={busy === g.id}
                accessibilityRole="button"
                accessibilityLabel={`${g.name}を${on ? 'フォロー解除' : 'フォロー'}`}
              >
                <Text style={[s.followText, on && s.followTextOn]}>{on ? 'フォロー中' : 'フォロー'}</Text>
              </Pressable>
            </Pressable>
          );
        })}

        {!loading && games.length === 0 && (
          <Text style={s.empty}>ゲームがまだ登録されていません</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  lead: { fontSize: 12, color: colors.sub, lineHeight: 18, marginBottom: 14 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '800', color: colors.ink, flexShrink: 1 },
  featured: { backgroundColor: colors.goldSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  featuredText: { fontSize: 10, fontWeight: '800', color: colors.gold },
  desc: { fontSize: 12, color: colors.sub, marginTop: 3 },
  meta: { fontSize: 10.5, color: colors.muted, fontWeight: '700', marginTop: 5 },
  followBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  followOn: { backgroundColor: colors.accent },
  followText: { fontSize: 11, fontWeight: '800', color: colors.accent },
  followTextOn: { color: '#fff' },
  empty: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
});
