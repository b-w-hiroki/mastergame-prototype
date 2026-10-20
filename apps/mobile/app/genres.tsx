import { useContext, useEffect, useState } from 'react';
import { OnboardingCompletedContext } from '@/lib/onboarding';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { AppAlert as Alert } from '@/components/AppAlert';
import { useAction } from '@/lib/useAction';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { GENRES } from '@/lib/types';
import type { Genre } from '@/lib/types';

/**
 * 好きなジャンル選択（パーソナライズ）。user_genres に保存。
 * 初回オンボーディング後、およびマイページからの編集の両方で使用。
 */
export default function Genres() {
  const completeOnboarding = useContext(OnboardingCompletedContext);
  const [selected, setSelected] = useState<Set<Genre>>(new Set());
  const { busy, run } = useAction();
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setLoadError(false);
    setSelected(new Set());
    try {
      const { data: u, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!u.user) throw new Error('not authenticated');
      const { data, error } = await supabase.from('user_genres').select('genre').eq('user_id', u.user.id);
      if (error) throw error;
      const allowed = new Set<Genre>(GENRES.map((genre) => genre.key));
      if (!Array.isArray(data) || !data.every((row) => row && typeof row === 'object'
        && typeof row.genre === 'string' && allowed.has(row.genre as Genre))) {
        throw new Error('Invalid genre settings');
      }
      setSelected(new Set(data.map((row) => row.genre as Genre)));
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function toggle(g: Genre) {
    if (busy || loading || loadError) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  async function save() {
    if (loading || busy) return;
    if (loadError) { Alert.alert('再読み込みが必要です', '現在の設定を取得できませんでした。画面を開き直してください。'); return; }
    if (selected.size === 0) { Alert.alert('1つ以上選んでください'); return; }
    await run(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { Alert.alert('ログインが必要です'); return; }
    // 先に選択分を upsert → 選択外を削除。順序を保つことで「一瞬0件」になる窓を無くす
    // （0件だとオンボーディング未完了に巻き戻るため）。
    const uid = u.user.id;
    const rows = [...selected].map((genre) => ({ user_id: uid, genre }));
    const { error: upsertErr } = await supabase
      .from('user_genres')
      .upsert(rows, { onConflict: 'user_id,genre', ignoreDuplicates: true });
    if (upsertErr) { Alert.alert('保存できませんでした', upsertErr.message); return; }
    const { error: delErr } = await supabase
      .from('user_genres')
      .delete()
      .eq('user_id', uid)
      .not('genre', 'in', `(${[...selected].join(',')})`);
    if (delErr) { Alert.alert('保存できませんでした', delErr.message); return; }
    completeOnboarding();
    router.replace('/');
    }, 'ジャンルを保存できませんでした');
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 12 }}>
        <Text style={s.title}>好きなジャンルは？</Text>
        <Text style={s.sub}>あなたに合ったミッションやゲームをおすすめします（複数選択可）</Text>
        {loading && <Text>設定を読み込んでいます...</Text>}
        {loadError && <>
          <Text accessibilityRole="alert">設定を取得できませんでした。</Text>
          <Pressable accessibilityRole="button" onPress={() => { void load(); }}><Text>再読み込み</Text></Pressable>
        </>}
        {!loadError && !loading && <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void load(); }}>
          <Text>設定を再読み込み</Text>
        </Pressable>}
        <View style={s.grid}>
          {GENRES.map((g) => {
            const on = selected.has(g.key);
            return (
              <Pressable key={g.key} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: busy || loading || loadError }} disabled={busy || loading || loadError} style={[s.cell, on && s.cellOn]} onPress={() => toggle(g.key)}>
                <Text style={s.cellEmoji}>{g.emoji}</Text>
                <Text style={[s.cellLabel, on && s.cellLabelOn]}>{g.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Pressable accessibilityRole="button" style={[s.btn, (busy || loading || loadError) && { opacity: 0.6 }]} disabled={busy || loading || loadError} onPress={save}>
          <Text style={s.btnText}>{busy ? '保存中...' : `決定（${selected.size}）`}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '900', color: colors.ink, marginTop: 12 },
  sub: { fontSize: 13, color: colors.sub, marginTop: 8, marginBottom: 22, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '47%', backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.line, borderRadius: 16, paddingVertical: 22, alignItems: 'center' },
  cellOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cellEmoji: { fontSize: 30 },
  cellLabel: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 8 },
  cellLabelOn: { color: colors.accent },
  footer: { padding: 24, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  btn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
