import { useRef, useState } from 'react';
import { Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/** パスワード再設定（リセットメール送信）。prototype のパスワード再設定に対応。 */
export default function Forgot() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const sending = useRef(false);

  async function reset() {
    if (sending.current) return;
    setErrorMessage('');
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setErrorMessage('正しいメールアドレスを入力してください');
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: Linking.createURL('reset-password'),
      });
      if (error) throw error;
      setEmail(address);
      setSent(true);
    } catch {
      setErrorMessage('送信できませんでした。接続を確認し、時間をおいて再試行してください。');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>パスワード再設定</Text>
      <Text style={s.sub}>登録メールアドレスに再設定リンクを送ります</Text>

      {sent ? (
        <Text accessibilityLiveRegion="polite" style={s.done}>{email} が登録済みの場合、再設定メールが届きます。メール内のリンクから再設定してください。届かない場合は迷惑メールフォルダもご確認ください。</Text>
      ) : (
        <>
          <TextInput style={s.input} placeholder="メールアドレス" autoCapitalize="none"
            accessibilityLabel="メールアドレス" autoComplete="email" autoCorrect={false} editable={!busy}
            keyboardType="email-address" value={email} onChangeText={setEmail} />
          {errorMessage !== '' && <Text accessibilityRole="alert" style={s.error}>{errorMessage}</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} style={[s.btn, busy && { opacity: 0.6 }]} onPress={reset} disabled={busy}>
            <Text style={s.btnText}>{busy ? '送信中...' : '再設定メールを送信'}</Text>
          </Pressable>
        </>
      )}

      <Link href="/login" style={s.link}>ログインに戻る</Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 13, color: colors.sub, marginBottom: 22 },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15 },
  btn: { backgroundColor: colors.accent, borderRadius: 12, padding: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  done: { color: colors.ok, fontWeight: '700', lineHeight: 22, backgroundColor: colors.okSoft, padding: 14, borderRadius: 12 },
  link: { textAlign: 'center', color: colors.accent, fontWeight: '700', marginTop: 18 },
  error: { color: '#b91c1c', marginBottom: 12, lineHeight: 22 },
});
