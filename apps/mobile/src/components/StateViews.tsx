import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';

/** 初回ロード中のスピナー */
export function LoadingView() {
  return (
    <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
  );
}

/** 取得失敗時のバナー（再読み込みボタン付き） */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={s.errBox} accessibilityRole="alert">
      <Text style={s.errText}>{message}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button">
        <Text style={s.errRetry}>再読み込み</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 20, alignItems: 'center' },
  errBox: {
    backgroundColor: '#fde8e8', borderWidth: 1, borderColor: '#f5c2c2', borderRadius: 12,
    padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  errText: { color: '#a12a2a', fontSize: 12, flex: 1 },
  errRetry: { color: '#a12a2a', fontWeight: '800', fontSize: 12 },
});
