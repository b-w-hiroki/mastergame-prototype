import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { parseParams } from '@/lib/parseCallback';
import { colors } from '@/lib/theme';

/** 通常のログインセッションだけでは開放せず、メールの認証情報を検証する。 */
export default function ResetPassword() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const verification = useRef<Promise<void> | null>(null);
  const verifiedUserId = useRef<string | null>(null);
  const linkParams = useLocalSearchParams<{ code?: string; error?: string; type?: string; access_token?: string; refresh_token?: string }>();

  useEffect(() => {
    let active = true;
    // StrictMode の effect 再実行でも、一度限りの code を二重交換しない。
    if (!verification.current) verification.current = (async () => {
      const url = await Linking.getInitialURL();
      const params = { ...parseParams(url ?? ''), ...linkParams };
      if (params.error) throw new Error('invalid');
      let userId: string | undefined;
      if (params.code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error) throw error;
        userId = data.user?.id;
      } else if (params.type === 'recovery' && params.access_token && params.refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token: params.access_token, refresh_token: params.refresh_token,
        });
        if (error) throw error;
        userId = data.user?.id;
      } else {
        throw new Error('missing recovery link');
      }
      if (!userId) throw new Error('missing recovery user');
      verifiedUserId.current = userId;
    })();
    verification.current.then(
      () => { if (active) setStatus(verifiedUserId.current ? 'ready' : 'invalid'); },
      () => { if (active) setStatus('invalid'); },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (verifiedUserId.current && session?.user.id !== verifiedUserId.current) {
        verifiedUserId.current = null;
        setPassword(''); setConfirmation('');
        setErrorMessage('ログイン中のアカウントが変更されました。再設定メールからやり直してください。');
        setStatus('invalid');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function save() {
    if (submitting.current || status !== 'ready') return;
    setErrorMessage('');
    if (password.length < 8) { setErrorMessage('パスワードは8文字以上にしてください'); return; }
    if (password !== confirmation) { setErrorMessage('パスワードが一致しません'); return; }
    submitting.current = true;
    setBusy(true);
    const targetUserId = verifiedUserId.current;
    try {
      const { data, error: userError } = await supabase.auth.getUser();
      if (verifiedUserId.current !== targetUserId) return;
      if (userError || !targetUserId || data.user?.id !== targetUserId) {
        verifiedUserId.current = null;
        setPassword(''); setConfirmation('');
        setErrorMessage('再設定対象のアカウントを確認できませんでした。再設定メールからやり直してください。');
        setStatus('invalid');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      if (verifiedUserId.current !== targetUserId) return;
      setPassword('');
      setConfirmation('');
      setStatus('done');
    } catch {
      if (verifiedUserId.current === targetUserId) {
        setErrorMessage('変更できませんでした。接続を確認して再試行してください。リンクが期限切れの場合はメールを再送してください。');
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <SafeAreaView style={s.root}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>新しいパスワード</Text>
      {status === 'checking' && <Text accessibilityLiveRegion="polite">再設定リンクを確認しています...</Text>}
      {status === 'invalid' && <>
        <Text accessibilityRole="alert" style={s.error}>{errorMessage || '再設定リンクが無効、期限切れ、または別のブラウザで開かれています。メールを再送し、送信を依頼したブラウザで最新のリンクを開いてください。'}</Text>
        <Link href="/forgot" style={s.link}>再設定メールを再送する</Link>
      </>}
      {status === 'ready' && <>
        <Text style={s.note}>8文字以上の新しいパスワードを入力してください。</Text>
        <TextInput style={s.input} placeholder="新しいパスワード" accessibilityLabel="新しいパスワード" secureTextEntry autoComplete="new-password" autoCapitalize="none" editable={!busy} value={password} onChangeText={setPassword} />
        <TextInput style={s.input} placeholder="新しいパスワード（確認）" accessibilityLabel="新しいパスワード（確認）" secureTextEntry autoComplete="new-password" autoCapitalize="none" editable={!busy} value={confirmation} onChangeText={setConfirmation} onSubmitEditing={save} />
        {errorMessage !== '' && <Text accessibilityRole="alert" style={s.error}>{errorMessage}</Text>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={save} style={[s.button, busy && { opacity: 0.6 }]}><Text style={s.buttonText}>{busy ? '変更中...' : 'パスワードを変更'}</Text></Pressable>
      </>}
      {status === 'done' && <>
        <Text accessibilityLiveRegion="polite" style={s.note}>パスワードを変更しました。次回から新しいパスワードをお使いください。</Text>
        <Link href="/" style={s.link}>ホームへ進む</Link>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { color: colors.ink, fontSize: 22, fontWeight: '800', marginBottom: 16 },
  note: { color: colors.sub, lineHeight: 22, marginBottom: 16 },
  input: { backgroundColor: colors.paper, borderColor: colors.line2, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  error: { color: '#b91c1c', lineHeight: 22, marginBottom: 12 },
  button: { backgroundColor: colors.accent, borderRadius: 12, padding: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800' },
  link: { color: colors.accent, fontWeight: '700', marginTop: 16 },
});
