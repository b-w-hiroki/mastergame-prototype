import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

type Topic = { id: string; title: string; kind: string; status: string; has_bounty: boolean; author_id: string; best_answer_post_id: string | null };
type Post = { id: string; body: string; is_op: boolean; author_id: string; created_at: string };
type Reaction = { post_id: string; user_id: string; kind: string };

/**
 * トピック詳細：OP＋返信を表示し、返信・リアクション・ベストアンサーが可能。
 * 書き込みは SECURITY DEFINER RPC（0012_community_rpc.sql）経由。通報は reports へ直接 insert。
 */
export default function TopicDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: u }, { data: t }, { data: p }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('topics').select('id,title,kind,status,has_bounty,author_id,best_answer_post_id').eq('id', id).single(),
      supabase.from('posts').select('id,body,is_op,author_id,created_at').eq('topic_id', id).order('created_at'),
    ]);
    setUid(u.user?.id ?? null);
    setTopic((t as Topic) ?? null);
    const list = (p as Post[]) ?? [];
    setPosts(list);
    if (list.length > 0) {
      const { data: r } = await supabase.from('reactions')
        .select('post_id,user_id,kind').in('post_id', list.map((x) => x.id));
      setReactions((r as Reaction[]) ?? []);
    } else {
      setReactions([]);
    }
  }, [id]);

  // 自動ロードは無効化し、フォーカス時ロードに一本化（初回の二重フェッチを防ぐ）
  const { loading, error, reload } = useLoader(load, { auto: false });
  useFocusEffect(useCallback(() => { reload().catch(() => {}); }, [reload]));

  const isAuthor = !!topic && !!uid && topic.author_id === uid;
  const resolved = topic?.status === 'resolved' || topic?.status === 'closed';

  function likesFor(postId: string) {
    const likes = reactions.filter((r) => r.post_id === postId && r.kind === 'like');
    return { count: likes.length, mine: likes.some((r) => r.user_id === uid) };
  }

  async function sendReply() {
    if (reply.trim() === '') return;
    if (!uid) { Alert.alert('ログインが必要です'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('add_reply', { p_topic_id: id, p_body: reply });
    setBusy(false);
    if (error) { Alert.alert('返信できませんでした', error.message); return; }
    setReply('');
    await reload();
  }

  async function toggleLike(postId: string) {
    if (!uid) { Alert.alert('ログインが必要です'); return; }
    const { error } = await supabase.rpc('toggle_reaction', { p_post_id: postId, p_kind: 'like' });
    if (error) { Alert.alert('反応できませんでした', error.message); return; }
    await reload();
  }

  async function pickBest(postId: string) {
    Alert.alert('ベストアンサー', topic?.has_bounty
      ? 'この回答をベストアンサーにします。賭けたポイントが回答者へ進呈されます。'
      : 'この回答をベストアンサーにします。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '決定',
        onPress: async () => {
          const { error } = await supabase.rpc('set_best_answer', { p_topic_id: id, p_post_id: postId });
          if (error) { Alert.alert('設定できませんでした', error.message); return; }
          await reload();
        },
      },
    ]);
  }

  async function report(targetType: 'topic' | 'post', targetId: string) {
    if (!uid) return;
    Alert.alert('通報する', 'この内容を運営に通報しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '通報', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('reports').insert({
            reporter_id: uid, target_type: targetType, target_id: targetId, reason: 'inappropriate',
          });
          Alert.alert(error ? '通報できませんでした' : '通報を受け付けました', error?.message ?? '運営が確認します。');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <Stack.Screen options={{ title: 'トピック', headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          {loading && <LoadingView />}
          {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}
          {topic && (
            <View style={s.head}>
              <Text style={s.title}>
                {topic.has_bounty ? '🎯 ' : ''}{topic.title}
                {resolved ? '  ✅' : ''}
              </Text>
              <Pressable onPress={() => report('topic', topic.id)}><Text style={s.reportLink}>通報</Text></Pressable>
            </View>
          )}

          {posts.map((p) => {
            const like = likesFor(p.id);
            const isBest = topic?.best_answer_post_id === p.id;
            return (
              <View key={p.id} style={[s.post, p.is_op && s.op, isBest && s.best]}>
                {isBest && <Text style={s.bestTag}>★ ベストアンサー</Text>}
                {p.is_op && !isBest && <Text style={s.opTag}>投稿者</Text>}
                <Text style={s.body}>{p.body}</Text>
                <View style={s.postFoot}>
                  <Text style={s.date}>{fmt(p.created_at)}</Text>
                  <View style={s.actions}>
                    <Pressable onPress={() => toggleLike(p.id)} hitSlop={8}>
                      <Text style={[s.like, like.mine && s.likeOn]}>♥ {like.count}</Text>
                    </Pressable>
                    {isAuthor && !p.is_op && !resolved && (
                      <Pressable onPress={() => pickBest(p.id)} hitSlop={8}>
                        <Text style={s.bestBtn}>ベストに選ぶ</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => report('post', p.id)} hitSlop={8}>
                      <Text style={s.reportSmall}>通報</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
          {posts.length === 0 && <Text style={s.empty}>まだ投稿がありません</Text>}
        </ScrollView>

        {topic && topic.status !== 'closed' && topic.status !== 'removed' && (
          <View style={s.composer}>
            <TextInput style={s.composerInput} placeholder="返信を書く…" value={reply}
              onChangeText={setReply} multiline />
            <Pressable style={[s.send, (busy || reply.trim() === '') && { opacity: 0.5 }]}
              onPress={sendReply} disabled={busy || reply.trim() === ''}>
              <Text style={s.sendText}>{busy ? '…' : '送信'}</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
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
  best: { borderColor: colors.ok, backgroundColor: colors.okSoft },
  bestTag: { fontSize: 10, fontWeight: '800', color: colors.ok, marginBottom: 6 },
  opTag: { fontSize: 10, fontWeight: '800', color: colors.accent, marginBottom: 6 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 21 },
  postFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  date: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  like: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  likeOn: { color: colors.danger },
  bestBtn: { fontSize: 12, color: colors.ok, fontWeight: '800' },
  reportSmall: { fontSize: 11, color: colors.muted },
  empty: { color: colors.muted, fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
  composerInput: { flex: 1, maxHeight: 120, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.ink },
  send: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16 },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
