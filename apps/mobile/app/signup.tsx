import { useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Link } from 'expo-router';
import { supabase } from '@/lib/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUp() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);

  async function signUp() {
    if (!EMAIL_RE.test(email.trim())) {
      Alert.alert('メールアドレスの形式が正しくありません');
      return;
    }
    if (password.length < 8) {
      Alert.alert('パスワードは8文字以上にしてください');
      return;
    }
    if (password !== password2) {
      Alert.alert('パスワードが一致しません');
      return;
    }
    setBusy(true);
    // profiles / point_wallets は handle_new_user トリガで自動作成（0001_core.sql）
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username || 'Player' } },
    });
    setBusy(false);
    if (error) { Alert.alert('登録に失敗しました', error.message); return; }
    router.replace('/'); // 確認不要設定なら即ログイン → ホーム
  }

  return (
    <SafeAreaView style={s.root}>
      <Text style={s.title}>アカウント作成</Text>
      <Text style={s.sub}>30秒で完了。今日からポイントが貯まります</Text>

      <TextInput style={s.input} placeholder="ユーザー名（任意）" value={username} onChangeText={setUsername} />
      <TextInput style={s.input} placeholder="メールアドレス" autoCapitalize="none"
        keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="パスワード（8文字以上）" secureTextEntry
        value={password} onChangeText={setPassword} />
      <TextInput style={s.input} placeholder="パスワード（確認）" secureTextEntry
        value={password2} onChangeText={setPassword2} />

      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={signUp} disabled={busy}>
        <Text style={s.btnText}>{busy ? '...' : 'アカウントを作成'}</Text>
      </Pressable>

      <Link href="/login" style={s.link}>すでにアカウントをお持ちの方はログイン</Link>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f5f8', padding: 24, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#1f2430' },
  sub: { fontSize: 13, color: '#6b7280', marginBottom: 22 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8dbe2', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  link: { textAlign: 'center', color: '#4f46e5', fontWeight: '700', marginTop: 18 },
});
