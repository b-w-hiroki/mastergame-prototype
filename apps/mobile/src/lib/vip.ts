// VIP ランク進捗の計算（純粋関数・単体テスト対象）。
export type Tier = { name: string; min_xp: number };

export interface TierProgress {
  current: Tier | null;   // 現在のランク（min_xp 以下で最大）
  next: Tier | null;      // 次のランク（無ければ null＝最高位）
  ratio: number;          // 現ランク内の進捗 0..1（最高位は 1）
  toNext: number;         // 次ランクまでの残り xp（最高位は 0）
}

/** xp と昇順の tiers から現在/次ランクと進捗を求める。tiers は min_xp 昇順を想定。 */
export function tierProgress(xp: number, tiers: Tier[]): TierProgress {
  if (tiers.length === 0) return { current: null, next: null, ratio: 1, toNext: 0 };
  const sorted = [...tiers].sort((a, b) => a.min_xp - b.min_xp);
  const current = [...sorted].reverse().find((t) => xp >= t.min_xp) ?? null;
  const next = sorted.find((t) => t.min_xp > xp) ?? null;
  if (!current || !next) return { current: current ?? sorted[0], next, ratio: 1, toNext: 0 };
  const span = next.min_xp - current.min_xp;
  const ratio = span > 0 ? Math.min(1, Math.max(0, (xp - current.min_xp) / span)) : 1;
  return { current, next, ratio, toNext: Math.max(0, next.min_xp - xp) };
}
