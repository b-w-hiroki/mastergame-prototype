import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '@/lib/theme';

export type StreakState = {
  current_streak: number;
  longest_streak: number;
  claimed_today: boolean;
  next_day_index: number;
  next_reward: number;
  max_day_index: number;
  broken: boolean;
};

/**
 * 連続ログインのカード。
 * 「あと何日で大きい報酬か」が一目で分かることが継続の動機になるので、
 * 段階をドットで示し、今日の報酬額を明示する。
 */
export function StreakCard({
  state,
  busy,
  onClaim,
}: {
  state: StreakState;
  busy?: boolean;
  onClaim: () => void;
}) {
  const done = state.claimed_today;
  // 受け取り済みなら現在の連続日数まで、未受け取りなら受け取ると到達する日数まで点灯
  const filled = done ? state.current_streak : state.next_day_index - 1;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>🔥 連続ログイン</Text>
        <Text style={s.count}>
          {done ? `${state.current_streak}日目` : `${state.next_day_index}日目`}
        </Text>
      </View>

      {state.broken && !done && (
        <Text style={s.broken}>連続が途切れました。今日からまた1日目です。</Text>
      )}

      <View style={s.dots}>
        {Array.from({ length: state.max_day_index }, (_, i) => {
          const n = i + 1;
          const isLast = n === state.max_day_index;
          return (
            <View
              key={n}
              style={[
                s.dot,
                n <= filled && s.dotOn,
                isLast && s.dotLast,
                isLast && n <= filled && s.dotLastOn,
              ]}
            >
              <Text style={[s.dotText, n <= filled && s.dotTextOn]}>{isLast ? '★' : n}</Text>
            </View>
          );
        })}
      </View>

      {done ? (
        <Text style={s.doneText}>
          今日は受け取り済みです。
          {state.current_streak < state.max_day_index
            ? `明日で ${state.current_streak + 1}日目。`
            : '明日から新しい1周が始まります。'}
        </Text>
      ) : (
        <Pressable
          style={[s.btn, busy && { opacity: 0.5 }]}
          onPress={onClaim}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`連続ログインボーナス ${state.next_reward}ポイントを受け取る`}
        >
          <Text style={s.btnText}>
            {busy ? '...' : `＋${state.next_reward.toLocaleString()} P を受け取る`}
          </Text>
        </Pressable>
      )}

      {state.longest_streak > 1 && (
        <Text style={s.best}>最長記録 {state.longest_streak}日</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line,
    borderRadius: 16, padding: 16, marginTop: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '900', color: colors.ink },
  count: { fontSize: 13, fontWeight: '800', color: colors.accent },
  broken: { fontSize: 11.5, color: colors.warn, fontWeight: '700', marginTop: 8 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 14 },
  dot: {
    flex: 1, height: 30, borderRadius: 8, backgroundColor: '#eceef4',
    alignItems: 'center', justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.accent },
  dotLast: { backgroundColor: colors.goldSoft },
  dotLastOn: { backgroundColor: colors.gold },
  dotText: { fontSize: 11, fontWeight: '800', color: colors.muted },
  dotTextOn: { color: '#fff' },
  btn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  doneText: { fontSize: 12, color: colors.sub, lineHeight: 18 },
  best: { fontSize: 11, color: colors.muted, fontWeight: '700', marginTop: 10, textAlign: 'right' },
});
