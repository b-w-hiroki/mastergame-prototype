import { useCallback, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

type Inquiry = { id: string; subject: string; status: string };
type Message = { id: string; is_staff: boolean; body: string; created_at: string };

const STATUS_LABEL: Record<string, string> = {
  open: '対応中', answered: '回答あり', resolved: '解決済み', closed: 'クローズ',
};
const REASON_MESSAGE: Record<string, string> = {
  closed: 'この問い合わせはクローズされています。新しく問い合わせてください。',
  not_found: 'この問い合わせは見つかりませんでした。',
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 問い合わせのスレッド。運営の返信は担当者名を出さない（個人を露出させない）。 */
export default function SupportThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: i, error: iErr }, { data: m }] = await Promise.all([
      supabase.from('inquiries').select('id,subject,status').eq('id', id).single(),
      supabase.from('inquiry_messages').select('id,is_staff,body,created_at')
        .eq('inquiry_id', id).order('created_at', { ascending: true }),
    ]);
    if (iErr) throw iErr;
    setInquiry(i as unknown as Inquiry);
    setMessages((m as unknown as Message[]) ?? []);
  }, [id]);

  const { loading, error, reload } = useLoader(load);

  async function reply() {
    if (body.trim() === '') { Alert.alert('内容を入力してください'); return; }
    setBusy(true);
    const { data, error: rErr } = await supabase.rpc('reply_to_inquiry', {
      p_inquiry_id: id, p_body: body.trim(),
    });
    setBusy(false);
    if (rErr) { Alert.alert('送信できませんでした', rErr.message); return; }

    const res = data as unknown as { status: string; reason?: string };
    if (res.status !== 'ok') {
      Alert.alert('送信できませんでした', REASON_MESSAGE[res.reason ?? ''] ?? 'しばらくしてからお試しください。');
      return;
    }
    setBody('');
    reload().catch(() => {});
  }

  const closed = inquiry?.status === 'closed';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: true, title: 'お問い合わせ' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        {inquiry && (
          <>
            <Text style={s.subject}>{inquiry.subject}</Text>
            <Text style={s.status}>{STATUS_LABEL[inquiry.status] ?? inquiry.status}</Text>

            {messages.map((m) => (
              <View key={m.id} style={[s.bubble, m.is_staff ? s.staff : s.mine]}>
                <Text style={s.who}>{m.is_staff ? 'サポート' : 'あなた'}</Text>
                <Text style={s.body}>{m.body}</Text>
                <Text style={s.time}>{fmt(m.created_at)}</Text>
              </View>
            ))}

            {closed ? (
              <Text style={s.closed}>この問い合わせはクローズされています。</Text>
            ) : (
              <>
                <TextInput
                  style={s.input}
                  multiline
                  placeholder="返信を入力"
                  value={body}
                  onChangeText={setBody}
                  accessibilityLabel="返信内容"
                />
                <Pressable style={[s.send, busy && { opacity: 0.5 }]} onPress={reply} disabled={busy}
                  accessibilityRole="button">
                  <Text style={s.sendText}>{busy ? '...' : '返信する'}</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  subject: { fontSize: 16, fontWeight: '800', color: colors.ink },
  status: { fontSize: 11.5, color: colors.muted, fontWeight: '700', marginTop: 4, marginBottom: 18 },
  bubble: { borderRadius: 14, padding: 14, marginBottom: 10, maxWidth: '92%' },
  mine: { backgroundColor: colors.accentSoft, alignSelf: 'flex-end' },
  staff: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignSelf: 'flex-start' },
  who: { fontSize: 10.5, fontWeight: '800', color: colors.sub, marginBottom: 5 },
  body: { fontSize: 13.5, color: colors.ink, lineHeight: 20 },
  time: { fontSize: 10, color: colors.muted, marginTop: 6, textAlign: 'right' },
  input: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line2, borderRadius: 12,
    padding: 12, fontSize: 14, minHeight: 90, textAlignVertical: 'top', marginTop: 14,
  },
  send: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  closed: { fontSize: 12, color: colors.muted, textAlign: 'center', paddingVertical: 20 },
});
