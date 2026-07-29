import { useCallback, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

type Inquiry = {
  id: string; category: string; subject: string; status: string;
  created_at: string; last_message_at: string;
};

const CATEGORIES = [
  { key: 'points', label: 'ポイントが反映されない' },
  { key: 'exchange', label: 'ポイント交換について' },
  { key: 'account', label: 'アカウント・ログイン' },
  { key: 'bug', label: '不具合の報告' },
  { key: 'other', label: 'その他' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  open: '対応中', answered: '回答あり', resolved: '解決済み', closed: 'クローズ',
};

const REASON_MESSAGE: Record<string, string> = {
  daily_cap: '本日の問い合わせ上限に達しました。既存の問い合わせへの返信はご利用いただけます。',
};

/** 問い合わせ一覧＋新規作成。ポイ活のCSは「ポイントが反映されない」が大半なので、そこを先頭に置く。 */
export default function Support() {
  const [list, setList] = useState<Inquiry[]>([]);
  const [category, setCategory] = useState<string>('points');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('inquiries')
      .select('id,category,subject,status,created_at,last_message_at')
      .order('last_message_at', { ascending: false });
    if (qErr) throw qErr;
    setList((data as unknown as Inquiry[]) ?? []);
  }, []);

  const { loading, error, reload } = useLoader(load, { auto: false });
  useFocusEffect(useCallback(() => { reload().catch(() => {}); }, [reload]));

  async function submit() {
    if (subject.trim() === '' || body.trim() === '') {
      Alert.alert('件名と内容を入力してください');
      return;
    }
    setBusy(true);
    const { data, error: rErr } = await supabase.rpc('create_inquiry', {
      p_category: category, p_subject: subject.trim(), p_body: body.trim(),
    });
    setBusy(false);
    if (rErr) { Alert.alert('送信できませんでした', rErr.message); return; }

    const res = data as unknown as { status: string; reason?: string };
    if (res.status !== 'ok') {
      Alert.alert('送信できませんでした', REASON_MESSAGE[res.reason ?? ''] ?? 'しばらくしてからお試しください。');
      return;
    }
    setSubject(''); setBody(''); setComposing(false);
    Alert.alert('送信しました', '回答があり次第、通知でお知らせします。');
    reload().catch(() => {});
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: true, title: 'お問い合わせ' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        {!composing ? (
          <Pressable style={s.newBtn} onPress={() => setComposing(true)} accessibilityRole="button">
            <Text style={s.newBtnText}>＋ 新しく問い合わせる</Text>
          </Pressable>
        ) : (
          <View style={s.form}>
            <Text style={s.label}>種別</Text>
            <View style={s.cats}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.key}
                  style={[s.cat, category === c.key && s.catOn]}
                  onPress={() => setCategory(c.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: category === c.key }}
                >
                  <Text style={[s.catText, category === c.key && s.catTextOn]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.label}>件名</Text>
            <TextInput style={s.input} placeholder="例: オファーのポイントが入りません"
              maxLength={120} value={subject} onChangeText={setSubject} accessibilityLabel="件名" />

            <Text style={s.label}>内容</Text>
            <TextInput style={[s.input, s.textarea]} multiline
              placeholder="いつ・どのミッション/オファーで・どうなったかを書いていただけると調査が早くなります"
              value={body} onChangeText={setBody} accessibilityLabel="内容" />

            <View style={s.formFoot}>
              <Pressable style={[s.submit, busy && { opacity: 0.5 }]} onPress={submit} disabled={busy}
                accessibilityRole="button">
                <Text style={s.submitText}>{busy ? '...' : '送信する'}</Text>
              </Pressable>
              <Pressable onPress={() => setComposing(false)} accessibilityRole="button">
                <Text style={s.cancel}>キャンセル</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Text style={s.section}>これまでの問い合わせ</Text>
        {list.map((q) => (
          <Pressable key={q.id} style={s.row} onPress={() => router.push(`/support/${q.id}`)}>
            <View style={{ flex: 1 }}>
              <Text style={s.subject} numberOfLines={1}>{q.subject}</Text>
              <Text style={s.meta}>{STATUS_LABEL[q.status] ?? q.status}</Text>
            </View>
            {q.status === 'answered' && <View style={s.dot} />}
            <Text style={s.chevron}>›</Text>
          </Pressable>
        ))}
        {!loading && list.length === 0 && (
          <Text style={s.empty}>まだ問い合わせはありません</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  newBtn: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  newBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  form: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16 },
  label: { fontSize: 12, fontWeight: '800', color: colors.ink, marginBottom: 8, marginTop: 12 },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { borderWidth: 1, borderColor: colors.line2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  catOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  catText: { fontSize: 11.5, fontWeight: '700', color: colors.sub },
  catTextOn: { color: '#fff' },
  input: { backgroundColor: '#fafbfd', borderWidth: 1, borderColor: colors.line2, borderRadius: 10, padding: 12, fontSize: 14 },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  formFoot: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  submit: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  cancel: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  section: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 26, marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  subject: { fontSize: 13, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.muted, fontWeight: '700', marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  chevron: { fontSize: 20, color: colors.muted },
  empty: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
});
