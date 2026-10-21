import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { VisualSlot } from '@/components/VisualSlot';
import { supabase } from '@/lib/supabase';
import { colors, pointsToYen } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import type { ExchangeItem } from '@/lib/types';

export default function Exchange() {
  const [items, setItems] = useState<ExchangeItem[]>(demoItems);
  const [balance, setBalance] = useState(125000);
  const [requests, setRequests] = useState<ExchangeRequest[]>([]);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const [{ data: wallet }, { data: list }, { data: history }] = await Promise.all([
      supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single(),
      supabase.from('exchange_items').select('*').eq('is_active', true).order('sort'),
      supabase
        .from('exchange_requests')
        .select('id,cost_points,status,code,requested_at,fulfilled_at,exchange_items(name,delivery_method)')
        .eq('user_id', u.user.id)
        .order('requested_at', { ascending: false })
        .limit(10),
    ]);
    setBalance(wallet?.balance ?? 0);
    setItems(list ?? []);
  }, []);

  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);

  const [busy, setBusy] = useState<string | null>(null);

  async function doExchange(item: ExchangeItem) {
    setBusy(item.id);
    const { error: exError } = await supabase.rpc('request_exchange', { p_item_id: item.id });
    setBusy(null);
    if (exError) { Alert.alert('交換できませんでした', exError.message); return; }
    Alert.alert('交換を受け付けました', `「${item.name}」と交換申請しました。運営が確認後、コードをお渡しします。`);
    reload().catch(() => {});
  }

  // 消費は取り消しに手数がかかるため確認を挟む
  function confirmExchange(item: ExchangeItem) {
    Alert.alert(
      '交換の確認',
      `「${item.name}」を ${item.cost_points.toLocaleString()}P（≒¥${pointsToYen(item.cost_points).toLocaleString()}）で交換しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '交換する', onPress: () => { doExchange(item).catch(() => {}); } },
      ],
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ title: 'ポイント交換', headerShown: true }} />
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListHeaderComponent={
          <>
            {loading && <LoadingView />}
            {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}
          </>
        }
        renderItem={({ item }) => {
          const soldOut = item.stock !== null && item.stock <= 0;
          const enough = balance >= item.cost_points;
          const canExchange = enough && !soldOut && busy !== item.id;
          return (
            <View style={s.item}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{item.name}</Text>
                <Text style={s.itemCost}>{item.cost_points.toLocaleString()} P <Text style={s.yen}>≒¥{pointsToYen(item.cost_points).toLocaleString()}</Text></Text>
                <View style={s.metaRow}>
                  {item.stock !== null && (
                    <Text style={[s.meta, soldOut && s.metaOut]}>{soldOut ? '在庫切れ' : `残り ${item.stock.toLocaleString()}`}</Text>
                  )}
                  {!enough && !soldOut && <Text style={s.gap}>あと {(item.cost_points - balance).toLocaleString()}P</Text>}
                </View>
              </View>
              <Pressable style={[s.btn, !canExchange && s.btnOff]} disabled={!canExchange} onPress={() => confirmExchange(item)}>
                <Text style={s.btnText}>{soldOut ? '在庫切れ' : enough ? (busy === item.id ? '…' : '交換') : '不足'}</Text>
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={requests.length ? (
          <View style={s.history}>
            <Text style={s.section}>交換履歴</Text>
            {requests.map((request) => (
              <View key={request.id} style={s.historyRow}>
                <View style={s.historyMain}>
                  <Text style={s.historyName}>{request.exchange_items?.name ?? '交換アイテム'}</Text>
                  <Text style={s.historyMeta}>{formatRequestDate(request.requested_at)} ・ {request.cost_points.toLocaleString()}P</Text>
                  {!!request.code && <Text selectable style={s.code}>受け渡しコード: {request.code}</Text>}
                </View>
                <Text style={[s.status, request.status === 'fulfilled' && s.statusDone, request.status === 'cancelled' && s.statusCancelled]}>
                  {requestStatusLabel(request.status)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

function stockLabel(stock: number | null): string {
  if (stock == null) return '在庫あり';
  if (stock <= 0) return '在庫なし';
  return `残り ${stock}`;
}

function requestStatusLabel(status: ExchangeRequest['status']): string {
  if (status === 'fulfilled') return '受け渡し済み';
  if (status === 'cancelled') return '取消・返還済み';
  return '処理中';
}

function formatRequestDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f4f5f8' },
  balance: { backgroundColor: '#1f2430', margin: 16, borderRadius: 16, padding: 18, alignItems: 'center' },
  balLabel: { color: '#c2c6d8', fontSize: 11, fontWeight: '700' },
  balNum: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ec', borderRadius: 14, padding: 14, marginBottom: 10 },
  itemName: { fontSize: 13, fontWeight: '700' },
  itemCost: { fontSize: 15, fontWeight: '900', color: '#4f46e5', marginTop: 4 },
  yen: { fontSize: 11, fontWeight: '700', color: colors.muted },
  metaRow: { flexDirection: 'row', gap: 10, marginTop: 4, alignItems: 'center' },
  meta: { fontSize: 11, color: colors.sub, fontWeight: '700' },
  metaOut: { color: colors.danger },
  gap: { fontSize: 11, color: '#b88a2e', fontWeight: '800' },
  btn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  btnOff: { backgroundColor: '#cfd2db' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  history: { marginTop: 16 },
  historyRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 12, marginBottom: 8 },
  historyMain: { flex: 1 },
  historyName: { color: colors.ink, fontSize: 12.5, fontWeight: '900' },
  historyMeta: { color: colors.muted, fontSize: 10.5, fontWeight: '700', marginTop: 3 },
  code: { color: colors.accent, fontSize: 11.5, fontWeight: '900', marginTop: 7 },
  status: { color: '#b07d12', backgroundColor: '#fbf2dc', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 10, fontWeight: '900' },
  statusDone: { color: '#179a5b', backgroundColor: '#e6f4ec' },
  statusCancelled: { color: colors.danger, backgroundColor: '#fdecea' },
});
