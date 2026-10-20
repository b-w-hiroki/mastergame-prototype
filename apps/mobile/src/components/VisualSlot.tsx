import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

type VisualSlotProps = {
  tone?: 'hero' | 'offer' | 'gift' | 'news';
  label?: string;
};

export function VisualSlot({ tone = 'gift', label }: VisualSlotProps) {
  return (
    <View style={[s.frame, toneStyles[tone]]}>
      <View style={s.backPlate} />
      <View style={s.cardOne} />
      <View style={s.cardTwo} />
      <View style={s.dotRow}>
        <View style={s.dot} />
        <View style={[s.dot, s.dotSmall]} />
        <View style={s.dot} />
      </View>
      {!!label && <Text style={s.label}>{label}</Text>}
    </View>
  );
}

const toneStyles = StyleSheet.create({
  hero: { backgroundColor: '#30374d' },
  offer: { backgroundColor: '#e7f3ec' },
  gift: { backgroundColor: '#efe7d2' },
  news: { backgroundColor: '#e7e9f2' },
});

const s = StyleSheet.create({
  frame: {
    flex: 1,
    minHeight: 48,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPlate: {
    position: 'absolute',
    width: '70%',
    height: '48%',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    transform: [{ rotate: '-8deg' }],
  },
  cardOne: {
    width: '42%',
    height: '34%',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
    transform: [{ translateX: -16 }, { rotate: '7deg' }],
  },
  cardTwo: {
    position: 'absolute',
    width: '30%',
    height: '26%',
    borderRadius: 9,
    backgroundColor: 'rgba(31,36,48,0.16)',
    transform: [{ translateX: 24 }, { translateY: 8 }, { rotate: '-5deg' }],
  },
  dotRow: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.46)',
  },
  dotSmall: {
    width: 4,
    height: 4,
  },
  label: {
    position: 'absolute',
    left: 12,
    bottom: 8,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
});
