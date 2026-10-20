import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { parseDob, DOB_ERROR_MESSAGE, ADULT_AGE } from '@/lib/age';
import { useAction } from '@/lib/useAction';
import { colors } from '@/lib/theme';
import { withReadTimeout } from '@/lib/readTimeout';

type Consent = { slug: string; version: string; title: string };

/** メール確認・OAuth・部分失敗後も、未記録の登録情報を認証後に回収する。 */
export function AccountSetupGate({ userId }: { userId: string }) {
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [needsDob, setNeedsDob] = useState(false);
  const [docs, setDocs] = useState<Consent[]>([]);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState('');
  const { busy, run } = useAction();
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setChecking(true);
    setFailed(false);
    setNeedsDob(false);
    setDocs([]);
    setAgreed(false);
    setMessage('');
    try {
      const [profile, pending] = await withReadTimeout(Promise.all([
        supabase.from('profiles').select('date_of_birth').eq('id', userId).single(),
        supabase.rpc('pending_legal_consents'),
      ]));
      if (version !== loadVersion.current) return;
      if (profile.error || pending.error) throw profile.error ?? pending.error;
      if (!profile.data || typeof profile.data !== 'object' || Array.isArray(profile.data)
        || (profile.data.date_of_birth !== null && typeof profile.data.date_of_birth !== 'string')
        || !Array.isArray(pending.data)
        || !pending.data.every((doc) => doc && typeof doc === 'object' && !Array.isArray(doc)
          && typeof doc.slug === 'string' && doc.slug.trim() !== ''
          && typeof doc.version === 'string' && doc.version.trim() !== ''
          && typeof doc.title === 'string' && doc.title.trim() !== '')) {
        throw new Error('invalid setup response');
      }
      setNeedsDob(!profile.data.date_of_birth);
      setDocs(pending.data as unknown as Consent[]);
    } catch { if (version === loadVersion.current) setFailed(true); }
    finally { if (version === loadVersion.current) setChecking(false); }
  }, [userId]);
  useEffect(() => {
    void load();
    return () => { loadVersion.current += 1; };
  }, [load]);

  async function save() {
    if (checking || failed || busy) return;
    setMessage('');
    const dob = needsDob ? parseDob(year, month, day) : null;
    if (dob && !dob.ok) { setMessage(DOB_ERROR_MESSAGE[dob.reason]); return; }
    if (docs.length > 0 && !agreed) { setMessage('表示された規約への同意が必要です'); return; }
    await run(async () => {
      if (dob?.ok) {
        const result = await supabase.rpc('set_date_of_birth', { p_dob: dob.iso });
        if (result.error) throw result.error;
        const data = result.data as { status?: string; reason?: string } | null;
        if (data?.status !== 'ok' && data?.reason !== 'already_set') {
          setMessage('年齢確認を完了できませんでした。入力内容をご確認ください。'); return;
        }
        setNeedsDob(false);
      }
      for (const doc of docs) {
        const result = await supabase.rpc('accept_legal', { p_slug: doc.slug, p_version: doc.version });
        if (result.error) throw result.error;
        if ((result.data as { ok?: boolean } | null)?.ok !== true) throw new Error('consent not saved');
      }
      setAgreed(false);
      await load();
    }, '登録情報を保存できませんでした');
  }

  const visible = checking || failed || needsDob || docs.length > 0;
  return <Modal visible={visible} animationType="fade" onRequestClose={() => {}}>
    <SafeAreaView style={s.root}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.title}>登録情報の確認</Text>
      {checking ? <Text>登録情報を確認しています...</Text> : failed ? <>
        <Text accessibilityRole="alert">登録情報を取得できませんでした。接続を確認して再試行してください。</Text>
        <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={s.button}><Text style={s.buttonText}>再読み込み</Text></Pressable>
      </> : <>
        <Text style={s.note}>メール確認後・初回ログイン時・規約更新時に、未完了の項目だけ確認します。</Text>
        {needsDob && <>
          <Text style={s.note}>生年月日（保存後は変更できません）</Text>
          <View style={s.row}>
            <TextInput accessibilityLabel="確認用の生年" placeholder="2000" keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} editable={!busy} style={s.input} />
            <TextInput accessibilityLabel="確認用の生月" placeholder="1" keyboardType="number-pad" maxLength={2} value={month} onChangeText={setMonth} editable={!busy} style={s.input} />
            <TextInput accessibilityLabel="確認用の生日" placeholder="1" keyboardType="number-pad" maxLength={2} value={day} onChangeText={setDay} editable={!busy} style={s.input} />
          </View>
          <Text style={s.note}>{ADULT_AGE}歳未満の方は、保護者の同意のうえでご利用ください。</Text>
        </>}
        {docs.map((doc) => <Link key={`${doc.slug}:${doc.version}`} href={`/legal/${doc.slug}` as never} style={s.link}>{doc.title}（{doc.version}）を確認する</Link>)}
        {docs.length > 0 && <Pressable accessibilityRole="checkbox" accessibilityLabel="表示された規約に同意する" accessibilityState={{ checked: agreed, disabled: busy }} disabled={busy} onPress={() => setAgreed(!agreed)} style={s.check}>
          <Text>{agreed ? '☑' : '☐'} 表示された規約に同意する</Text>
        </Pressable>}
        {!!message && <Text accessibilityRole="alert" style={s.error}>{message}</Text>}
        <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy, busy }} style={s.button} onPress={save}><Text style={s.buttonText}>{busy ? '保存中...' : '登録情報を保存して続ける'}</Text></Pressable>
      </>}
      <Pressable accessibilityRole="button" disabled={busy} style={s.check} onPress={() => { void run(async () => {
        const { error } = await supabase.auth.signOut(); if (error) throw error;
      }, 'ログアウトできませんでした'); }}><Text style={s.link}>ログアウト</Text></Pressable>
    </ScrollView></SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 16 },
  note: { color: colors.sub, lineHeight: 22, marginBottom: 14 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  input: { flex: 1, padding: 12, borderWidth: 1, borderColor: colors.line2, borderRadius: 10, backgroundColor: colors.paper },
  link: { color: colors.accent, marginVertical: 10, fontWeight: '700' },
  check: { paddingVertical: 16 },
  error: { color: colors.danger, marginBottom: 12 },
  button: { padding: 15, backgroundColor: colors.accent, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '800' },
});
