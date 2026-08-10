import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { resolveNotification, relativeTime } from '@/lib/notifications';
import type { AppNotification } from '@mastergame/shared';

/**
 * 通知センター。
 * 運営回答（0027）・失効予告（0024）・コミュニティ（0004）などの通知を一覧し、
 * 種別ごとの適切な画面へ遷移する。ホームの3件表示はここへの入り口。
 */
export default function Notifications() {
  const [list, setList] = useState<AppNotification[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (qErr) throw qErr;
    setList((data as unknown as AppNotification[]) ?? []);
  }, []);

  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);

  async function open(n: AppNotification) {
    const view = resolveNotification(n);
    // 既読化は遷移を待たせない（失敗しても一覧の再取得で回復する）
    if (!n.read_at) {
      // PostgREST のビルダーは thenable（.catch を持たない）なので Promise に包む
      Promise.resolve(supabase.rpc('mark_notification_read', { p_id: n.id }))
        .then(() => reload())
        .catch(() => {});
    }
    if (view.href) router.push(view.href as never);
  }

  // まとめて既読。1件ずつ RPC を叩く（専用RPCを足すほどの頻度ではない）
  async function markAllRead() {
    const unread = list.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    setBusy(true);
    for (const n of unread) {
      try { await supabase.rpc('mark_notification_read', { p_id: n.id }); } catch { /* 個別失敗は無視 */ }
    }
    setBusy(false);
    reload().catch(() => {});
  }

  const unreadCount = list.filter((n) => !n.read_at).length;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: true, title: 'お知らせ' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        {unreadCount > 0 && (
          <View style={s.toolbar}>
            <Text style={s.unread}>未読 {unreadCount} 件</Text>
            <Pressable onPress={() => { void markAllRead(); }} disabled={busy} accessibilityRole="button">
              <Text style={[s.markAll, busy && { opacity: 0.5 }]}>{busy ? '...' : 'すべて既読にする'}</Text>
            </Pressable>
          </View>
        )}

        {list.map((n) => {
          const v = resolveNotification(n);
          return (
            <Pressable
              key={n.id}
              style={[s.row, !n.read_at && s.rowUnread]}
              onPress={() => { void open(n); }}
              accessibilityRole="button"
              accessibilityLabel={v.title}
            >
              <Text style={s.icon}>{v.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.title, !n.read_at && s.titleUnread]}>{v.title}</Text>
                {v.body && <Text style={s.body} numberOfLines={2}>{v.body}</Text>}
                <Text style={s.time}>{relativeTime(n.created_at)}</Text>
              </View>
              {!n.read_at && <View style={s.dot} />}
              {v.href && <Text style={s.chevron}>›</Text>}
            </Pressable>
          );
        })}

        {!loading && list.length === 0 && (
          <Text style={s.empty}>お知らせはまだありません</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  unread: { fontSize: 12, fontWeight: '800', color: colors.accent },
  markAll: { fontSize: 12, fontWeight: '800', color: colors.sub },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.paper,
    borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 8,
  },
  rowUnread: { borderColor: '#cdd3f4', backgroundColor: '#fbfbff' },
  icon: { fontSize: 20 },
  title: { fontSize: 13, fontWeight: '600', color: colors.ink },
  titleUnread: { fontWeight: '800' },
  body: { fontSize: 12, color: colors.sub, marginTop: 3, lineHeight: 17 },
  time: { fontSize: 10.5, color: colors.muted, fontWeight: '700', marginTop: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  chevron: { fontSize: 20, color: colors.muted },
  empty: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 30 },
});
