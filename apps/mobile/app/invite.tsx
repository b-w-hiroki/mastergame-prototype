import { useCallback, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { useReward } from '@/components/RewardToast';

type Status = {
  code: string;
  pending: number;
  confirmed: number;
  earned_points: number;
  reward_referee: number;
  reward_referrer: number;
};

// サーバの reason をユーザー向けの文言にする。
// 「同一端末」は不正対策の核なので、詳細は明かさず・断定もせずに案内する。
const REASON_MESSAGE: Record<string, string> = {
  already_referred: 'すでに招待コードを利用済みです。招待コードは1アカウントにつき1回のみ使えます。',
  invalid_code: 'このコードは見つかりませんでした。入力内容をご確認ください。',
  self_referral: '自分の招待コードは使用できません。',
  account_too_old: '招待コードは登録直後のアカウントのみご利用いただけます。',
  moderated: 'このコードは現在ご利用いただけません。',
  same_device: 'このコードはこの端末ではご利用いただけません。',
  referrer_daily_cap: '招待した方の本日の上限に達しました。時間をおいてお試しください。',
};

export default function Invite() {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('my_referral_status');
    if (rpcError) throw rpcError;
    setStatus(data as unknown as Status);
  }, []);

  const { loading, error, reload } = useLoader(load);
  const reward = useReward();

  async function redeem() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed === '') { Alert.alert('招待コードを入力してください'); return; }
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc('redeem_referral_code', { p_code: trimmed });
    setBusy(false);
    if (rpcError) { Alert.alert('利用できませんでした', rpcError.message); return; }

    const res = data as unknown as { status: string; reason?: string; reward?: number; note?: string };
    if (res.status !== 'ok') {
      Alert.alert('利用できませんでした', REASON_MESSAGE[res.reason ?? ''] ?? 'このコードはご利用いただけません。');
      return;
    }
    setCode('');
    reward.show(res.reward ?? 0, '招待ボーナス');
    Alert.alert('招待ボーナスを獲得しました', res.note ?? '');
    reload().catch(() => {});
  }

  async function share() {
    if (!status) return;
    await Share.share({
      message:
        `MasterGame で一緒にポイ活しよう！\n招待コード: ${status.code}\n` +
        `登録時に入力すると ${status.reward_referee.toLocaleString()} P もらえます。`,
    }).catch(() => {});
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: true, title: '友だち招待' }} />
      {reward.node}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        {status && (
          <>
            <View style={s.hero}>
              <Text style={s.heroTitle}>友だちを招待して、ふたりでもらう</Text>
              <Text style={s.heroSub}>
                友だちが登録時にあなたのコードを入力すると{'\n'}
                friend に {status.reward_referee.toLocaleString()} P・
                あなたに {status.reward_referrer.toLocaleString()} P
              </Text>

              <View style={s.codeBox}>
                <Text style={s.codeLabel}>あなたの招待コード</Text>
                <Text style={s.code} accessibilityLabel={`招待コード ${status.code.split('').join(' ')}`}>
                  {status.code}
                </Text>
              </View>

              <Pressable style={s.shareBtn} onPress={share} accessibilityRole="button">
                <Text style={s.shareText}>招待リンクを送る</Text>
              </Pressable>
            </View>

            <View style={s.stats}>
              <View style={s.stat}>
                <Text style={s.statV}>{status.confirmed}</Text>
                <Text style={s.statL}>成立した招待</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statV}>{status.pending}</Text>
                <Text style={s.statL}>確定待ち</Text>
              </View>
              <View style={s.stat}>
                <Text style={s.statV}>{status.earned_points.toLocaleString()}</Text>
                <Text style={s.statL}>招待で獲得(P)</Text>
              </View>
            </View>
            <Text style={s.hint}>
              ※ あなたへのボーナスは、招待した友だちがミッションを進めた時点で確定します。
            </Text>

            <Text style={s.section}>招待コードを入力する</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="例: A3F7KMPQ"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
              />
              <Pressable
                style={[s.redeemBtn, busy && { opacity: 0.5 }]}
                onPress={redeem}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={s.redeemText}>{busy ? '...' : '使う'}</Text>
              </Pressable>
            </View>
            <Text style={s.hint}>
              招待コードは登録直後のアカウントで1回だけ使えます。
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 18, alignItems: 'center' },
  heroTitle: { fontSize: 16, fontWeight: '900', color: colors.ink },
  heroSub: { fontSize: 12, color: colors.sub, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  codeBox: { backgroundColor: colors.accentSoft, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center', marginTop: 16, alignSelf: 'stretch' },
  codeLabel: { fontSize: 11, fontWeight: '800', color: colors.accent },
  code: { fontSize: 30, fontWeight: '900', color: colors.accent, letterSpacing: 4, marginTop: 4 },
  shareBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', alignSelf: 'stretch', marginTop: 14 },
  shareText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stat: { flex: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, alignItems: 'center' },
  statV: { fontSize: 20, fontWeight: '900', color: colors.ink },
  statL: { fontSize: 11, color: colors.sub, fontWeight: '700', marginTop: 3 },
  hint: { fontSize: 11, color: colors.muted, marginTop: 10, lineHeight: 16 },
  section: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 26, marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line2, borderRadius: 12, padding: 14, fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  redeemBtn: { backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  redeemText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
