import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { VisualSlot } from '@/components/VisualSlot';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Mission, MissionCompletion, MissionType, Offer } from '@/lib/types';

const tabs: { key: MissionType; label: string }[] = [
  { key: 'daily', label: 'デイリー' },
  { key: 'weekly', label: 'ウィークリー' },
  { key: 'achievement', label: '実績' },
  { key: 'event', label: '期間限定' },
];

const demoMissions: Mission[] = [
  { id: 'demo-daily-1', type: 'daily', title: 'ゲームニュースを1本読む', description: '提携メディアの記事閲覧でポイント獲得', reward_points: 3000, icon: 'N', max_progress: 1, requires_verification: false, ends_at: null },
  { id: 'demo-daily-2', type: 'daily', title: 'ログインボーナスを受け取る', description: '毎日1回、ホームから受け取り可能', reward_points: 1000, icon: 'L', max_progress: 1, requires_verification: false, ends_at: null },
  { id: 'demo-weekly-1', type: 'weekly', title: 'ミッションを5件クリアする', description: '今週の合計達成数で判定します', reward_points: 20000, icon: '5', max_progress: 5, requires_verification: false, ends_at: null },
  { id: 'demo-achieve-1', type: 'achievement', title: '初めて交換申請する', description: 'ゲームコードまたはデジタルギフトへ交換', reward_points: 8000, icon: 'G', max_progress: 1, requires_verification: false, ends_at: null },
  { id: 'demo-event-1', type: 'event', title: '週末ブースト: 提携オファー確認', description: '外部サービス側の完了通知後に確定', reward_points: 12000, icon: 'B', max_progress: 1, requires_verification: true, ends_at: null },
];

const demoOffers: Offer[] = [
  { id: 'offer-1', mission_id: null, title: '新作RPGの事前登録', description: '登録完了後、postback検証で確定', icon_url: null, target_url: null, reward_points: 18000, event_type: 'pre_register', status: 'active' },
  { id: 'offer-2', mission_id: null, title: '30秒動画を視聴', description: '1日10回まで即時付与', icon_url: null, target_url: null, reward_points: 500, event_type: 'video', status: 'active' },
];

export default function Missions() {
  const router = useRouter();
  const [tab, setTab] = useState<MissionType>('daily');
  const [missions, setMissions] = useState<Mission[]>(demoMissions);
  const [completions, setCompletions] = useState<Record<string, MissionCompletion>>({});
  const [offers, setOffers] = useState<Offer[]>(demoOffers);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const [{ data: ms }, { data: cs }, { data: os }] = await Promise.all([
      supabase.from('missions').select('*').eq('is_active', true),
      supabase.from('mission_completions').select('*').eq('user_id', u.user.id),
      supabase.from('offers').select('*').eq('status', 'active').limit(20),
    ]);

    if (ms?.length) setMissions(ms as Mission[]);
    if (os?.length) setOffers(os as Offer[]);

    const map: Record<string, MissionCompletion> = {};
    ((cs as MissionCompletion[]) ?? []).forEach((completion) => {
      map[completion.mission_id] = completion;
    });
    setCompletions(map);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const list = useMemo(() => missions.filter((mission) => mission.type === tab), [missions, tab]);

  async function claim(mission: Mission) {
    setBusy(mission.id);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || mission.id.startsWith('demo-')) {
      setBusy(null);
      setCompletions((current) => ({
        ...current,
        [mission.id]: {
          id: `${mission.id}-completion`,
          mission_id: mission.id,
          status: mission.requires_verification ? 'pending' : 'confirmed',
          progress: mission.max_progress,
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      }));
      return;
    }

    const { error } = await supabase.rpc('claim_mission', { p_mission_id: mission.id });
    setBusy(null);
    if (error) {
      Alert.alert('受け取りできませんでした', error.message);
      return;
    }
    load();
  }

  async function startOffer(offer: Offer) {
    if (busy) return;
    setBusy(offer.id);
    setOfferError(null);

    try {
      let clickId: string;

      if (!hasSupabaseConfig || offer.id.startsWith('offer-')) {
        clickId = `demo-${Date.now()}`;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          Alert.alert('ログインが必要です', 'オファーを開始するにはログインしてください。');
          return;
        }
        if (!offer.mission_id) {
          Alert.alert('開始できません', 'このオファーには検証用ミッションが設定されていません。');
          return;
        }

        const { data, error } = await supabase.rpc('track_click', {
          p_mission_id: offer.mission_id,
        });
        if (error) throw error;
        if (typeof data !== 'string' || !data) throw new Error('click_id を発行できませんでした');
        clickId = data;
      }

      if (offer.target_url) {
        await Linking.openURL(appendQuery(offer.target_url, { click_id: clickId, offer_id: offer.id }));
      } else {
        router.push({
          pathname: '/offer-test',
          params: {
            click_id: clickId,
            offer_id: offer.id,
            offer_title: offer.title,
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : JSON.stringify(error);
      setOfferError(message);
      Alert.alert('オファーを開始できませんでした', message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <Text style={s.h}>ミッション</Text>
        <Text style={s.sub}>毎日の小さな達成をポイントに変える</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsWrap} contentContainerStyle={s.tabs}>
        {tabs.map((item) => (
          <Pressable key={item.key} style={[s.tab, tab === item.key && s.tabOn]} onPress={() => setTab(item.key)}>
            <Text style={[s.tabText, tab === item.key && s.tabTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {tab === 'event' && (
          <View style={s.fireBanner}>
            <Text style={s.fireTitle}>週末限定ブースト</Text>
            <Text style={s.fireText}>イベントミッションは期限と検証状態をはっきり見せます。</Text>
          </View>
        )}

        {list.length === 0 && <Text style={s.empty}>このカテゴリのミッションはまだありません</Text>}
        {list.map((mission) => {
          const completion = completions[mission.id];
          const done = completion?.status === 'confirmed';
          const pending = completion?.status === 'pending';
          return (
            <View key={mission.id} style={s.card}>
              <View style={s.iconBox}>
                <Text style={s.iconText}>{mission.icon ?? 'M'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{mission.title}</Text>
                {!!mission.description && <Text style={s.desc} numberOfLines={2}>{mission.description}</Text>}
                <Text style={s.reward}>+{mission.reward_points.toLocaleString()} P{mission.requires_verification ? ' ・ 検証あり' : ''}</Text>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: done || pending ? '100%' : '42%' }]} />
                </View>
                <Text style={s.progress}>{done || pending ? '1 / 1' : '進行中'}</Text>
              </View>
              {done ? (
                <View style={[s.badge, s.badgeOk]}><Text style={s.badgeOkText}>完了</Text></View>
              ) : pending ? (
                <View style={[s.badge, s.badgeWarn]}><Text style={s.badgeWarnText}>検証中</Text></View>
              ) : (
                <Pressable style={[s.btn, busy === mission.id && { opacity: 0.5 }]} disabled={busy === mission.id} onPress={() => claim(mission)}>
                  <Text style={s.btnText}>{busy === mission.id ? '...' : '挑戦'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={s.section}>提携オファー</Text>
        <View style={s.offerLead}>
          <Text style={s.offerLeadTitle}>外部成果は postback 検証後に確定</Text>
          <Text style={s.offerLeadText}>広告感が強くなりすぎないよう、後で実写寄りのサムネイルへ差し替えます。</Text>
        </View>
        {!!offerError && <Text style={s.offerError}>開始エラー: {offerError}</Text>}
        {offers.map((offer) => (
          <Pressable
            key={offer.id}
            style={[s.offer, busy === offer.id && { opacity: 0.55 }]}
            disabled={busy !== null}
            onPress={() => startOffer(offer)}
          >
            <View style={s.offerThumb}>
              <VisualSlot tone="offer" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{offer.title}</Text>
              {!!offer.description && <Text style={s.desc} numberOfLines={2}>{offer.description}</Text>}
              <Text style={s.reward}>+{offer.reward_points.toLocaleString()} P ・ {offer.event_type ?? 'offer'}</Text>
            </View>
            <View style={[s.badge, s.badgeWarn]}>
              <Text style={s.badgeWarnText}>{busy === offer.id ? '開始中' : '開く'}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  h: { fontSize: 21, fontWeight: '900', color: colors.ink },
  sub: { color: colors.sub, fontSize: 12, fontWeight: '700', marginTop: 3 },
  tabsWrap: { flexGrow: 0 },
  tabs: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 999, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontSize: 12, fontWeight: '800', color: colors.sub },
  tabTextOn: { color: '#fff' },
  content: { padding: 16, paddingBottom: 32 },
  fireBanner: { backgroundColor: '#fdecea', borderWidth: 1, borderColor: '#f3c6c0', borderRadius: 13, padding: 12, marginBottom: 12 },
  fireTitle: { color: '#a13226', fontWeight: '900', fontSize: 13 },
  fireText: { color: '#a13226', fontWeight: '700', fontSize: 11, marginTop: 3 },
  empty: { color: colors.muted, fontSize: 13 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 13, marginBottom: 10, gap: 12 },
  iconBox: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  title: { fontSize: 13, fontWeight: '800', color: colors.ink, lineHeight: 18 },
  desc: { fontSize: 12, color: colors.sub, marginTop: 3, lineHeight: 17 },
  reward: { fontSize: 11, color: colors.gold, fontWeight: '900', marginTop: 5 },
  bar: { height: 7, backgroundColor: colors.line, borderRadius: 99, overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 99 },
  progress: { fontSize: 10, color: colors.muted, marginTop: 4 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13 },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  badge: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
  badgeOk: { backgroundColor: colors.okSoft },
  badgeOkText: { color: colors.ok, fontWeight: '900', fontSize: 12 },
  badgeWarn: { backgroundColor: colors.warnSoft },
  badgeWarnText: { color: colors.warn, fontWeight: '900', fontSize: 12 },
  section: { fontSize: 12, fontWeight: '900', color: colors.sub, marginTop: 18, marginBottom: 10, letterSpacing: 0.4 },
  offerLead: { backgroundColor: '#e7f3ec', borderRadius: 13, padding: 12, marginBottom: 10 },
  offerLeadTitle: { color: '#1f7a5b', fontWeight: '900', fontSize: 13 },
  offerLeadText: { color: '#447765', fontWeight: '700', fontSize: 11, marginTop: 3, lineHeight: 16 },
  offerError: { color: colors.danger, fontWeight: '800', fontSize: 12, marginBottom: 10 },
  offer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffdf6', borderWidth: 1, borderColor: '#e8d7a9', borderRadius: 14, padding: 13, marginBottom: 10, gap: 12 },
  offerThumb: { width: 50, height: 50, borderRadius: 12, overflow: 'hidden' },
});

function appendQuery(url: string, params: Record<string, string>) {
  const separator = url.includes('?') ? '&' : '?';
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${url}${separator}${query}`;
}
