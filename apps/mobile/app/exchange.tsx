import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
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

  useEffect(() => { load(); }, [load]);

  async function exchange(item: ExchangeItem) {
    const { error } = await supabase.rpc('request_exchange', { p_item_id: item.id });
    if (error) { Alert.alert('交換できませんでした', error.message); return; }
    Alert.alert('交換を受け付けました', `「${item.name}」と交換申請しました。`);
    load();
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
        renderItem={({ item }) => {
          const enough = balance >= item.cost_points;
          return (
            <View style={s.item}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{item.name}</Text>
                <Text style={s.itemCost}>{item.cost_points.toLocaleString()} P</Text>
                {!enough && <Text style={s.gap}>あと {(item.cost_points - balance).toLocaleString()}P</Text>}
              </View>
              <Pressable style={[s.btn, !enough && s.btnOff]} disabled={!enough} onPress={() => exchange(item)}>
                <Text style={s.btnText}>{enough ? '交換' : '不足'}</Text>
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
  gap: { fontSize: 11, color: '#b88a2e', fontWeight: '800', marginTop: 3 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  btnOff: { backgroundColor: '#cfd2db' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
