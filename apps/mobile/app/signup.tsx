import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { AppAlert as Alert } from '@/components/AppAlert';
import { useAction } from '@/lib/useAction';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { parseDob, DOB_ERROR_MESSAGE, ADULT_AGE } from '@/lib/age';
import { withReadTimeout } from '@/lib/readTimeout';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LegalDoc = { slug: string; version: string; requires_consent: boolean };

export default function SignUp() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [agreed, setAgreed] = useState(false);
  const { busy, run } = useAction();
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [docsReady, setDocsReady] = useState(false);
  const [docsError, setDocsError] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const docsVersion = useRef(0);

  // 同意した「版」を記録する必要があるため、登録前に現行版を取得しておく（未ログインでも読める）
  async function loadDocs() {
    const version = ++docsVersion.current;
    setDocsReady(false);
    setDocsError(false);
    setDocs([]);
    setAgreed(false);
    try {
      const { data, error } = await withReadTimeout(supabase
        .from('current_legal_documents')
        .select('slug,version,requires_consent'));
      if (version !== docsVersion.current) return;
      if (error) throw error;
      if (!Array.isArray(data) || !data.every((doc) => doc && typeof doc.slug === 'string'
        && typeof doc.version === 'string' && doc.version.trim() !== ''
        && typeof doc.requires_consent === 'boolean')) throw new Error('invalid legal documents');
      const list = data as LegalDoc[];
      if (!list.some((d) => d.slug === 'terms' && d.requires_consent) || !list.some((d) => d.slug === 'privacy' && d.requires_consent)) throw new Error('missing legal documents');
      setDocs(list);
      setDocsReady(true);
    } catch { if (version === docsVersion.current) setDocsError(true); }
  }
  useEffect(() => {
    void loadDocs();
    return () => { docsVersion.current += 1; };
  }, []);

  async function signUp() {
    if (!docsReady) { Alert.alert('規約の確認が必要です', '規約を読み込み直してから登録してください。'); return; }
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
    // 年齢確認。サーバ側（set_date_of_birth）でも同じ判定をするが、
    // 登録してから弾かれるのを避けるため先に確認する。
    const dob = parseDob(year, month, day);
    if (!dob.ok) {
      Alert.alert(DOB_ERROR_MESSAGE[dob.reason]);
      return;
    }
    if (!agreed) {
      Alert.alert('利用規約とプライバシーポリシーへの同意が必要です');
      return;
    }

    await run(async () => {
    // profiles / point_wallets は handle_new_user トリガで自動作成
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username.trim() || 'Player' } },
    });
    if (error) { Alert.alert('登録に失敗しました', error.message); return; }
    if (!data?.session) {
      setConfirmationEmail(email.trim());
      setPassword(''); setPassword2('');
      return;
    }

    // 年齢と同意の記録。ここが失敗しても登録自体は成立しているので、
    // 部分失敗を成功扱いにせず案内する。認証前の RPC は実行しない。
    try {
      const { data: dobResult, error: dobError } = await supabase.rpc('set_date_of_birth', { p_dob: dob.iso });
      if (dobError || (dobResult as { status?: string } | null)?.status !== 'ok') throw dobError ?? new Error('age verification failed');
      for (const d of docs.filter((x) => x.requires_consent)) {
        const { data: consentResult, error: consentError } = await supabase.rpc('accept_legal', { p_slug: d.slug, p_version: d.version });
        if (consentError) throw consentError;
        if ((consentResult as { ok?: boolean } | null)?.ok !== true) throw new Error('consent not saved');
      }
    } catch {
      Alert.alert('登録情報の確認が必要です', 'アカウントは作成されましたが、年齢確認または規約同意の保存が完了していません。ログイン後の登録情報確認で手続きを完了してください。');
    }

    if (dob.isMinor) {
      Alert.alert(
        '保護者の方へ',
        `${ADULT_AGE}歳未満の方がご利用の場合は、保護者の同意のうえでご利用ください。ポイントの交換にあたっては保護者の方とご確認をお願いします。`,
      );
    }
    router.replace('/'); // 確認不要設定なら即ログイン → ホーム
    }, '登録結果を確認できませんでした');
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>アカウント作成</Text>
        <Text style={s.sub}>アカウントを作成してミッションをはじめよう</Text>

        {confirmationEmail ? <>
          <Text accessibilityLiveRegion="polite" style={s.labelHint}>{confirmationEmail} の受信箱と迷惑メールフォルダをご確認ください。メール確認が必要な場合は、確認リンクを開いてからログインしてください。すでに登録済みの場合もログインへお進みください。</Text>
          <Link href="/login" style={s.link}>ログインへ進む</Link>
        </> : <>

        <TextInput style={s.input} placeholder="ユーザー名（任意）" editable={!busy} value={username} onChangeText={setUsername} />
        <TextInput style={s.input} placeholder="メールアドレス" autoCapitalize="none"
          keyboardType="email-address" editable={!busy} autoCorrect={false} autoComplete="email" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="パスワード（8文字以上）" secureTextEntry
          editable={!busy} autoComplete="new-password" value={password} onChangeText={setPassword} />
        <TextInput style={s.input} placeholder="パスワード（確認）" secureTextEntry
          editable={!busy} autoComplete="new-password" value={password2} onChangeText={setPassword2} />

        <Text style={s.label}>生年月日</Text>
        <Text style={s.labelHint}>年齢確認のために使用します。あとから変更できません。</Text>
        <View style={s.dobRow}>
          <TextInput style={[s.input, s.dobY]} placeholder="2000" keyboardType="number-pad" maxLength={4}
            editable={!busy} value={year} onChangeText={setYear} accessibilityLabel="生年" />
          <Text style={s.dobSep}>年</Text>
          <TextInput style={[s.input, s.dobMd]} placeholder="1" keyboardType="number-pad" maxLength={2}
            editable={!busy} value={month} onChangeText={setMonth} accessibilityLabel="生月" />
          <Text style={s.dobSep}>月</Text>
          <TextInput style={[s.input, s.dobMd]} placeholder="1" keyboardType="number-pad" maxLength={2}
            editable={!busy} value={day} onChangeText={setDay} accessibilityLabel="生日" />
          <Text style={s.dobSep}>日</Text>
        </View>

        <View style={s.legalLinks}>
          <Link href="/legal/terms" style={s.legalLink}>利用規約を確認</Link>
          <Link href="/legal/privacy" style={s.legalLink}>プライバシーポリシーを確認</Link>
        </View>
        <Pressable
          style={s.agreeRow}
          onPress={() => setAgreed((v) => !v)}
          accessibilityRole="checkbox"
          disabled={busy || !docsReady}
          accessibilityState={{ checked: agreed, disabled: busy || !docsReady }}
          accessibilityLabel="利用規約とプライバシーポリシーに同意する"
        >
          <View style={[s.box, agreed && s.boxOn]}>{agreed && <Text style={s.check}>✓</Text>}</View>
          <Text style={s.agreeText}>利用規約とプライバシーポリシーに同意します</Text>
        </Pressable>

        {!docsReady && !docsError && <Text accessibilityLiveRegion="polite">利用規約を読み込んでいます...</Text>}
        {docsError && <>
          <Text accessibilityRole="alert">利用規約を取得できませんでした。</Text>
          <Pressable accessibilityRole="button" onPress={() => { void loadDocs(); }}><Text style={s.link}>規約を再読み込み</Text></Pressable>
        </>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || !docsReady, busy }} style={[s.btn, (busy || !docsReady) && { opacity: 0.6 }]} onPress={signUp} disabled={busy || !docsReady}>
          <Text style={s.btnText}>{busy ? '...' : 'アカウントを作成'}</Text>
        </Pressable>

        <Link href="/login" style={s.link}>すでにアカウントをお持ちの方はログイン</Link>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f5f8' },
  scroll: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24, paddingVertical: 40, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#1f2430' },
  sub: { fontSize: 13, color: '#6b7280', marginBottom: 22 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8dbe2', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15 },
  label: { fontSize: 12, fontWeight: '800', color: '#1f2430', marginTop: 6 },
  labelHint: { fontSize: 11, color: '#9aa0ac', marginTop: 3, marginBottom: 8 },
  dobRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dobY: { flex: 1.4, marginBottom: 0 },
  dobMd: { flex: 1, marginBottom: 0 },
  dobSep: { fontSize: 13, color: '#6b7280', fontWeight: '700' },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#d8dbe2', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  check: { color: '#fff', fontSize: 13, fontWeight: '900' },
  agreeText: { flex: 1, fontSize: 12.5, color: '#6b7280', lineHeight: 19 },
  legalLink: { color: '#4f46e5', fontWeight: '700' },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 18 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  link: { textAlign: 'center', color: '#4f46e5', fontWeight: '700', marginTop: 18 },
});
