import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Topic = { id: string; title: string; kind: string; status: string; has_bounty: boolean };
type Post = { id: string; body: string; is_op: boolean; author_id: string; created_at: string };

/**
 * トピック詳細：投稿（OP＋返信）を表示。通報が可能（reports へ insert、RLSで許可済み）。
 * 返信・リアクション・ベストアンサーは次フェーズ（書き込みRLS/RPC整備）で対応。
 */
export default function TopicDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('topics').select('id,title,kind,status,has_bounty').eq('id', id).single(),
      supabase.from('posts').select('id,body,is_op,author_id,created_at').eq('topic_id', id).order('created_at'),
    ]);
    setTopic((t as Topic) ?? null);
    setPosts((p as Post[]) ?? []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function report(targetType: 'topic' | 'post', targetId: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    Alert.alert('通報する', 'この内容を運営に通報しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '通報', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('reports').insert({
            reporter_id: u.user!.id, target_type: targetType, target_id: targetId, reason: 'inappropriate',
          });
          Alert.alert(error ? '通報できませんでした' : '通報を受け付けました', error?.message ?? '運営が確認します。');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <Stack.Screen options={{ title: 'トピック', headerShown: true }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {topic && (
          <View style={s.head}>
            <Text style={s.title}>{topic.has_bounty ? '🎯 ' : ''}{topic.title}</Text>
            <Pressable onPress={() => report('topic', topic.id)}><Text style={s.reportLink}>通報</Text></Pressable>
          </View>
        )}

        {posts.map((p) => (
          <View key={p.id} style={[s.post, p.is_op && s.op]}>
            {p.is_op && <Text style={s.opTag}>投稿者</Text>}
            <Text style={s.body}>{p.body}</Text>
            <View style={s.postFoot}>
              <Text style={s.date}>{fmt(p.created_at)}</Text>
              <Pressable onPress={() => report('post', p.id)}><Text style={s.reportSmall}>通報</Text></Pressable>
            </View>
          </View>
        ))}
        {posts.length === 0 && <Text style={s.empty}>まだ投稿がありません</Text>}

        <Text style={s.note}>※ 返信・リアクション・ベストアンサー（賭け質問）は次フェーズで対応予定です。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.ink, lineHeight: 24 },
  reportLink: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  post: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  op: { borderColor: colors.accent },
  opTag: { fontSize: 10, fontWeight: '800', color: colors.accent, marginBottom: 6 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 21 },
  postFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  date: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  reportSmall: { fontSize: 11, color: colors.muted },
  empty: { color: colors.muted, fontSize: 13 },
  note: { fontSize: 11, color: colors.muted, marginTop: 16, lineHeight: 16 },
});
