import { useCallback, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

type Status = { pending: boolean; scheduled_at?: string };

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

/**
 * 退会（アカウント削除）。
 * App Store の必須要件（アプリ内でアカウント削除を提供すること）に対応する画面。
 * 猶予期間つきで、完了までは取り消せる。残高は完了時に失効するため、事前に明示する。
 */
export default function DeleteAccount() {
  const [status, setStatus] = useState<Status | null>(null);
  const [balance, setBalance] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const [{ data: st, error: sErr }, { data: w }] = await Promise.all([
      supabase.rpc('my_account_deletion'),
      u.user
        ? supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single()
        : Promise.resolve({ data: null }),
    ]);
    if (sErr) throw sErr;
    setStatus(st as unknown as Status);
    setBalance((w as { balance: number } | null)?.balance ?? 0);
  }, []);

  const { loading, error, reload } = useLoader(load);

  function confirmDelete() {
    // 残高がある場合は失効を明示してから確認する（黙って消さない）
    const warn = balance > 0
      ? `保有中の ${balance.toLocaleString()} P は退会の完了時に失効します。\n交換がお済みでない場合は、退会前にご交換ください。\n\n本当に退会しますか？`
      : '本当に退会しますか？';
    Alert.alert('退会の確認', warn, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '退会する', style: 'destructive', onPress: () => { void submit(); } },
    ]);
  }

  async function submit() {
    setBusy(true);
    const { data, error: rErr } = await supabase.rpc('request_account_deletion', {
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (rErr) { Alert.alert('手続きできませんでした', rErr.message); return; }

    const res = data as unknown as { status: string; reason?: string; scheduled_at?: string; notice?: string };
    if (res.status !== 'ok') {
      Alert.alert('手続きできませんでした', 'すでに退会手続きが完了しています。');
      return;
    }
    Alert.alert(
      '退会を受け付けました',
      `${res.scheduled_at ? fmtDate(res.scheduled_at) : ''}に完了します。それまではいつでもキャンセルできます。`,
    );
    reload().catch(() => {});
  }

  async function cancel() {
    setBusy(true);
    const { error: cErr } = await supabase.rpc('cancel_account_deletion');
    setBusy(false);
    if (cErr) { Alert.alert('キャンセルできませんでした', cErr.message); return; }
    Alert.alert('退会をキャンセルしました', 'これまで通りご利用いただけます。');
    reload().catch(() => {});
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: true, title: '退会' }} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        {status?.pending ? (
          <>
            <View style={s.pendingBox}>
              <Text style={s.pendingTitle}>退会手続き中</Text>
              <Text style={s.pendingText}>
                {status.scheduled_at ? `${fmtDate(status.scheduled_at)}に退会が完了します。` : ''}
                {'\n'}それまではキャンセルできます。
              </Text>
            </View>
            <Pressable style={[s.cancelBtn, busy && { opacity: 0.5 }]} onPress={cancel} disabled={busy}
              accessibilityRole="button">
              <Text style={s.cancelText}>{busy ? '...' : '退会をキャンセルする'}</Text>
            </Pressable>
          </>
        ) : status ? (
          <>
            <Text style={s.h}>退会するとどうなりますか？</Text>
            <View style={s.list}>
              <Text style={s.li}>・保有ポイントは<Text style={s.bold}>失効</Text>します（交換・換金はできません）</Text>
              <Text style={s.li}>・プロフィールやアカウント情報は削除されます</Text>
              <Text style={s.li}>・投稿は残りますが、投稿者は「退会したユーザー」と表示されます</Text>
              <Text style={s.li}>・不正防止と法令遵守に必要な記録は、規約・プライバシーポリシーに基づき一定期間保持します</Text>
              <Text style={s.li}>・同じメールアドレスで再登録しても、以前のデータは復元できません</Text>
            </View>

            {balance > 0 && (
              <View style={s.warnBox}>
                <Text style={s.warnText}>
                  現在 {balance.toLocaleString()} P を保有しています。{'\n'}
                  退会前の交換をおすすめします。
                </Text>
                <Pressable onPress={() => router.push('/exchange')} accessibilityRole="button">
                  <Text style={s.warnLink}>ポイントを交換する ›</Text>
                </Pressable>
              </View>
            )}

            <Text style={s.label}>差し支えなければ理由をお聞かせください（任意）</Text>
            <TextInput
              style={s.input}
              placeholder="例: ポイントが貯まりにくい"
              multiline
              value={reason}
              onChangeText={setReason}
              accessibilityLabel="退会理由"
            />

            <Pressable style={[s.deleteBtn, busy && { opacity: 0.5 }]} onPress={confirmDelete} disabled={busy}
              accessibilityRole="button">
              <Text style={s.deleteText}>{busy ? '...' : '退会手続きへ進む'}</Text>
            </Pressable>
            <Text style={s.hint}>
              手続き後、一定期間の猶予をおいて完了します。完了までは取り消せます。
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 12 },
  list: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, gap: 9 },
  li: { fontSize: 13, color: colors.sub, lineHeight: 20 },
  bold: { fontWeight: '800', color: colors.danger },
  warnBox: { backgroundColor: colors.warnSoft, borderRadius: 14, padding: 16, marginTop: 14 },
  warnText: { fontSize: 13, color: '#8a6d1f', fontWeight: '700', lineHeight: 20 },
  warnLink: { fontSize: 13, color: colors.accent, fontWeight: '800', marginTop: 10 },
  label: { fontSize: 12, fontWeight: '800', color: colors.ink, marginTop: 26, marginBottom: 8 },
  input: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line2, borderRadius: 12,
    padding: 14, fontSize: 14, minHeight: 84, textAlignVertical: 'top',
  },
  deleteBtn: { backgroundColor: '#fdecea', borderWidth: 1, borderColor: '#f3c6c1', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 22 },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: 14 },
  hint: { fontSize: 11, color: colors.muted, marginTop: 12, lineHeight: 17, textAlign: 'center' },
  pendingBox: { backgroundColor: colors.warnSoft, borderRadius: 14, padding: 18 },
  pendingTitle: { fontSize: 15, fontWeight: '800', color: '#8a6d1f' },
  pendingText: { fontSize: 13, color: '#8a6d1f', marginTop: 8, lineHeight: 20 },
  cancelBtn: { backgroundColor: colors.accent, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 18 },
  cancelText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
