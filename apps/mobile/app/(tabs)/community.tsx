import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

type Forum = { id: string; name: string; description: string | null; type: 'public' | 'game' };
type Topic = {
  id: string;
  forum_id: string;
  kind: 'request' | 'question' | 'chat';
  title: string;
  reply_count: number;
  has_bounty: boolean;
  last_activity_at: string;
};
// フォロー中タイトルのフィード（my_game_feed RPC）
type FeedRow = {
  topic_id: string; game_name: string; kind: 'request' | 'question' | 'chat';
  title: string; reply_count: number; has_bounty: boolean; last_activity_at: string;
};

const kinds: Record<string, [string, string]> = {
  request: ['依頼', '#eef0ff'],
  question: ['質問', '#f6efda'],
  chat: ['雑談', '#e6f4ec'],
};

const demoForums: Forum[] = [
  { id: 'guild-rpg', name: 'RPG攻略ギルド', description: '育成相談、編成メモ、周回の工夫を共有する場所です。', type: 'game' },
  { id: 'guild-offer', name: 'ポイ活研究室', description: 'オファー達成条件や検証待ちの体験を持ち寄ります。', type: 'public' },
  { id: 'guild-beginner', name: 'はじめて相談所', description: '交換やミッションの基本を気軽に聞ける場所です。', type: 'public' },
];

const demoTopics: Topic[] = [
  { id: 'topic-1', forum_id: 'guild-rpg', kind: 'question', title: '無課金で序盤を抜ける編成を教えてください', reply_count: 12, has_bounty: true, last_activity_at: new Date(Date.now() - 1000 * 60 * 32).toISOString() },
  { id: 'topic-2', forum_id: 'guild-offer', kind: 'request', title: '週末ブースト対象オファーの達成時間メモ', reply_count: 8, has_bounty: false, last_activity_at: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
  { id: 'topic-3', forum_id: 'guild-beginner', kind: 'chat', title: '初交換できました。次に狙いやすい交換先は？', reply_count: 5, has_bounty: false, last_activity_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString() },
];

export default function Community() {
<<<<<<< HEAD
  const [forums, setForums] = useState<Forum[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [feed, setFeed] = useState<FeedRow[]>([]);
=======
  const [forums, setForums] = useState<Forum[]>(demoForums);
  const [topics, setTopics] = useState<Topic[]>(demoTopics);
  const [refreshing, setRefreshing] = useState(false);
>>>>>>> codex/mvp-stabilization-20260919

  const load = useCallback(async () => {
    const [{ data: f }, { data: t }, { data: fd }] = await Promise.all([
      supabase.from('forums').select('id,name,description,type').limit(20),
<<<<<<< HEAD
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

=======
      supabase
        .from('topics')
        .select('id,forum_id,kind,title,reply_count,has_bounty,last_activity_at')
        .order('last_activity_at', { ascending: false })
        .limit(30),
    ]);
    if (f?.length) setForums(f as Forum[]);
    if (t?.length) setTopics(t as Topic[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
>>>>>>> codex/mvp-stabilization-20260919
        <View style={s.hRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.h}>コミュニティ</Text>
            <Text style={s.lead}>ギルドで攻略、質問、達成条件を持ち寄る</Text>
          </View>
          <Pressable style={s.newBtn} onPress={() => router.push('/topic/new')}>
            <Text style={s.newBtnText}>投稿</Text>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.guildList}>
          {forums.map((forum, index) => (
            <View key={forum.id} style={s.guild}>
              <View style={[s.guildThumb, { backgroundColor: guildColor(index) }]}>
                <Text style={s.guildThumbText}>{forum.name.slice(0, 1)}</Text>
              </View>
              <Text style={s.guildName}>{forum.name}</Text>
              {!!forum.description && <Text style={s.guildDesc} numberOfLines={2}>{forum.description}</Text>}
              <Text style={s.guildType}>{forum.type === 'game' ? 'ゲーム別' : '公開'}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={s.sectionRow}>
          <Text style={s.section}>最近のトピック</Text>
          <Text style={s.more}>新着順</Text>
        </View>
        {topics.map((topic) => {
          const kind = kinds[topic.kind] ?? kinds.chat;
          return (
            <Pressable key={topic.id} style={s.topic} onPress={() => router.push(`/topic/${topic.id}`)}>
              <View style={[s.kindBadge, { backgroundColor: kind[1] }]}><Text style={s.kindText}>{kind[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.topicTitle} numberOfLines={2}>
                  {topic.has_bounty ? '賞金つき: ' : ''}{topic.title}
                </Text>
                <Text style={s.topicMeta}>{topic.reply_count}件の返信 ・ {rel(topic.last_activity_at)}</Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function guildColor(index: number): string {
  return ['#4f46e5', '#1f7a5b', '#b88a2e'][index % 3];
}

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3.6e6);
  if (hours < 1) return 'たった今';
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  hRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  newBtn: { backgroundColor: colors.accent, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16, marginTop: 2 },
<<<<<<< HEAD
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
=======
  newBtnText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  h: { fontSize: 21, fontWeight: '900', color: colors.ink },
  lead: { fontSize: 12, color: colors.sub, marginTop: 4, fontWeight: '700' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10 },
  section: { fontSize: 12, fontWeight: '900', color: colors.sub, letterSpacing: 0.4 },
  more: { marginLeft: 'auto', color: colors.accent, fontWeight: '800', fontSize: 11 },
  guildList: { gap: 10 },
  guild: { width: 184, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 13 },
  guildThumb: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  guildThumbText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  guildName: { fontSize: 14, fontWeight: '900', color: colors.ink },
>>>>>>> codex/mvp-stabilization-20260919
  guildDesc: { fontSize: 12, color: colors.sub, marginTop: 4, lineHeight: 17 },
  guildType: { fontSize: 11, color: colors.muted, fontWeight: '800', marginTop: 8 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  kindBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9 },
  kindText: { fontSize: 11, fontWeight: '900', color: colors.ink },
  topicTitle: { fontSize: 13, fontWeight: '800', color: colors.ink, lineHeight: 18 },
  topicMeta: { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: '700' },
  chevron: { fontSize: 20, color: colors.muted },
});
