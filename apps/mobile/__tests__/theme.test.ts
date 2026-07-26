import { pointsToYen } from '@/lib/theme';

describe('pointsToYen', () => {
  it('converts at 1,000P = 1円 (floored)', () => {
    expect(pointsToYen(1000)).toBe(1);
    expect(pointsToYen(500000)).toBe(500);
    expect(pointsToYen(1999)).toBe(1); // 端数は切り捨て
    expect(pointsToYen(0)).toBe(0);
  });
});
