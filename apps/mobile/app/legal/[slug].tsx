import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';

type Doc = { slug: string; version: string; title: string; body: string };

const TITLE_FALLBACK: Record<string, string> = {
  terms: '利用規約',
  privacy: 'プライバシーポリシー',
  tokushoho: '特定商取引法に基づく表記',
};

/**
 * 法務文書の表示。本文は DB（legal_documents）から取得する。
 * 規約は改定されるものなので、アプリを再配布せず差し替えられるようにしてある。
 */
export default function Legal() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('current_legal_documents')
      .select('slug,version,title,body')
      .eq('slug', slug)
      .single();
    if (qErr) throw qErr;
    setDoc(data as unknown as Doc);
  }, [slug]);

  const { loading, error, reload } = useLoader(load);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: true, title: doc?.title ?? TITLE_FALLBACK[slug] ?? '' }} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}
        {doc && (
          <>
            <Text style={s.title}>{doc.title}</Text>
            <Text style={s.version}>版: {doc.version}</Text>
            {renderBody(doc.body)}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 本文の簡易レンダリング。`## ` 始まりを見出しに、`- ` を箇条書きにする。
 * Markdown ライブラリは持ち込まない（法務文書は書式が単純で、依存を増やす価値がない）。
 */
function renderBody(body: string) {
  return body.split('\n').map((line, i) => {
    if (line.startsWith('## ')) {
      return <Text key={i} style={s.h2}>{line.slice(3)}</Text>;
    }
    if (line.startsWith('- ')) {
      return (
        <View key={i} style={s.li}>
          <Text style={s.bullet}>・</Text>
          <Text style={s.liText}>{line.slice(2)}</Text>
        </View>
      );
    }
    if (line.trim() === '') return <View key={i} style={{ height: 10 }} />;
    return <Text key={i} style={s.p}>{line}</Text>;
  });
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: '900', color: colors.ink },
  version: { fontSize: 11, color: colors.muted, marginTop: 4, marginBottom: 18 },
  h2: { fontSize: 14, fontWeight: '800', color: colors.ink, marginTop: 18, marginBottom: 6 },
  p: { fontSize: 13, color: colors.sub, lineHeight: 21 },
  li: { flexDirection: 'row', paddingLeft: 4, marginTop: 2 },
  bullet: { fontSize: 13, color: colors.sub, lineHeight: 21 },
  liText: { flex: 1, fontSize: 13, color: colors.sub, lineHeight: 21 },
});
