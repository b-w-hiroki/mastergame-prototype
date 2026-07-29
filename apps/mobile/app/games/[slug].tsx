import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { GENRES } from '@/lib/types';

type GameRow = {
  id: string; slug: string; name: string; genre: string;
  description: string | null; platforms: string[]; publisher: string | null;
  forum_id: string | null; followers: number; topic_count: number;
};
type Topic = {
  id: string; kind: 'request' | 'question' | 'chat'; title: string;
  reply_count: number; has_bounty: boolean; last_activity_at: string;
};

const KIND: Record<string, [string, string]> = {
  request: ['依頼', '#eef0ff'], question: ['質問', '#f6efda'], chat: ['雑談', '#e6f4ec'],
};
const PLATFORM_LABEL: Record<string, string> = { ios: 'iOS', android: 'Android', pc: 'PC' };

/** ゲームタイトルの掲示板。攻略・質問・パーティ募集がタイトル単位でまとまる。 */
export default function GameDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [game, setGame] = useState<GameRow | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: g, error: gErr } = await supabase
      .from('game_hub_rows').select('*').eq('slug', slug).single();
    if (gErr) throw gErr;
    const row = g as unknown as GameRow;
    setGame(row);

    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      const { data: f } = await supabase.from('user_games')
        .select('game_id').eq('user_id', u.user.id).eq('game_id', row.id);
      setFollowing(((f as unknown[]) ?? []).length > 0);
    }

    if (row.forum_id) {
      const { data: t } = await supabase.from('topics')
        .select('id,kind,title,reply_count,has_bounty,last_activity_at')
        .eq('forum_id', row.forum_id)
        .eq('moderation_state', 'visible')
        .order('last_activity_at', { ascending: false })
        .limit(30);
      setTopics((t as unknown as Topic[]) ?? []);
    }
  }, [slug]);

  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);

  async function toggleFollow() {
    if (!game) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const on = following;
    setBusy(true);
    setFollowing(!on);
    const { error: wErr } = on
      ? await supabase.from('user_games').delete().eq('user_id', u.user.id).eq('game_id', game.id)
      : await supabase.from('user_games').insert({ user_id: u.user.id, game_id: game.id });
    setBusy(false);
    if (wErr) setFollowing(on); // 失敗したら戻す
  }

  const meta = game ? GENRES.find((x) => x.key === game.genre) : undefined;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: true, title: game?.name ?? 'ゲーム' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        {game && (
          <>
            <View style={s.hero}>
              <View style={s.icon}><Text style={s.iconText}>{meta?.emoji ?? '🎮'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{game.name}</Text>
                <Text style={s.meta}>
                  {meta?.label ?? game.genre}
                  {game.platforms?.length ? ` ・ ${game.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join('/')}` : ''}
                </Text>
              </View>
              <Pressable
                style={[s.followBtn, following && s.followOn, busy && { opacity: 0.5 }]}
                onPress={toggleFollow}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={following ? 'フォロー解除' : 'フォロー'}
              >
                <Text style={[s.followText, following && s.followTextOn]}>
                  {following ? 'フォロー中' : 'フォロー'}
                </Text>
              </Pressable>
            </View>

            {game.description && <Text style={s.desc}>{game.description}</Text>}
            <Text style={s.stats}>フォロー {game.followers} ・ 投稿 {game.topic_count}</Text>

            <View style={s.sectionRow}>
              <Text style={s.section}>このゲームの投稿</Text>
              <Pressable style={s.newBtn} onPress={() => router.push('/topic/new')} accessibilityRole="button">
                <Text style={s.newBtnText}>＋ 投稿</Text>
              </Pressable>
            </View>

            {topics.map((t) => {
              const [label, bg] = KIND[t.kind] ?? ['', '#eee'];
              return (
                <Pressable key={t.id} style={s.topic} onPress={() => router.push(`/topic/${t.id}`)}>
                  <View style={[s.kind, { backgroundColor: bg }]}><Text style={s.kindText}>{label}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.topicTitle} numberOfLines={2}>{t.title}</Text>
                    <Text style={s.topicMeta}>
                      返信 {t.reply_count}{t.has_bounty ? ' ・ 報酬あり' : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {!loading && topics.length === 0 && (
              <Text style={s.empty}>まだ投稿がありません。最初の一件を書いてみましょう。</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 26 },
  name: { fontSize: 17, fontWeight: '900', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.muted, fontWeight: '700', marginTop: 3 },
  followBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13 },
  followOn: { backgroundColor: colors.accent },
  followText: { fontSize: 11.5, fontWeight: '800', color: colors.accent },
  followTextOn: { color: '#fff' },
  desc: { fontSize: 13, color: colors.sub, lineHeight: 20, marginTop: 14 },
  stats: { fontSize: 11.5, color: colors.muted, fontWeight: '700', marginTop: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 12 },
  section: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.ink },
  newBtn: { backgroundColor: colors.ink, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 },
  newBtnText: { color: '#fff', fontWeight: '800', fontSize: 11.5 },
  topic: {
    flexDirection: 'row', gap: 10, backgroundColor: colors.paper, borderWidth: 1,
    borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  kind: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  kindText: { fontSize: 10.5, fontWeight: '800', color: colors.ink },
  topicTitle: { fontSize: 13, fontWeight: '700', color: colors.ink, lineHeight: 19 },
  topicMeta: { fontSize: 10.5, color: colors.muted, fontWeight: '700', marginTop: 5 },
  empty: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 26 },
});
