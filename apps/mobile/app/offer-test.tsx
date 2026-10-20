import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function OfferTestPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    click_id?: string;
    offer_id?: string;
    offer_title?: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function completeTestOffer() {
    if (!params.click_id || busy) return;
    setBusy(true);

    try {
      if (!hasSupabaseConfig || params.click_id.startsWith('demo-')) {
        setResult('デモ成果を確認しました。実データへのポイント付与は行っていません。');
        return;
      }

      const { data, error } = await supabase.functions.invoke('test-offer-complete', {
        body: { click_id: params.click_id },
      });
      if (error) throw error;

      const status = typeof data?.status === 'string' ? data.status : 'unknown';
      if (status !== 'accepted' && status !== 'duplicate') {
        throw new Error(typeof data?.reason === 'string' ? data.reason : `unexpected status: ${status}`);
      }
      setResult(status === 'accepted' ? '成果が確定し、ポイントを付与しました。' : 'この成果はすでに処理済みです。');
    } catch (error) {
      Alert.alert('成果を確定できませんでした', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.card}>
        <Text style={s.kicker}>MVP TEST OFFER</Text>
        <Text style={s.title}>{params.offer_title ?? '検証用オファー'}</Text>
        <Text style={s.body}>オファー開始とclick IDの発行まで完了しました。下のボタンで検証用成果を送信します。</Text>

        <View style={s.meta}>
          <Text style={s.metaLabel}>click_id</Text>
          <Text selectable style={s.metaValue}>{params.click_id ?? '未発行'}</Text>
          <Text style={s.metaLabel}>offer_id</Text>
          <Text selectable style={s.metaValue}>{params.offer_id ?? '未設定'}</Text>
        </View>

        {!!result && <Text style={s.result}>{result}</Text>}

        {!result && (
          <Pressable
            style={[s.button, busy && { opacity: 0.55 }]}
            disabled={busy || !params.click_id}
            onPress={completeTestOffer}
          >
            <Text style={s.buttonText}>{busy ? '成果を確認中...' : 'テスト成果を完了する'}</Text>
          </Pressable>
        )}

        <Pressable style={[s.button, s.secondaryButton]} onPress={() => router.back()}>
          <Text style={[s.buttonText, s.secondaryButtonText]}>ミッションへ戻る</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.bg,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    padding: 22,
  },
  kicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
  },
  body: {
    color: colors.sub,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
  meta: {
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    padding: 14,
    marginTop: 18,
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 7,
  },
  metaValue: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  button: {
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingVertical: 13,
    marginTop: 18,
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 10,
  },
  secondaryButtonText: {
    color: colors.ink,
  },
  result: {
    color: colors.ok,
    backgroundColor: colors.okSoft,
    borderRadius: 12,
    padding: 14,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 18,
  },
});
