import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

/**
 * メインのタブナビゲーション（prototype core-flow.html の下部ナビに対応）。
 * ホーム / ミッション / ポイント / コミュニティ / マイページ。
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line, height: 58, paddingBottom: 6, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'ホーム', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="missions"
        options={{ title: 'ミッション', tabBarIcon: ({ color, size }) => <Ionicons name="checkbox-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="points"
        options={{ title: 'ポイント', tabBarIcon: ({ color, size }) => <Ionicons name="server-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="community"
        options={{ title: 'コミュニティ', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="mypage"
        options={{ title: 'マイページ', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
