import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { VisualSlot } from '@/components/VisualSlot';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { AppNotification, Mission, NudgeTarget, VipInfo } from '@/lib/types';

const demoMissions: Mission[] = [
  {
    id: 'demo-login',
    type: 'daily',
    title: '今日のログインボーナスを受け取る',
    description: '毎日のチェックインでポイントをためる',
    reward_points: 1000,
    icon: '✓',
    max_progress: 1,
    requires_verification: false,
    ends_at: null,
  },
  {
    id: 'demo-news',
    type: 'daily',
    title: 'ゲームニュースを1本読む',
    description: 'おすすめ記事を読んで報酬を獲得',
    reward_points: 3000,
    icon: 'N',
    max_progress: 1,
    requires_verification: false,
    ends_at: null,
  },
  {
    id: 'demo-offer',
    type: 'daily',
    title: '提携オファーを確認する',
    description: '外部オファーは検証後に確定します',
    reward_points: 12000,
    icon: 'P',
    max_progress: 1,
    requires_verification: true,
    ends_at: null,
  },
];

const demoNews: AppNotification[] = [
  { id: 'n1', type: 'system', payload: { title: '週末限定ミッションが追加されました' }, read_at: null, created_at: '' },
  { id: 'n2', type: 'reply', payload: { title: 'ギルドの質問に返信が届いています' }, read_at: null, created_at: '' },
];

export default function Home() {
  const [balance, setBalance] = useState(125000);
  const [vip, setVip] = useState<VipInfo | null>({ user_id: 'demo', xp: 6400, tier_name: 'シルバー', staking_rate_bps: 150 });
  const [missions, setMissions] = useState<Mission[]>(demoMissions);
  const [nudge, setNudge] = useState<NudgeTarget | null>({
    item_name: '1,500円分のゲームコード',
    gap: 25000,
    cost: 150000,
  });
  const [news, setNews] = useState<AppNotification[]>(demoNews);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const [{ data: wallet }, { data: ms }, { data: n }, { data: v }, { data: nt }] = await Promise.all([
      supabase.from('point_wallets').select('balance').eq('user_id', u.user.id).single(),
      supabase.from('missions').select('*').eq('type', 'daily').eq('is_active', true),
      supabase.rpc('next_nudge_target'),
      supabase.from('user_vip').select('*').eq('user_id', u.user.id).single(),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(3),
    ]);

    if (wallet?.balance != null) setBalance(wallet.balance);
    if (ms?.length) setMissions(ms as Mission[]);
    if (n) setNudge(n as NudgeTarget);
    if (v) setVip(v as VipInfo);
    if (nt?.length) setNews(nt as AppNotification[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function claim(m: Mission) {
    setClaiming(m.id);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || m.id.startsWith('demo-')) {
      setBalance((current) => current + m.reward_points);
      setClaiming(null);
      return;
    }

    const { error } = await supabase.rpc('claim_mission', { p_mission_id: m.id });
    setClaiming(null);
    if (!error) load();
  }

  return (
    <SafeAreaView style={s.root} edges={['top']}>
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
        <View style={s.head}>
          <View>
            <Text style={s.hello}>おかえりなさい</Text>
            <Text style={s.rank}>VIP {vip?.tier_name ?? 'ブロンズ'} ・ 今日も少しずつ前進</Text>
          </View>
          <View style={s.chip}>
            <Text style={s.chipText}>{balance.toLocaleString()} P</Text>
          </View>
        </View>

        <View style={s.hero}>
          <View style={s.heroImage}>
            <VisualSlot tone="hero" />
          </View>
          <View style={s.heroCopy}>
            <Text style={s.heroBadge}>WEEKEND</Text>
            <Text style={s.heroTitle}>週末ブースト開催中</Text>
            <Text style={s.heroText}>ミッション報酬が一部アップ。自然なバナー画像に差し替え予定です。</Text>
          </View>
        </View>

        {nudge?.gap != null && nudge.gap > 0 && (
          <Pressable style={s.nudge} onPress={() => router.push('/exchange')}>
            <View style={s.nudgeIcon}>
              <Text style={s.nudgeIconText}>P</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.nudgeText}>
                あと <Text style={s.gold}>{nudge.gap.toLocaleString()}P</Text> で「{nudge.item_name}」に交換できます
              </Text>
              <Text style={s.nudgeSub}>おすすめミッションから近道できます</Text>
            </View>
            <Text style={s.nudgeGo}>貯める</Text>
          </Pressable>
        )}

        <View style={s.actions}>
          <Pressable style={s.action} onPress={() => router.push('/missions')}>
            <Text style={s.actionIcon}>✓</Text>
            <Text style={s.actionText}>ミッション</Text>
          </Pressable>
          <Pressable style={s.action} onPress={() => router.push('/points')}>
            <Text style={s.actionIcon}>P</Text>
            <Text style={s.actionText}>ポイント</Text>
          </Pressable>
          <Pressable style={s.action} onPress={() => router.push('/community')}>
            <Text style={s.actionIcon}>#</Text>
            <Text style={s.actionText}>ギルド</Text>
          </Pressable>
          <Pressable style={s.action} onPress={() => router.push('/exchange')}>
            <Text style={s.actionIcon}>↗</Text>
            <Text style={s.actionText}>交換</Text>
          </Pressable>
        </View>

        <View style={s.sectionRow}>
          <Text style={s.section}>お知らせ</Text>
          <Text style={s.more}>すべて</Text>
        </View>
        {news.map((item) => (
          <View key={item.id} style={s.newsItem}>
            <View style={s.newsThumb} />
            <View style={{ flex: 1 }}>
              <Text style={s.newsType}>{labelOf(item.type)}</Text>
              <Text style={s.newsBody} numberOfLines={2}>
                {String(item.payload?.message ?? item.payload?.title ?? '新しい通知があります')}
              </Text>
            </View>
          </View>
        ))}

        <View style={s.sectionRow}>
          <Text style={s.section}>デイリーミッション</Text>
          <Text style={s.more} onPress={() => router.push('/missions')}>
            もっと見る
          </Text>
        </View>
        {missions.map((m) => (
          <View key={m.id} style={s.mission}>
            <View style={s.missionIcon}>
              <Text style={s.missionIconText}>{m.icon ?? 'M'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.mTitle}>{m.title}</Text>
              <Text style={s.mReward}>+{m.reward_points.toLocaleString()} P</Text>
            </View>
            <Pressable
              style={[s.claim, claiming === m.id && { opacity: 0.5 }]}
              disabled={claiming === m.id}
              onPress={() => claim(m)}
            >
              <Text style={s.claimText}>{claiming === m.id ? '...' : '受け取る'}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function labelOf(type: string): string {
  const labels: Record<string, string> = {
    reply: '返信',
    best_answer: 'ベストアンサー',
    reaction: 'リアクション',
    report_result: '通報結果',
    system: 'お知らせ',
  };
  return labels[type] ?? 'お知らせ';
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  hello: { fontSize: 19, fontWeight: '800', color: colors.ink },
  rank: { fontSize: 12, fontWeight: '700', color: colors.sub, marginTop: 3 },
  chip: {
    marginLeft: 'auto',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipText: { fontWeight: '900', fontSize: 13, color: colors.gold },
  hero: {
    height: 154,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#202638',
    marginBottom: 14,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#30374d',
    borderWidth: 1,
    borderColor: '#3d455e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1, justifyContent: 'flex-end', padding: 16, backgroundColor: 'rgba(10, 12, 20, 0.28)' },
  heroBadge: { color: '#f1d37a', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 3 },
  heroText: { color: '#d9deef', fontSize: 12, lineHeight: 17, marginTop: 4 },
  nudge: {
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: '#e7d6a6',
    borderRadius: 16,
    padding: 13,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  nudgeIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  nudgeIconText: { color: colors.gold, fontWeight: '900' },
  nudgeText: { color: '#7a5b16', fontWeight: '800', fontSize: 13, lineHeight: 18 },
  nudgeSub: { color: '#9a7e3a', fontSize: 11, marginTop: 2 },
  gold: { color: colors.gold, fontWeight: '900' },
  nudgeGo: { color: '#fff', backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, overflow: 'hidden', fontWeight: '900', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  action: { flex: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  actionIcon: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  actionText: { color: colors.sub, fontWeight: '800', fontSize: 10.5, marginTop: 5 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 9 },
  section: { fontSize: 12, fontWeight: '900', color: colors.sub, letterSpacing: 0.4 },
  more: { marginLeft: 'auto', color: colors.accent, fontWeight: '800', fontSize: 11 },
  newsItem: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 12, marginBottom: 8 },
  newsThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: '#e7e9f2' },
  newsType: { fontSize: 10, fontWeight: '900', color: colors.accent },
  newsBody: { fontSize: 13, color: colors.ink, marginTop: 3, fontWeight: '700' },
  mission: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 13, marginBottom: 10, gap: 12 },
  missionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  missionIconText: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  mTitle: { fontSize: 13, fontWeight: '800', color: colors.ink, lineHeight: 18 },
  mReward: { fontSize: 11, color: colors.gold, fontWeight: '900', marginTop: 3 },
  claim: { backgroundColor: colors.ok, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  claimText: { color: '#fff', fontWeight: '900', fontSize: 12 },
});
