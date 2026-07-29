import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { parseDob, DOB_ERROR_MESSAGE, ADULT_AGE } from '@/lib/age';

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
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<LegalDoc[]>([]);

  // 同意した「版」を記録する必要があるため、登録前に現行版を取得しておく（未ログインでも読める）
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('current_legal_documents')
        .select('slug,version,requires_consent');
      setDocs((data as unknown as LegalDoc[]) ?? []);
    })().catch(() => {});
  }, []);

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

    setBusy(true);
    // profiles / point_wallets は handle_new_user トリガで自動作成
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: username || 'Player' } },
    });
    if (error) { setBusy(false); Alert.alert('登録に失敗しました', error.message); return; }

    // 年齢と同意の記録。ここが失敗しても登録自体は成立しているので、
    // 起動時の未同意チェック（pending_legal_consents）で回収される。
    try {
      await supabase.rpc('set_date_of_birth', { p_dob: dob.iso });
      for (const d of docs.filter((x) => x.requires_consent)) {
        await supabase.rpc('accept_legal', { p_slug: d.slug, p_version: d.version });
      }
    } catch {
      // 記録の失敗で登録完了を止めない
    }
    setBusy(false);

    if (dob.isMinor) {
      Alert.alert(
        '保護者の方へ',
        `${ADULT_AGE}歳未満の方がご利用の場合は、保護者の同意のうえでご利用ください。ポイントの交換にあたっては保護者の方とご確認をお願いします。`,
      );
    }
    router.replace('/'); // 確認不要設定なら即ログイン → ホーム
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>アカウント作成</Text>
        <Text style={s.sub}>30秒で完了。今日からポイントが貯まります</Text>

        <TextInput style={s.input} placeholder="ユーザー名（任意）" value={username} onChangeText={setUsername} />
        <TextInput style={s.input} placeholder="メールアドレス" autoCapitalize="none"
          keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="パスワード（8文字以上）" secureTextEntry
          value={password} onChangeText={setPassword} />
        <TextInput style={s.input} placeholder="パスワード（確認）" secureTextEntry
          value={password2} onChangeText={setPassword2} />

        <Text style={s.label}>生年月日</Text>
        <Text style={s.labelHint}>年齢確認のために使用します。あとから変更できません。</Text>
        <View style={s.dobRow}>
          <TextInput style={[s.input, s.dobY]} placeholder="2000" keyboardType="number-pad" maxLength={4}
            value={year} onChangeText={setYear} accessibilityLabel="生年" />
          <Text style={s.dobSep}>年</Text>
          <TextInput style={[s.input, s.dobMd]} placeholder="1" keyboardType="number-pad" maxLength={2}
            value={month} onChangeText={setMonth} accessibilityLabel="生月" />
          <Text style={s.dobSep}>月</Text>
          <TextInput style={[s.input, s.dobMd]} placeholder="1" keyboardType="number-pad" maxLength={2}
            value={day} onChangeText={setDay} accessibilityLabel="生日" />
          <Text style={s.dobSep}>日</Text>
        </View>

        <Pressable
          style={s.agreeRow}
          onPress={() => setAgreed((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel="利用規約とプライバシーポリシーに同意する"
        >
          <View style={[s.box, agreed && s.boxOn]}>{agreed && <Text style={s.check}>✓</Text>}</View>
          <Text style={s.agreeText}>
            <Link href="/legal/terms" style={s.legalLink}>利用規約</Link>
            {' と '}
            <Link href="/legal/privacy" style={s.legalLink}>プライバシーポリシー</Link>
            {' に同意します'}
          </Text>
        </Pressable>

        <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={signUp} disabled={busy}>
          <Text style={s.btnText}>{busy ? '...' : 'アカウントを作成'}</Text>
        </Pressable>

        <Link href="/login" style={s.link}>すでにアカウントをお持ちの方はログイン</Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f5f8' },
  scroll: { padding: 24, paddingVertical: 40, flexGrow: 1, justifyContent: 'center' },
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
  btn: { backgroundColor: '#4f46e5', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 18 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  link: { textAlign: 'center', color: '#4f46e5', fontWeight: '700', marginTop: 18 },
});
