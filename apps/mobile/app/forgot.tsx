import { useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
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

  async function reset() {
    if (!email) { Alert.alert('メールアドレスを入力してください'); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password'),
    });
    setBusy(false);
    if (error) { Alert.alert('送信に失敗しました', error.message); return; }
    setSent(true);
  }

  return (
    <SafeAreaView style={s.root}>
      <Text style={s.title}>パスワード再設定</Text>
      <Text style={s.sub}>登録メールアドレスに再設定リンクを送ります</Text>

      {sent ? (
        <Text style={s.done}>✓ {email} に再設定メールを送信しました。メール内のリンクから再設定してください。</Text>
      ) : (
        <>
          <TextInput style={s.input} placeholder="メールアドレス" autoCapitalize="none"
            keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={reset} disabled={busy}>
            <Text style={s.btnText}>{busy ? '送信中...' : '再設定メールを送信'}</Text>
          </Pressable>
        </>
      )}

      <Link href="/login" style={s.link}>ログインに戻る</Link>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 13, color: colors.sub, marginBottom: 22 },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15 },
  btn: { backgroundColor: colors.accent, borderRadius: 12, padding: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  done: { color: colors.ok, fontWeight: '700', lineHeight: 22, backgroundColor: colors.okSoft, padding: 14, borderRadius: 12 },
  link: { textAlign: 'center', color: colors.accent, fontWeight: '700', marginTop: 18 },
});
