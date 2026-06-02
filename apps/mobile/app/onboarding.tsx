import { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors } from '@/lib/theme';

const SLIDES = [
  { emoji: '🎮', title: '遊ぶほど、得をする', body: 'ミッションをこなしてポイントを貯めよう。記事を読む・動画を見る・ゲームをプレイ。' },
  { emoji: '🎁', title: '貯めて、交換', body: '貯めたポイントは、提携ゲームの限定アイテムや実物報酬と交換できます。' },
  { emoji: '🤝', title: '仲間と助け合う', body: 'ギルドで質問・依頼・雑談。ベストアンサーにはポイントを贈れます。' },
  { emoji: '👑', title: 'VIPで、もっと得', body: '続けるほどランクアップ。保有ボーナス（ステーキング）や獲得ブーストが強化されます。' },
];

/** オンボーディング（4枚）→ ジャンル選択へ。prototype の splash→onboarding に対応。 */
export default function Onboarding() {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }
  function next() {
    if (page < SLIDES.length - 1) ref.current?.scrollTo({ x: width * (page + 1), animated: true });
    else router.replace('/genres');
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll} style={{ flexGrow: 0 }}>
        {SLIDES.map((sl, i) => (
          <View key={i} style={[s.slide, { width }]}>
            <Text style={s.emoji}>{sl.emoji}</Text>
            <Text style={s.title}>{sl.title}</Text>
            <Text style={s.body}>{sl.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.dots}>
        {SLIDES.map((_, i) => <View key={i} style={[s.dot, i === page && s.dotOn]} />)}
      </View>

      <View style={s.footer}>
        <Pressable style={s.btn} onPress={next}>
          <Text style={s.btnText}>{page < SLIDES.length - 1 ? '次へ' : 'はじめる'}</Text>
        </Pressable>
        {page < SLIDES.length - 1 && (
          <Pressable onPress={() => router.replace('/genres')}><Text style={s.skip}>スキップ</Text></Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, paddingTop: 80 },
  emoji: { fontSize: 72, marginBottom: 28 },
  title: { fontSize: 24, fontWeight: '900', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, color: colors.sub, textAlign: 'center', marginTop: 14, lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line2 },
  dotOn: { backgroundColor: colors.accent, width: 22 },
  footer: { padding: 24, gap: 14, alignItems: 'center' },
  btn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center', alignSelf: 'stretch' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  skip: { color: colors.muted, fontWeight: '700' },
});
