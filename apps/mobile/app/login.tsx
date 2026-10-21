import { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { signInWithOAuth } from '@/lib/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const submitting = useRef(false);

  async function signIn() {
    if (submitting.current) return;
    setErrorMessage('');
    if (email.trim() === '' || password === '') {
      setErrorMessage('メールアドレスとパスワードを入力してください');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage('メールアドレスの形式を確認してください');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setErrorMessage(error.message === 'Invalid login credentials'
          ? 'メールアドレスまたはパスワードが正しくありません。未登録の場合は新規アカウント作成へ進んでください。'
          : error.message === 'Email not confirmed'
            ? 'メールアドレスの確認が必要です。登録時の確認メールと迷惑メールフォルダをご確認ください。'
            : `ログインに失敗しました。${error.message}`);
      }
    } catch {
      setErrorMessage('通信に失敗しました。接続を確認して、もう一度ログインしてください。');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function signInOAuth(provider: 'google' | 'apple') {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setErrorMessage('');
    try {
      await signInWithOAuth(provider);
    } catch {
      setErrorMessage('外部サービスでのログインに失敗しました。接続を確認して再試行するか、メールアドレスでログインしてください。');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.logo}><Text style={s.logoText}>MG</Text></View>
      <Text style={s.title}>おかえりなさい</Text>
      <Text style={s.sub}>ログインしてミッションを続けよう</Text>

      <TextInput style={s.input} placeholder="メールアドレス" autoCapitalize="none"
        accessibilityLabel="メールアドレス" autoComplete="email" autoCorrect={false}
        editable={!busy} keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="パスワード" secureTextEntry
        accessibilityLabel="パスワード" autoComplete="current-password" editable={!busy}
        value={password} onChangeText={setPassword} onSubmitEditing={signIn} />

      {errorMessage !== '' && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>{errorMessage}</Text>}

      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} style={[s.btn, busy && { opacity: 0.6 }]} onPress={signIn} disabled={busy}>
        <Text style={s.btnText}>{busy ? '認証中...' : 'ログイン'}</Text>
      </Pressable>

      <Text style={s.or}>または</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={[s.oauth, busy && { opacity: 0.6 }]} onPress={() => signInOAuth('google')}><Text style={s.oauthText}>Googleでログイン</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} style={[s.oauth, busy && { opacity: 0.6 }]} onPress={() => signInOAuth('apple')}><Text style={s.oauthText}>Appleでログイン</Text></Pressable>

      <Link href="/signup" style={s.link}>新規アカウント作成</Link>
      <Link href="/forgot" style={s.linkSub}>パスワードをお忘れですか？</Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f5f8' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, padding: 24, justifyContent: 'center' },
  error: { color: '#b91c1c', backgroundColor: '#fef2f2', padding: 12, borderRadius: 12, marginBottom: 12, lineHeight: 21 },
  logo: { width: 56, height: 56, borderRadius: 15, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  logoText: { color: '#fff', fontWeight: '900', fontSize: 22 },
  title: { fontSize: 22, fontWeight: '800', color: '#1f2430' },
  sub: { fontSize: 13, color: '#6b7280', marginBottom: 22 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8dbe2', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  or: { textAlign: 'center', color: '#9aa0ac', marginVertical: 18 },
  oauth: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8dbe2', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
  oauthText: { fontWeight: '700', color: '#1f2430' },
  link: { textAlign: 'center', color: '#4f46e5', fontWeight: '700', marginTop: 18 },
  linkSub: { textAlign: 'center', color: '#9aa0ac', fontWeight: '600', marginTop: 12, fontSize: 13 },
});
