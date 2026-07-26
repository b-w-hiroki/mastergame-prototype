import { useCallback, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

type RewardState = { amount: number; label?: string } | null;

/**
 * ポイント獲得の演出（ポイ活の「獲得した感」を担う）。
 * useReward() が返す show() をミッション達成/交換成功時に呼び、node をツリーに置く。
 */
export function useReward() {
  const [reward, setReward] = useState<RewardState>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  const show = useCallback((amount: number, label?: string) => {
    setReward({ amount, label });
    opacity.setValue(0);
    translateY.setValue(20);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(opacity, { toValue: 0, duration: 260, delay: 1100, useNativeDriver: true }).start(() => {
        setReward(null);
      });
    });
  }, [opacity, translateY]);

  const node = reward ? (
    <View pointerEvents="none" style={s.overlay}>
      <Animated.View style={[s.card, { opacity, transform: [{ translateY }] }]}>
        <Text style={s.burst}>🎉</Text>
        <Text style={s.amount}>＋{reward.amount.toLocaleString()} P</Text>
        {reward.label ? <Text style={s.label}>{reward.label}</Text> : null}
      </Animated.View>
    </View>
  ) : null;

  return { show, node };
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  card: {
    backgroundColor: colors.ink, borderRadius: 18, paddingVertical: 20, paddingHorizontal: 30,
    alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  burst: { fontSize: 34 },
  amount: { color: colors.gold, fontSize: 26, fontWeight: '900', marginTop: 6 },
  label: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 4 },
});
