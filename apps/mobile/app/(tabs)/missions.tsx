import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useLoader } from '@/lib/useLoader';
import { LoadingView, ErrorBanner } from '@/components/StateViews';
import { useReward } from '@/components/RewardToast';
import type { Mission, MissionType, MissionCompletion, Offer } from '@/lib/types';

type OfferCompletion = { offer_id: string | null; status: string };

const TABS: { key: MissionType; label: string }[] = [
  { key: 'daily', label: 'デイリー' },
  { key: 'weekly', label: 'ウィークリー' },
  { key: 'achievement', label: '実績' },
  { key: 'event', label: '期間限定' },
];

/**
 * ミッション（prototype core-flow.html のミッションに対応）。
 * 種別タブ・提携オファー・postback検証ステータス（検証中→確定）。
 */
export default function Missions() {
  const [tab, setTab] = useState<MissionType>('daily');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [completions, setCompletions] = useState<Record<string, MissionCompletion>>({});
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerStatus, setOfferStatus] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const [{ data: ms }, { data: cs }, { data: os }, { data: ocs }] = await Promise.all([
      supabase.from('missions').select('*').eq('is_active', true),
      supabase.from('mission_completions').select('*').eq('user_id', u.user.id),
      supabase.from('offers').select('*').eq('status', 'active').limit(20),
      supabase.from('offer_completions').select('offer_id,status').eq('user_id', u.user.id),
    ]);
    setMissions(ms ?? []);
    const map: Record<string, MissionCompletion> = {};
    (cs ?? []).forEach((c) => { map[c.mission_id] = c; });
    setCompletions(map);
    setOffers(os ?? []);
    const om: Record<string, string> = {};
    ((ocs as OfferCompletion[]) ?? []).forEach((o) => { if (o.offer_id) om[o.offer_id] = o.status; });
    setOfferStatus(om);
  }, []);

  const { loading, error, refreshing, reload, onRefresh } = useLoader(load);
  const reward = useReward();

  const list = useMemo(() => missions.filter((m) => m.type === tab), [missions, tab]);

  async function claim(m: Mission) {
    setBusy(m.id);
    const { error: claimError } = await supabase.rpc('claim_mission', { p_mission_id: m.id });
    setBusy(null);
    if (claimError) { Alert.alert('受け取れませんでした', claimError.message); return; }
    reward.show(m.reward_points, m.title);
    reload().catch(() => {});
  }

  // オファー挑戦：クリックを記録（日次上限を確認）→ 外部へ遷移。
  // 達成 → ネットワークの postback → confirm_offer で確定付与される（アプリ内では「確認中」表示）。
  async function openOffer(o: Offer) {
    const { data, error: recErr } = await supabase.rpc('record_ad_impression', {
      p_placement: 'offerwall', p_ad_type: 'offerwall', p_network_id: o.network_id,
    });
    if (recErr) { Alert.alert('開けませんでした', recErr.message); return; }
    const remaining = (data as { remaining?: number } | null)?.remaining;
    if (typeof remaining === 'number' && remaining <= 0) {
      Alert.alert('本日の上限に達しました', '提携オファーの獲得は1日の上限があります。また明日お試しください。');
      return;
    }
    if (!o.offer_url) { Alert.alert('準備中', 'このオファーは現在ご利用いただけません。'); return; }
    const can = await Linking.canOpenURL(o.offer_url).catch(() => false);
    if (!can) { Alert.alert('開けませんでした', 'リンクを開けませんでした。'); return; }
    await Linking.openURL(o.offer_url);
    Alert.alert('達成後に確定します', '外部で条件を達成すると、確認後にポイントが付与されます（アプリでは「確認中」と表示されます）。');
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {reward.node}
      <Text style={s.h}>ミッション</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabsWrap} contentContainerStyle={s.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} style={[s.tab, tab === t.key && s.tabOn]} onPress={() => setTab(t.key)}>
            <Text style={[s.tabText, tab === t.key && s.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <LoadingView />}
        {error && <ErrorBanner message={error} onRetry={() => reload().catch(() => {})} />}

        {!loading && list.length === 0 && <Text style={s.empty}>このカテゴリのミッションはありません</Text>}
        {list.map((m) => {
          const c = completions[m.id];
          const done = c?.status === 'confirmed';
          const pending = c?.status === 'pending';
          return (
            <View key={m.id} style={s.card}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{m.icon ? `${m.icon} ` : ''}{m.title}</Text>
                {m.description && <Text style={s.desc} numberOfLines={2}>{m.description}</Text>}
                <Text style={s.reward}>＋{m.reward_points} P{m.requires_verification ? ' ・ 検証あり' : ''}</Text>
                {m.max_progress > 1 && !done && (
                  <View style={s.progressWrap}>
                    <View style={s.progressTrack}>
                      <View style={[s.progressFill, { width: `${Math.min(100, ((c?.progress ?? 0) / m.max_progress) * 100)}%` }]} />
                    </View>
                    <Text style={s.progressText}>{c?.progress ?? 0} / {m.max_progress}</Text>
                  </View>
                )}
              </View>
              {done ? (
                <View style={[s.badge, s.badgeOk]}><Text style={s.badgeOkText}>✓ 完了</Text></View>
              ) : pending ? (
                <View style={[s.badge, s.badgeWarn]}><Text style={s.badgeWarnText}>検証中</Text></View>
              ) : (
                <Pressable style={[s.btn, busy === m.id && { opacity: 0.5 }]} disabled={busy === m.id} onPress={() => claim(m)}>
                  <Text style={s.btnText}>{busy === m.id ? '...' : '達成'}</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {offers.length > 0 && (
          <>
            <Text style={s.section}>提携オファー（オファーウォール / 動画リワード）</Text>
            {offers.map((o) => {
              const st = offerStatus[o.id];
              const confirmed = st === 'confirmed';
              const pending = st === 'pending';
              return (
                <View key={o.id} style={[s.card, { borderColor: '#d7c9a0', backgroundColor: '#fffdf6' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{o.title}</Text>
                    {o.description && <Text style={s.desc} numberOfLines={2}>{o.description}</Text>}
                    <Text style={s.reward}>＋{o.reward_points} P ・ {o.event_type ?? 'offer'}</Text>
                  </View>
                  {confirmed ? (
                    <View style={[s.badge, s.badgeOk]}><Text style={s.badgeOkText}>✓ 獲得</Text></View>
                  ) : pending ? (
                    <View style={[s.badge, s.badgeWarn]}><Text style={s.badgeWarnText}>確認中</Text></View>
                  ) : (
                    <Pressable style={s.btn} onPress={() => openOffer(o).catch(() => {})}>
                      <Text style={s.btnText}>挑戦</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
            <Text style={s.hint}>※ オファーは外部ネットワークで達成 → postback検証後に「確定」で付与されます。</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  h: { fontSize: 20, fontWeight: '800', color: colors.ink, paddingHorizontal: 16, paddingTop: 6 },
  tabsWrap: { flexGrow: 0 },
  tabs: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { fontSize: 12, fontWeight: '800', color: colors.sub },
  tabTextOn: { color: '#fff' },
  empty: { color: colors.muted, fontSize: 13 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  title: { fontSize: 13, fontWeight: '700', color: colors.ink },
  desc: { fontSize: 12, color: colors.sub, marginTop: 3 },
  reward: { fontSize: 11, color: colors.gold, fontWeight: '800', marginTop: 5 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  progressText: { fontSize: 10, color: colors.muted, fontWeight: '700' },
  btn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  badge: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
  badgeOk: { backgroundColor: colors.okSoft },
  badgeOkText: { color: colors.ok, fontWeight: '800', fontSize: 12 },
  badgeWarn: { backgroundColor: colors.warnSoft },
  badgeWarnText: { color: colors.warn, fontWeight: '800', fontSize: 12 },
  section: { fontSize: 12, fontWeight: '800', color: colors.sub, marginTop: 22, marginBottom: 10 },
  hint: { fontSize: 11, color: colors.muted, marginTop: 8, lineHeight: 16 },
});
