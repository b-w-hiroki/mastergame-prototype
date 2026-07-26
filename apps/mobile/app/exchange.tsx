import { useCallback, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, pointsToYen } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import type { ExchangeItem } from '@/lib/types';

export default function Exchange() {
  const [items, setItems] = useState<ExchangeItem[]>([]);
  const [balance, setBalance] = useState(0);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: wallet }, { data: list }] = await Promise.all([
      supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single(),
      supabase.from('exchange_items').select('*').eq('is_active', true).order('sort'),
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
      <View style={s.balance}><Text style={s.balLabel}>保有ポイント</Text>
        <Text style={s.balNum}>{balance.toLocaleString()} P</Text></View>

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
      />
    </SafeAreaView>
  );
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
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
