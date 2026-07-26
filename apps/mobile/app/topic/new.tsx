import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';

type Forum = { id: string; name: string; type: 'public' | 'game' };
type Kind = 'request' | 'question' | 'chat';

const KINDS: { key: Kind; label: string }[] = [
  { key: 'request', label: '依頼' },
  { key: 'question', label: '質問' },
  { key: 'chat', label: '雑談' },
];

/**
 * 新規トピック作成。フォーラム・種別・タイトル・本文を入力して create_topic RPC を呼ぶ。
 * 質問の場合のみポイントを賭けられる（作成時にエスクロー）。
 */
export default function NewTopic() {
  const params = useLocalSearchParams<{ forum?: string; forumName?: string }>();
  const [forums, setForums] = useState<Forum[]>([]);
  const [forumId, setForumId] = useState<string | null>(params.forum ?? null);
  const [kind, setKind] = useState<Kind>('question');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [bounty, setBounty] = useState('');
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const [{ data }, walletRes] = await Promise.all([
      supabase.from('forums').select('id,name,type').limit(30),
      u.user ? supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single() : Promise.resolve({ data: null }),
    ]);
    const list = (data as Forum[]) ?? [];
    setForums(list);
    setBalance((walletRes.data as { balance?: number } | null)?.balance ?? 0);
    if (!forumId && list.length > 0) setForumId(list[0].id);
  }, [forumId]);

  const { error } = useLoader(load);

  // 賭け額のプレビュー（数値のみ、負数は無効）
  const bountyAmount = kind === 'question' && bounty.trim() !== '' ? Math.floor(Number(bounty)) : 0;
  const bountyValid = Number.isFinite(bountyAmount) && bountyAmount >= 0;
  const bountyAffordable = bountyValid && bountyAmount <= balance;

  async function submit() {
    if (!forumId) { Alert.alert('ギルドを選んでください'); return; }
    if (title.trim() === '') { Alert.alert('タイトルを入力してください'); return; }
    if (body.trim() === '') { Alert.alert('本文を入力してください'); return; }

    const amount = bountyAmount;
    if (kind === 'question' && bounty.trim() !== '' && !bountyValid) {
      Alert.alert('賭けポイントは0以上の数値で入力してください'); return;
    }
    if (amount > balance) {
      Alert.alert('ポイントが不足しています', `保有 ${balance.toLocaleString()}P に対して ${amount.toLocaleString()}P を賭けようとしています。`);
      return;
    }

    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc('create_topic', {
      p_forum_id: forumId, p_kind: kind, p_title: title.trim(), p_body: body, p_bounty_amount: amount,
    });
    setBusy(false);

    if (rpcError) { Alert.alert('投稿できませんでした', rpcError.message); return; }
    const topicId = (data as { topic_id?: string })?.topic_id;
    if (topicId) router.replace(`/topic/${topicId}`);
    else router.back();
  }

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <Stack.Screen options={{ title: '新規トピック', headerShown: true }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">

          <Text style={s.label}>ギルド</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {forums.map((f) => (
              <Pressable key={f.id} onPress={() => setForumId(f.id)}
                style={[s.chip, forumId === f.id && s.chipOn]}>
                <Text style={[s.chipText, forumId === f.id && s.chipTextOn]}>{f.name}</Text>
              </Pressable>
            ))}
            {forums.length === 0 && <Text style={s.empty}>ギルドがありません</Text>}
          </ScrollView>

          <Text style={s.label}>種別</Text>
          <View style={s.kindRow}>
            {KINDS.map((k) => (
              <Pressable key={k.key} onPress={() => setKind(k.key)}
                style={[s.chip, kind === k.key && s.chipOn]}>
                <Text style={[s.chipText, kind === k.key && s.chipTextOn]}>{k.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.label}>タイトル</Text>
          <TextInput style={s.input} placeholder="例：序盤のおすすめ編成は？" value={title}
            onChangeText={setTitle} maxLength={120} />

          <Text style={s.label}>本文</Text>
          <TextInput style={[s.input, s.area]} placeholder="内容を書いてください" value={body}
            onChangeText={setBody} multiline textAlignVertical="top" />

          {kind === 'question' && (
            <>
              <Text style={s.label}>ポイントを賭ける（任意）</Text>
              <TextInput style={[s.input, bounty.trim() !== '' && !bountyAffordable && s.inputError]}
                placeholder="例：500（ベストアンサーに進呈）" value={bounty}
                onChangeText={setBounty} keyboardType="number-pad" />
              <Text style={s.balanceLine}>保有 {balance.toLocaleString()}P{bountyAmount > 0 && bountyAffordable ? ` → 賭け後 ${(balance - bountyAmount).toLocaleString()}P` : ''}</Text>
              {bounty.trim() !== '' && !bountyAffordable && (
                <Text style={s.errText}>{!bountyValid ? '0以上の数値で入力してください' : 'ポイントが不足しています'}</Text>
              )}
              <Text style={s.hint}>賭けたポイントは投稿時に預かり、ベストアンサー選定で回答者へ進呈されます。</Text>
            </>
          )}

          {error && <Text style={s.errText}>{error}</Text>}
          <Pressable style={[s.btn, (busy || !bountyAffordable) && { opacity: 0.6 }]} onPress={submit} disabled={busy || !bountyAffordable}>
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
