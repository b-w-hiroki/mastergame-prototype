import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

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
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('forums').select('id,name,type').limit(30);
    const list = (data as Forum[]) ?? [];
    setForums(list);
    if (!forumId && list.length > 0) setForumId(list[0].id);
  }, [forumId]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!forumId) { Alert.alert('ギルドを選んでください'); return; }
    if (title.trim() === '') { Alert.alert('タイトルを入力してください'); return; }
    if (body.trim() === '') { Alert.alert('本文を入力してください'); return; }

    const amount = kind === 'question' && bounty.trim() !== '' ? Math.floor(Number(bounty)) : 0;
    if (kind === 'question' && bounty.trim() !== '' && (!Number.isFinite(amount) || amount < 0)) {
      Alert.alert('賭けポイントは0以上の数値で入力してください'); return;
    }

    setBusy(true);
    const { data, error } = await supabase.rpc('create_topic', {
      p_forum_id: forumId, p_kind: kind, p_title: title.trim(), p_body: body, p_bounty_amount: amount,
    });
    setBusy(false);

    if (error) { Alert.alert('投稿できませんでした', error.message); return; }
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
              <TextInput style={s.input} placeholder="例：500（ベストアンサーに進呈）" value={bounty}
                onChangeText={setBounty} keyboardType="number-pad" />
              <Text style={s.hint}>賭けたポイントは投稿時に預かり、ベストアンサー選定で回答者へ進呈されます。</Text>
            </>
          )}

          <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
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
  area: { minHeight: 120 },
  hint: { fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 16 },
  btn: { backgroundColor: colors.accent, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { color: colors.muted, fontSize: 13 },
});
