import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { VisualSlot } from '@/components/VisualSlot';
import { supabase } from '@/lib/supabase';
import { colors, pointsToYen } from '@/lib/theme';
import type { ExchangeItem, ExchangeRequest } from '@/lib/types';

const demoItems: ExchangeItem[] = [
  { id: 'demo-code-1500', name: '1,500円分のゲームコード', cost_points: 150000, delivery_method: 'code', stock: 24, game_id: null },
  { id: 'demo-code-500', name: '500円分のデジタルギフト', cost_points: 50000, delivery_method: 'code', stock: 80, game_id: null },
  { id: 'demo-skin', name: '限定プロフィールフレーム', cost_points: 32000, delivery_method: 'api', stock: null, game_id: null },
  { id: 'demo-ticket', name: '抽選チケット 5枚セット', cost_points: 18000, delivery_method: 'csv', stock: 120, game_id: null },
];

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

    if (wallet?.balance != null) setBalance(wallet.balance);
    if (list?.length) setItems(list as ExchangeItem[]);
    setRequests((history as unknown as ExchangeRequest[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function exchange(item: ExchangeItem) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || item.id.startsWith('demo-')) {
      setBalance((current) => current - item.cost_points);
      Alert.alert('交換を受け付けました', `「${item.name}」の交換申請をデモ受付しました。`);
      return;
    }

    const { data, error } = await supabase.rpc('request_exchange', { p_item_id: item.id });
    if (error) {
      Alert.alert('交換できませんでした', error.message);
      return;
    }
    Alert.alert('交換を受け付けました', `「${item.name}」と交換申請しました。`);
    load();
    void data;
  }

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ title: 'ポイント交換', headerShown: true }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.content}
        ListHeaderComponent={
          <>
            <View style={s.balance}>
              <Text style={s.balLabel}>保有ポイント</Text>
              <Text style={s.balNum}>{balance.toLocaleString()} P</Text>
              <Text style={s.balYen}>約 {pointsToYen(balance).toLocaleString()} 円相当</Text>
            </View>
            <View style={s.nudge}>
              <Text style={s.nudgeTitle}>あと少しで届く交換先を優先表示</Text>
              <Text style={s.nudgeText}>不足ポイントを明確に出して、次のミッションへ戻りやすくします。</Text>
            </View>
            <Text style={s.section}>交換アイテム</Text>
          </>
        }
        renderItem={({ item }) => {
          const enough = balance >= item.cost_points;
          const gap = Math.max(0, item.cost_points - balance);
          return (
            <View style={s.item}>
              <View style={s.thumb}>
                <VisualSlot tone="gift" />
              </View>
              <View style={s.itemBody}>
                <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
                <Text style={s.stock}>{stockLabel(item.stock)}</Text>
                <Text style={s.itemCost}>{item.cost_points.toLocaleString()} P</Text>
                {!enough && <Text style={s.gap}>あと {gap.toLocaleString()}P</Text>}
                <Pressable style={[s.btn, !enough && s.btnOff]} disabled={!enough} onPress={() => exchange(item)}>
                  <Text style={s.btnText}>{enough ? '交換する' : '不足'}</Text>
                </Pressable>
              </View>
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
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  balance: { backgroundColor: colors.ink, borderRadius: 18, padding: 20, marginBottom: 12, alignItems: 'center' },
  balLabel: { color: '#c2c6d8', fontSize: 11, fontWeight: '800' },
  balNum: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 4 },
  balYen: { color: '#aeb3c8', fontSize: 12, fontWeight: '700', marginTop: 4 },
  nudge: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: '#e7d6a6', borderRadius: 14, padding: 13, marginBottom: 18 },
  nudgeTitle: { color: '#7a5b16', fontWeight: '900', fontSize: 13 },
  nudgeText: { color: '#9a7e3a', fontWeight: '700', fontSize: 11, marginTop: 3, lineHeight: 16 },
  section: { color: colors.sub, fontSize: 12, fontWeight: '900', marginBottom: 10, letterSpacing: 0.4 },
  row: { gap: 11 },
  item: { flex: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden', marginBottom: 11 },
  thumb: { height: 98, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemBody: { padding: 11 },
  itemName: { fontSize: 12.5, fontWeight: '800', color: colors.ink, lineHeight: 17, minHeight: 34 },
  stock: { fontSize: 10.5, color: colors.muted, fontWeight: '700', marginTop: 3 },
  itemCost: { fontSize: 15, fontWeight: '900', color: colors.accent, marginTop: 7 },
  gap: { fontSize: 10.5, color: colors.gold, fontWeight: '900', marginTop: 2 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 9, alignItems: 'center', marginTop: 9 },
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
