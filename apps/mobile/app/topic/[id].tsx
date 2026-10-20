import { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { AppAlert as Alert } from '@/components/AppAlert';
import { useAction } from '@/lib/useAction';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

type Topic = { id: string; title: string; kind: string; status: string; has_bounty: boolean; author_id: string; best_answer_post_id: string | null };
type Post = { id: string; body: string; is_op: boolean; author_id: string; created_at: string };
type Reaction = { post_id: string; user_id: string; kind: string };

function isTopicRow(value: unknown, id: string): value is Topic {
  if (!isObject(value)) return false;
  return value.id === id && typeof value.title === 'string' && value.title.trim().length > 0
    && ['request', 'question', 'chat'].includes(String(value.kind))
    && ['open', 'resolved', 'closed', 'removed'].includes(String(value.status))
    && typeof value.has_bounty === 'boolean'
    && typeof value.author_id === 'string' && value.author_id.length > 0
    && (value.best_answer_post_id === null || (typeof value.best_answer_post_id === 'string' && value.best_answer_post_id.length > 0));
}

function isPostRow(value: unknown): value is Post {
  if (!isObject(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0
    && typeof value.body === 'string' && value.body.trim().length > 0
    && typeof value.is_op === 'boolean'
    && typeof value.author_id === 'string' && value.author_id.length > 0
    && typeof value.created_at === 'string' && Number.isFinite(Date.parse(value.created_at));
}

function isReactionRow(value: unknown, postIds: Set<string>): value is Reaction {
  if (!isObject(value)) return false;
  return typeof value.post_id === 'string' && postIds.has(value.post_id)
    && typeof value.user_id === 'string' && value.user_id.length > 0
    && (value.kind === 'like' || value.kind === 'spotlight');
}

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
  const displayedUid = useRef<string | null | undefined>(undefined);
  const actionVersion = useRef(0);
  const { busy, run } = useAction();

  const load = useCallback(async (isCurrent: () => boolean) => {
    actionVersion.current += 1;
    if (!id) return;
    setTopic(null);
    setPosts([]);
    setReactions([]);
    setUid(null);
    const [{ data: u, error: uErr }, { data: t, error: tErr }, { data: p, error: pErr }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('topics').select('id,title,kind,status,has_bounty,author_id,best_answer_post_id').eq('id', id).single(),
      supabase.from('posts').select('id,body,is_op,author_id,created_at').eq('topic_id', id).order('created_at'),
    ]);
    if (uErr || tErr || pErr) throw uErr || tErr || pErr;
    if (!isTopicRow(t, id) || !Array.isArray(p) || !p.every(isPostRow)
      || new Set(p.map((post) => post.id)).size !== p.length) {
      throw new Error('トピックの内容を確認できませんでした。');
    }
    const list = p;
    let nextReactions: Reaction[] = [];
    if (list.length > 0) {
      const { data: r, error: rErr } = await supabase.from('reactions')
        .select('post_id,user_id,kind').in('post_id', list.map((x) => x.id));
      if (rErr) throw rErr;
      const postIds = new Set(list.map((post) => post.id));
      if (!Array.isArray(r) || !r.every((reaction) => isReactionRow(reaction, postIds))
        || new Set(r.map((reaction) => `${reaction.post_id}\u0000${reaction.user_id}\u0000${reaction.kind}`)).size !== r.length) {
        throw new Error('リアクションの内容を確認できませんでした。');
      }
      nextReactions = r;
    }
    if (!isCurrent()) return;
    const { data: currentUser, error: currentAuthError } = await supabase.auth.getUser();
    if (currentAuthError || currentUser.user?.id !== u.user?.id) {
      throw new Error('トピックの取得中にログイン状態が変わりました。');
    }
    if (!isCurrent()) return;
    const nextUid = u.user?.id ?? null;
    if (displayedUid.current !== undefined && displayedUid.current !== nextUid) setReply('');
    displayedUid.current = nextUid;
    setUid(nextUid);
    setTopic(t);
    setPosts(list);
    setReactions(nextReactions);
  }, [id]);

  // 自動ロードは無効化し、フォーカス時ロードに一本化（初回の二重フェッチを防ぐ）
  const { loading, error, reload, cancel } = useLoader(load, { auto: false });
  useFocusEffect(useCallback(() => { void reload(); return () => { actionVersion.current += 1; cancel(); }; }, [reload, cancel]));

  const isAuthor = !!topic && !!uid && topic.author_id === uid;
  const resolved = topic?.status === 'resolved' || topic?.status === 'closed';

  function likesFor(postId: string) {
    const likes = reactions.filter((r) => r.post_id === postId && r.kind === 'like');
    return { count: likes.length, mine: likes.some((r) => r.user_id === uid) };
  }

  async function confirmActionUser(expectedUid: string, version: number, afterSend = false): Promise<boolean> {
    const { data, error: authError } = await supabase.auth.getUser();
    if (actionVersion.current !== version) return false;
    if (!authError && data.user?.id === expectedUid) return true;
    Alert.alert(afterSend ? '操作結果を確認してください' : 'ログイン状態が変わりました',
      afterSend ? '送信結果が不明です。再操作する前に表示を更新して確認してください。' : '画面を更新してから操作してください。');
    await reload();
    return false;
  }

  async function sendReply() {
    if (reply.trim() === '') return;
    if (loading || error || !topic || topic.id !== id) return;
    if (!uid) { Alert.alert('ログインが必要です'); return; }
    const version = actionVersion.current;
    await run(async () => {
    if (!await confirmActionUser(uid, version)) return;
    const { data, error } = await supabase.rpc('add_reply', { p_topic_id: id, p_body: reply });
    if (!await confirmActionUser(uid, version, true)) return;
    if (error) { Alert.alert('返信できませんでした', error.message); return; }
    if (!isSuccessfulReply(data)) {
      Alert.alert('返信結果を確認できませんでした', '再送する前に返信一覧を更新して、投稿済みか確認してください。');
      await reload();
      return;
    }
    setReply('');
    await reload();
    }, '返信結果を確認できませんでした');
  }

  async function toggleLike(postId: string) {
    if (loading || error || !topic || topic.id !== id || !posts.some((post) => post.id === postId)) return;
    if (!uid) { Alert.alert('ログインが必要です'); return; }
    const version = actionVersion.current;
    await run(async () => {
    if (!await confirmActionUser(uid, version)) return;
    const { data, error } = await supabase.rpc('toggle_reaction', { p_post_id: postId, p_kind: 'like' });
    if (!await confirmActionUser(uid, version, true)) return;
    if (error) { Alert.alert('反応できませんでした', error.message); return; }
    if (!isSuccessfulReaction(data)) {
      Alert.alert('リアクションの結果を確認できませんでした', '表示を更新して状態を確認してください。');
    }
    await reload();
    }, 'リアクションの結果を確認できませんでした');
  }

  async function pickBest(postId: string) {
    if (loading || error || !topic || topic.id !== id || !posts.some((post) => post.id === postId && !post.is_op)) return;
    if (!uid || !isAuthor || resolved) return;
    const version = actionVersion.current;
    Alert.alert('ベストアンサー', topic?.has_bounty
      ? 'この回答をベストアンサーにします。賭けたポイントが回答者へ進呈されます。'
      : 'この回答をベストアンサーにします。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '決定',
        onPress: async () => {
          await run(async () => {
          if (!await confirmActionUser(uid, version)) return;
          const { data, error } = await supabase.rpc('set_best_answer', { p_topic_id: id, p_post_id: postId });
          if (!await confirmActionUser(uid, version, true)) return;
          if (error) { Alert.alert('設定できませんでした', error.message); return; }
          if (!isSuccessfulBestAnswer(data, postId)) {
            Alert.alert('ベストアンサーの結果を確認できませんでした', '再操作する前に回答の表示とポイント履歴を確認してください。');
          }
          await reload();
          }, 'ベストアンサーの設定結果を確認できませんでした');
        },
      },
    ]);
  }

  async function submitReport(targetType: 'topic' | 'post', targetId: string, reason: 'spam' | 'inappropriate' | 'harassment' | 'other') {
    if (loading || error || !topic || topic.id !== id) return;
    if (targetType === 'topic' ? targetId !== topic.id : !posts.some((post) => post.id === targetId)) return;
    if (!uid) return;
    const version = actionVersion.current;
    await run(async () => {
    if (!await confirmActionUser(uid, version)) return;
    const { error: repErr } = await supabase.from('reports').insert({
      reporter_id: uid, target_type: targetType, target_id: targetId, reason,
    });
    if (!await confirmActionUser(uid, version, true)) return;
    Alert.alert(repErr ? '通報できませんでした' : '通報を受け付けました', repErr?.message ?? '運営が確認します。');
    }, '通報結果を確認できませんでした');
  }

  function report(targetType: 'topic' | 'post', targetId: string) {
    if (loading || error || !topic || topic.id !== id) return;
    if (!uid) { Alert.alert('ログインが必要です'); return; }
    // 通報理由を選択（reports.reason の enum に一致）
    Alert.alert('通報の理由を選択', 'この内容を運営に報告します。', [
      { text: 'スパム・宣伝', onPress: () => { submitReport(targetType, targetId, 'spam').catch(() => {}); } },
      { text: '不適切なコンテンツ', onPress: () => { submitReport(targetType, targetId, 'inappropriate').catch(() => {}); } },
      { text: '誹謗中傷・ハラスメント', onPress: () => { submitReport(targetType, targetId, 'harassment').catch(() => {}); } },
      { text: 'キャンセル', style: 'cancel' },
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
          {!loading && !error && posts.length === 0 && <Text style={s.empty}>まだ投稿がありません</Text>}
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

function isSuccessfulReply(value: unknown): boolean {
  if (!isObject(value)) return false;
  return value.ok === true && typeof value.post_id === 'string' && UUID_PATTERN.test(value.post_id);
}

function isSuccessfulReaction(value: unknown): boolean {
  if (!isObject(value)) return false;
  return value.ok === true && typeof value.reacted === 'boolean'
    && typeof value.count === 'number' && Number.isSafeInteger(value.count) && value.count >= 0;
}

function isSuccessfulBestAnswer(value: unknown, postId: string): boolean {
  return isObject(value) && value.ok === true && value.best_answer_post_id === postId;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
