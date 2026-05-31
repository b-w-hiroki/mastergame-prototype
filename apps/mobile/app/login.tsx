import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) Alert.alert('ログインに失敗しました', error.message);
  }

  async function signInOAuth(provider: 'google' | 'apple') {
    // ネイティブはディープリンク(mastergame://)へリダイレクト。詳細はExpo AuthSession参照。
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: 'mastergame://' } });
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.logo}><Text style={s.logoText}>MG</Text></View>
      <Text style={s.title}>おかえりなさい</Text>
      <Text style={s.sub}>ログインしてミッションを続けよう</Text>

      <TextInput style={s.input} placeholder="メールアドレス" autoCapitalize="none"
        keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="パスワード" secureTextEntry
        value={password} onChangeText={setPassword} />

      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={signIn} disabled={busy}>
        <Text style={s.btnText}>{busy ? '...' : 'ログイン'}</Text>
      </Pressable>

      <Text style={s.or}>または</Text>
      <Pressable style={s.oauth} onPress={() => signInOAuth('google')}><Text style={s.oauthText}>Googleでログイン</Text></Pressable>
      <Pressable style={s.oauth} onPress={() => signInOAuth('apple')}><Text style={s.oauthText}>Appleでログイン</Text></Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f5f8', padding: 24, justifyContent: 'center' },
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
});
