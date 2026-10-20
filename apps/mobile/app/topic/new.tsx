import { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { AppAlert as Alert } from '@/components/AppAlert';
import { useAction } from '@/lib/useAction';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

type Forum = { id: string; name: string; type: 'public' | 'game' };
type Kind = 'request' | 'question' | 'chat';

const KINDS: { key: Kind; label: string }[] = [
  { key: 'request', label: '依頼' },
  { key: 'question', label: '質問' },
  { key: 'chat', label: '雑談' },
];
const MAX_BOUNTY = 2_147_483_647; // create_topic の integer 引数

function topicIdFromResult(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  return result.ok === true && typeof result.topic_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.topic_id)
    ? result.topic_id : null;
}

function isForumOption(value: unknown): value is Forum {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length > 0
    && typeof row.name === 'string' && row.name.trim().length > 0
    && (row.type === 'public' || row.type === 'game');
}

/**
 * 新規トピック作成。フォーラム・種別・タイトル・本文を入力して create_topic RPC を呼ぶ。
 * 質問の場合のみポイントを賭けられる（作成時にエスクロー）。
 */
export default function NewTopic() {
  const params = useLocalSearchParams<{ forum?: string; forumName?: string }>();
  const requestedForum = typeof params.forum === 'string' ? params.forum : null;
  const [forums, setForums] = useState<Forum[]>([]);
  const [forumId, setForumId] = useState<string | null>(requestedForum);
  const [kind, setKind] = useState<Kind>('question');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [bounty, setBounty] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [reading, setReading] = useState(true);
  const { busy, run } = useAction();
  const readVersion = useRef(0);
  const loadedUser = useRef<string | null>(null);

  const load = useCallback(async (isCurrent: () => boolean) => {
    ++readVersion.current;
    loadedUser.current = null;
    setReading(true);
    setForums([]);
    setForumId(null);
    setBalance(null);
    try {
    const { data: u, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!u.user) throw new Error('not authenticated');
    const [{ data, error: forumError }, walletRes] = await Promise.all([
      supabase.from('forums').select('id,name,type').limit(30),
      supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single(),
    ]);
    if (forumError) throw forumError;
    if (walletRes.error) throw walletRes.error;
    if (!Array.isArray(data) || !walletRes.data || typeof walletRes.data.balance !== 'number'
      || !Number.isSafeInteger(walletRes.data.balance) || walletRes.data.balance < 0) {
      throw new Error('投稿先と残高を確認できませんでした。');
    }
    if (!data.every(isForumOption) || new Set(data.map((forum) => forum.id)).size !== data.length) {
      throw new Error('投稿先を確認できませんでした。');
    }
    const list = [...data];
    if (requestedForum && !list.some((forum) => forum.id === requestedForum)) {
      const { data: target, error: targetError } = await supabase.from('forums')
        .select('id,name,type').eq('id', requestedForum).maybeSingle();
      if (targetError || !isForumOption(target) || target.id !== requestedForum) {
        throw targetError ?? new Error('forum unavailable');
      }
      list.push(target);
    }
    if (!isCurrent()) return;
    const { data: currentUser, error: currentAuthError } = await supabase.auth.getUser();
    if (currentAuthError || currentUser.user?.id !== u.user.id) {
      throw new Error('投稿先の取得中にログイン状態が変わりました。');
    }
    if (!isCurrent()) return;
    loadedUser.current = u.user.id;
    setForums(list);
    setBalance(walletRes.data.balance);
    setForumId((current) => list.some((forum) => forum.id === current) ? current
      : requestedForum ?? list[0]?.id ?? null);
    } finally { if (isCurrent()) setReading(false); }
  }, [requestedForum]);

  const { loading, error, reload } = useLoader(load);

  async function isCurrentAction(userId: string, version: number): Promise<boolean> {
    if (loadedUser.current !== userId || readVersion.current !== version) return false;
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      return !authError && data.user?.id === userId
        && loadedUser.current === userId && readVersion.current === version;
    } catch { return false; }
  }

  // 暗黙の丸め・指数表記・安全な整数範囲外の送信を避ける。
  const bountyText = kind === 'question' ? bounty.trim() : '';
  const bountyAmount = bountyText === '' ? 0 : Number(bountyText);
  const bountyValid = (bountyText === '' || /^\d+$/.test(bountyText)) && Number.isSafeInteger(bountyAmount)
    && bountyAmount >= 0 && bountyAmount <= MAX_BOUNTY;
  const bountyAffordable = bountyValid && balance !== null && bountyAmount <= balance;
  const submitDisabled = busy || reading || loading || !!error || !forumId || !bountyAffordable;

  async function submit() {
    if (reading || loading || error || balance === null) return;
    const userId = loadedUser.current;
    const version = readVersion.current;
    if (!userId) return;
    if (!forumId) { Alert.alert('ギルドを選んでください'); return; }
    if (!forums.some((forum) => forum.id === forumId)) { Alert.alert('投稿先を確認してください'); return; }
    if (title.trim() === '') { Alert.alert('タイトルを入力してください'); return; }
    if (body.trim() === '') { Alert.alert('本文を入力してください'); return; }

    const amount = bountyAmount;
    if (kind === 'question' && bounty.trim() !== '' && !bountyValid) {
      Alert.alert('賭けポイントは0〜2,147,483,647の整数で入力してください'); return;
    }
    if (amount > balance) {
      Alert.alert('ポイントが不足しています', `保有 ${balance.toLocaleString()}P に対して ${amount.toLocaleString()}P を賭けようとしています。`);
      return;
    }

    await run(async () => {
    if (!await isCurrentAction(userId, version)) {
      Alert.alert('投稿していません', 'ログイン状態が変わりました。再読み込みしてからお試しください。');
      return;
    }
    const { data, error: rpcError } = await supabase.rpc('create_topic', {
      p_forum_id: forumId, p_kind: kind, p_title: title.trim(), p_body: body.trim(), p_bounty_amount: amount,
    });

    if (!await isCurrentAction(userId, version)) {
      Alert.alert('投稿結果を確認してください', '投稿中に画面またはアカウントが変わりました。重複投稿を避けるため、一覧をご確認ください。');
      return;
    }

    if (rpcError) { Alert.alert('投稿できませんでした', rpcError.message); return; }
    const topicId = topicIdFromResult(data);
    if (topicId) router.replace(`/topic/${topicId}`);
    else Alert.alert('投稿結果を確認してください', '投稿先を取得できませんでした。重複投稿を避けるため、一覧を確認してください。');
    }, '投稿結果を確認できませんでした');
  }

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <Stack.Screen options={{ title: '新規トピック', headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          {(loading || reading) && <LoadingView />}
          {error && <ErrorBanner message={error} onRetry={() => { void reload(); }} />}

          <Text style={s.label}>ギルド</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {forums.map((f) => (
              <Pressable key={f.id} disabled={busy || loading || reading} accessibilityRole="radio" accessibilityState={{ selected: forumId === f.id, disabled: busy || loading || reading }} onPress={() => setForumId(f.id)}
                style={[s.chip, forumId === f.id && s.chipOn]}>
                <Text style={[s.chipText, forumId === f.id && s.chipTextOn]}>{f.name}</Text>
              </Pressable>
            ))}
            {!loading && !reading && !error && forums.length === 0 && <Text style={s.empty}>ギルドがありません</Text>}
          </ScrollView>

          <Text style={s.label}>種別</Text>
          <View style={s.kindRow}>
            {KINDS.map((k) => (
              <Pressable key={k.key} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: kind === k.key, disabled: busy }} onPress={() => setKind(k.key)}
                style={[s.chip, kind === k.key && s.chipOn]}>
                <Text style={[s.chipText, kind === k.key && s.chipTextOn]}>{k.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.label}>タイトル</Text>
          <TextInput style={s.input} placeholder="例：序盤のおすすめ編成は？" value={title}
            editable={!busy} accessibilityLabel="投稿タイトル" onChangeText={setTitle} maxLength={120} />

          <Text style={s.label}>本文</Text>
          <TextInput style={[s.input, s.area]} placeholder="内容を書いてください" value={body}
            editable={!busy} accessibilityLabel="投稿本文" onChangeText={setBody} multiline textAlignVertical="top" />

          {kind === 'question' && (
            <>
              <Text style={s.label}>ポイントを賭ける（任意）</Text>
              <TextInput style={[s.input, bounty.trim() !== '' && !bountyAffordable && s.inputError]}
                placeholder="例：500（ベストアンサーに進呈）" value={bounty}
                editable={!busy} accessibilityLabel="報酬ポイント" onChangeText={setBounty} keyboardType="number-pad" />
              <Text style={s.balanceLine}>保有 {balance === null ? '—' : `${balance.toLocaleString()}P`}{balance !== null && bountyAmount > 0 && bountyAffordable ? ` → 賭け後 ${(balance - bountyAmount).toLocaleString()}P` : ''}</Text>
              {bounty.trim() !== '' && !bountyAffordable && (
                <Text accessibilityRole="alert" style={s.errText}>{!bountyValid ? '0〜2,147,483,647の整数で入力してください' : 'ポイントが不足しています'}</Text>
              )}
              <Text style={s.hint}>賭けたポイントは投稿時に預かり、ベストアンサー選定で回答者へ進呈されます。</Text>
            </>
          )}

          <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitDisabled, busy }} style={[s.btn, submitDisabled && { opacity: 0.6 }]} onPress={submit} disabled={submitDisabled}>
            <Text style={s.btnText}>{busy ? '投稿中...' : '投稿する'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  label: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 18, marginBottom: 8 },
  kindRow: { flexDirection: 'row', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.line2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.paper },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.sub },
  chipTextOn: { color: colors.accent },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, padding: 14, fontSize: 15, color: colors.ink },
  inputError: { borderColor: colors.danger },
  area: { minHeight: 120 },
  balanceLine: { fontSize: 12, color: colors.sub, fontWeight: '700', marginTop: 6 },
  errText: { fontSize: 12, color: colors.danger, fontWeight: '700', marginTop: 6 },
  hint: { fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 16 },
  btn: { backgroundColor: colors.accent, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { color: colors.muted, fontSize: 13 },
});
