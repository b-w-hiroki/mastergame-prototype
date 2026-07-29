import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

type Forum = { id: string; name: string; description: string | null; type: 'public' | 'game' };
type Topic = {
  id: string; forum_id: string; kind: 'request' | 'question' | 'chat';
  title: string; reply_count: number; has_bounty: boolean; last_activity_at: string;
};
// フォロー中タイトルのフィード（my_game_feed RPC）
type FeedRow = {
  topic_id: string; game_name: string; kind: 'request' | 'question' | 'chat';
  title: string; reply_count: number; has_bounty: boolean; last_activity_at: string;
};

const KIND: Record<string, [string, string]> = {
  request: ['依頼', '#eef0ff'], question: ['質問', '#f6efda'], chat: ['雑談', '#e6f4ec'],
};

/**
 * コミュニティ（prototype core-flow.html のコミュニティに対応）。
 * ギルド（フォーラム）一覧と最近のトピック。タップでトピック詳細へ。
 * 「＋ 投稿」で新規トピック作成（/topic/new → create_topic RPC）。
 */
export default function Community() {
  const [forums, setForums] = useState<Forum[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [feed, setFeed] = useState<FeedRow[]>([]);

  const load = useCallback(async () => {
    const [{ data: f }, { data: t }, { data: fd }] = await Promise.all([
      supabase.from('forums').select('id,name,description,type').limit(20),
      supabase.from('topics').select('id,forum_id,kind,title,reply_count,has_bounty,last_activity_at')
        .order('last_activity_at', { ascending: false }).limit(30),
      supabase.rpc('my_game_feed', { p_limit: 20 }),
    ]);
    setForums((f as Forum[]) ?? []);
    setTopics((t as Topic[]) ?? []);
    setFeed((fd as unknown as FeedRow[]) ?? []);
  }, []);

  // 自動ロードは無効化し、フォーカス時ロードに一本化（初回の二重フェッチを防ぐ）
  const { loading, error, refreshing, reload, onRefresh } = useLoader(load, { auto: false });
  useFocusEffect(useCallback(() => { reload().catch(() => {}); }, [reload]));

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        <View style={s.hRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.h}>コミュニティ</Text>
            <Text style={s.lead}>ギルド（フォーラム）で助け合い。依頼・質問・雑談。</Text>
          </View>
          <Pressable style={s.newBtn} onPress={() => router.push('/topic/new')}>
            <Text style={s.newBtnText}>＋ 投稿</Text>
          </Pressable>
        </View>

        {/* フォロー中タイトルの動き。汎用の新着一覧より上に置く＝「ゲーマー向け」の面を主役にする。 */}
        <View style={s.sectionRow}>
          <Text style={s.section}>フォロー中のゲーム</Text>
          <Pressable onPress={() => router.push('/games')} accessibilityRole="button">
            <Text style={s.moreLink}>ゲームを探す ›</Text>
          </Pressable>
        </View>
        {feed.length === 0 ? (
          <Pressable style={s.emptyCard} onPress={() => router.push('/games')} accessibilityRole="button">
            <Text style={s.emptyCardTitle}>🎮 好きなゲームをフォローしよう</Text>
            <Text style={s.emptyCardText}>
              タイトルをフォローすると、そのゲームの攻略・質問だけがここに流れます。
            </Text>
          </Pressable>
        ) : (
          feed.map((r) => {
            const k = KIND[r.kind] ?? KIND.chat;
            return (
              <Pressable key={r.topic_id} style={s.topic} onPress={() => router.push(`/topic/${r.topic_id}`)}>
                <View style={[s.kindBadge, { backgroundColor: k[1] }]}><Text style={s.kindText}>{k[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.gameTag}>{r.game_name}</Text>
                  <Text style={s.topicTitle} numberOfLines={2}>{r.has_bounty ? '🎯 ' : ''}{r.title}</Text>
                  <Text style={s.topicMeta}>💬 {r.reply_count} ・ {rel(r.last_activity_at)}</Text>
                </View>
                <Text style={s.chevron}>›</Text>
              </Pressable>
            );
          })
        )}

        <Text style={s.section}>ギルド</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {forums.map((f) => (
            <View key={f.id} style={s.guild}>
              <Text style={s.guildName}>{f.name}</Text>
              {f.description && <Text style={s.guildDesc} numberOfLines={2}>{f.description}</Text>}
              <Text style={s.guildType}>{f.type === 'game' ? '🎮 ゲーム' : '🌐 公開'}</Text>
            </View>
          ))}
          {forums.length === 0 && <Text style={s.empty}>ギルドがまだありません</Text>}
        </ScrollView>

        <Text style={s.section}>最近のトピック</Text>
        {topics.length === 0 && <Text style={s.empty}>トピックがまだありません</Text>}
        {topics.map((t) => {
          const k = KIND[t.kind] ?? KIND.chat;
          return (
            <Pressable key={t.id} style={s.topic} onPress={() => router.push(`/topic/${t.id}`)}>
              <View style={[s.kindBadge, { backgroundColor: k[1] }]}><Text style={s.kindText}>{k[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.topicTitle} numberOfLines={2}>{t.has_bounty ? '🎯 ' : ''}{t.title}</Text>
                <Text style={s.topicMeta}>💬 {t.reply_count} ・ {rel(t.last_activity_at)}</Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return 'たった今';
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  newBtn: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, marginTop: 2 },
  newBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  h: { fontSize: 20, fontWeight: '800', color: colors.ink },
  lead: { fontSize: 13, color: colors.sub, marginTop: 4 },
  section: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 22, marginBottom: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  moreLink: { fontSize: 12, fontWeight: '800', color: colors.accent, marginTop: 22, marginBottom: 10 },
  emptyCard: { backgroundColor: colors.accentSoft, borderRadius: 14, padding: 16 },
  emptyCardTitle: { fontSize: 13, fontWeight: '800', color: colors.accent },
  emptyCardText: { fontSize: 12, color: colors.sub, marginTop: 6, lineHeight: 18 },
  gameTag: { fontSize: 10.5, fontWeight: '800', color: colors.accent, marginBottom: 3 },
  guild: { width: 180, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14 },
  guildName: { fontSize: 14, fontWeight: '800', color: colors.ink },
  guildDesc: { fontSize: 12, color: colors.sub, marginTop: 4, lineHeight: 17 },
  guildType: { fontSize: 11, color: colors.muted, fontWeight: '700', marginTop: 8 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  kindBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9 },
  kindText: { fontSize: 11, fontWeight: '800', color: colors.ink },
  topicTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  topicMeta: { fontSize: 11, color: colors.muted, marginTop: 4 },
  chevron: { fontSize: 20, color: colors.muted },
  empty: { color: colors.muted, fontSize: 13 },
});
