import { tierProgress, type Tier } from '@/lib/vip';

const TIERS: Tier[] = [
  { name: 'ブロンズ', min_xp: 0 },
  { name: 'シルバー', min_xp: 3000 },
  { name: 'ゴールド', min_xp: 10000 },
];

describe('tierProgress', () => {
  it('at the very bottom → current is first tier, ratio 0', () => {
    const p = tierProgress(0, TIERS);
    expect(p.current?.name).toBe('ブロンズ');
    expect(p.next?.name).toBe('シルバー');
    expect(p.ratio).toBe(0);
    expect(p.toNext).toBe(3000);
  });

  it('midway between tiers → correct ratio and remaining', () => {
    const p = tierProgress(1500, TIERS); // halfway 0→3000
    expect(p.current?.name).toBe('ブロンズ');
    expect(p.ratio).toBeCloseTo(0.5, 5);
    expect(p.toNext).toBe(1500);
  });

  it('at or above the top tier → ratio 1, next null', () => {
    const p = tierProgress(50000, TIERS);
    expect(p.current?.name).toBe('ゴールド');
    expect(p.next).toBeNull();
    expect(p.ratio).toBe(1);
    expect(p.toNext).toBe(0);
  });

  it('exactly at a tier boundary → that tier becomes current', () => {
    const p = tierProgress(3000, TIERS);
    expect(p.current?.name).toBe('シルバー');
    expect(p.ratio).toBe(0);
  });

  it('handles unsorted input', () => {
    const p = tierProgress(1500, [...TIERS].reverse());
    expect(p.current?.name).toBe('ブロンズ');
    expect(p.ratio).toBeCloseTo(0.5, 5);
  });

  it('empty tiers → safe defaults', () => {
    const p = tierProgress(100, []);
    expect(p.current).toBeNull();
    expect(p.ratio).toBe(1);
  });
});
