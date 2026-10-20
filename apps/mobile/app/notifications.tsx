import { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { resolveNotification, relativeTime } from '@/lib/notifications';
import { isNotificationRow } from '@/lib/notificationRows';
import type { AppNotification } from '@mastergame/shared';

/**
 * 通知センター。
 * 運営回答（0027）・失効予告（0024）・コミュニティ（0004）などの通知を一覧し、
 * 種別ごとの適切な画面へ遷移する。ホームの3件表示はここへの入り口。
 */
export default function Notifications() {
  const [list, setList] = useState<AppNotification[]>([]);
  const [busy, setBusy] = useState(false);
  const marking = useRef(false);
  const [actionError, setActionError] = useState('');
  const readRequests = useRef(new Map<string, Promise<'success' | 'failure' | 'stale'>>());
  const readVersion = useRef(0);
  const loadedUser = useRef<string | null>(null);

  async function isCurrentRead(userId: string, version: number): Promise<boolean> {
    if (readVersion.current !== version || loadedUser.current !== userId) return false;
    try {
      const { data, error: authError } = await supabase.auth.getUser();
      return !authError && data.user?.id === userId
        && readVersion.current === version && loadedUser.current === userId;
    } catch {
      return false;
    }
  }

  function persistRead(id: string, userId: string, version: number): Promise<'success' | 'failure' | 'stale'> {
    const current = readRequests.current.get(id);
    if (current) return current;
    // 個別既読と一括既読で同じ進行中リクエストを共有する。
    const task = (async () => {
      if (!await isCurrentRead(userId, version)) return 'stale' as const;
      try {
        const { data, error } = await supabase.rpc('mark_notification_read', { p_id: id });
        if (!await isCurrentRead(userId, version)) return 'stale' as const;
        return !error && (data as { ok?: boolean } | null)?.ok === true ? 'success' as const : 'failure' as const;
      } catch {
        return await isCurrentRead(userId, version) ? 'failure' as const : 'stale' as const;
      }
    })();
    readRequests.current.set(id, task);
    void task.then(() => { if (readRequests.current.get(id) === task) readRequests.current.delete(id); });
    return task;
  }

  const load = useCallback(async (isCurrent: () => boolean) => {
    ++readVersion.current;
    loadedUser.current = null;
    readRequests.current.clear();
    setList([]);
    setActionError('');
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!userData.user) throw new Error('ログイン状態を確認できません。');
    const { data, error: qErr } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (qErr) throw qErr;
    if (!Array.isArray(data) || !data.every((row) => isNotificationRow(row, userData.user.id))) {
      throw new Error('通知一覧を確認できませんでした。');
    }
    if (!isCurrent()) return;
    const { data: currentUser, error: currentAuthError } = await supabase.auth.getUser();
    if (currentAuthError || currentUser.user?.id !== userData.user.id) {
      throw new Error('通知の取得中にログイン状態が変わりました。');
    }
    if (!isCurrent()) return;
    loadedUser.current = userData.user.id;
    setList(data as AppNotification[]);
  }, []);

  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);

  async function open(n: AppNotification) {
    if (loading || refreshing || error) return;
    const view = resolveNotification(n);
    const userId = loadedUser.current;
    const version = readVersion.current;
    // 既読化は遷移を待たせない（失敗しても一覧の再取得で回復する）
    if (!n.read_at && userId) {
      const readAt = new Date().toISOString();
      setList((current) => current.map((row) => row.id === n.id ? { ...row, read_at: readAt } : row));
      // PostgREST のビルダーは thenable（.catch を持たない）なので Promise に包む
      void persistRead(n.id, userId, version).then((result) => {
        if (result === 'failure' && readVersion.current === version && loadedUser.current === userId) {
          setActionError('既読の保存に失敗しました。再読み込みして確認してください。');
          setList((current) => current.map((row) => row.id === n.id ? { ...row, read_at: null } : row));
        }
      });
    }
    if (view.href) router.push(view.href as never);
  }

  // まとめて既読。1件ずつ RPC を叩く（専用RPCを足すほどの頻度ではない）
  async function markAllRead() {
    if (marking.current || loading || refreshing || error) return;
    const userId = loadedUser.current;
    const version = readVersion.current;
    if (!userId) return;
    const unread = list.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    marking.current = true;
    setBusy(true);
    setActionError('');
    const succeeded = new Set<string>();
    try {
      for (const n of unread) {
        try {
          const result = await persistRead(n.id, userId, version);
          if (result === 'stale') return;
          if (result === 'success') succeeded.add(n.id);
        } catch { /* 失敗分は未読のまま残す */ }
      }
      if (!await isCurrentRead(userId, version)) return;
      const readAt = new Date().toISOString();
      setList((current) => current.map((n) => succeeded.has(n.id) && !n.read_at ? { ...n, read_at: readAt } : n));
      if (succeeded.size !== unread.length) setActionError('一部の既読を保存できませんでした。未読の通知を再試行してください。');
    } finally {
      marking.current = false;
      setBusy(false);
    }
  }

  const unreadCount = list.filter((n) => !n.read_at).length;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Stack.Screen options={{ headerShown: true, title: 'お知らせ' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}
        {!!actionError && <Text accessibilityRole="alert" style={s.actionError}>{actionError}</Text>}
        <Text style={s.scope}>最新50件を表示しています。「すべて既読にする」は表示中の通知が対象です。</Text>

        {!loading && !refreshing && !error && unreadCount > 0 && (
          <View style={s.toolbar}>
            <Text style={s.unread}>未読 {unreadCount} 件</Text>
            <Pressable onPress={() => { void markAllRead(); }} disabled={busy} accessibilityRole="button">
              <Text style={[s.markAll, busy && { opacity: 0.5 }]}>{busy ? '...' : 'すべて既読にする'}</Text>
            </Pressable>
          </View>
        )}

        {!loading && !refreshing && !error && list.map((n) => {
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

        {!loading && !error && list.length === 0 && (
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
  actionError: { color: colors.danger, lineHeight: 20, marginBottom: 12 },
  scope: { color: colors.sub, fontSize: 12, lineHeight: 18, marginBottom: 12 },
});
