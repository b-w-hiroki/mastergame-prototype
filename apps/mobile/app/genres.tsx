import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
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
  const [selected, setSelected] = useState<Set<Genre>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from('user_genres').select('genre').eq('user_id', u.user.id);
      setSelected(new Set(((data as { genre: Genre }[]) ?? []).map((x) => x.genre)));
    })();
  }, []);

  function toggle(g: Genre) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  }

  async function save() {
    if (selected.size === 0) { Alert.alert('1つ以上選んでください'); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); return; }
    // 先に選択分を upsert → 選択外を削除。順序を保つことで「一瞬0件」になる窓を無くす
    // （0件だとオンボーディング未完了に巻き戻るため）。
    const uid = u.user.id;
    const rows = [...selected].map((genre) => ({ user_id: uid, genre }));
    const { error: upsertErr } = await supabase
      .from('user_genres')
      .upsert(rows, { onConflict: 'user_id,genre', ignoreDuplicates: true });
    if (upsertErr) { setBusy(false); Alert.alert('保存できませんでした', upsertErr.message); return; }
    const { error: delErr } = await supabase
      .from('user_genres')
      .delete()
      .eq('user_id', uid)
      .not('genre', 'in', `(${[...selected].join(',')})`);
    setBusy(false);
    if (delErr) { Alert.alert('保存できませんでした', delErr.message); return; }
    router.replace('/');
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 12 }}>
        <Text style={s.title}>好きなジャンルは？</Text>
        <Text style={s.sub}>あなたに合ったミッションやゲームをおすすめします（複数選択可）</Text>
        <View style={s.grid}>
          {GENRES.map((g) => {
            const on = selected.has(g.key);
            return (
              <Pressable key={g.key} style={[s.cell, on && s.cellOn]} onPress={() => toggle(g.key)}>
                <Text style={s.cellEmoji}>{g.emoji}</Text>
                <Text style={[s.cellLabel, on && s.cellLabelOn]}>{g.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
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
