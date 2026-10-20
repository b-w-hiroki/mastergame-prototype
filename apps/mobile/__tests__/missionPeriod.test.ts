import { missionPeriodKey } from '@/lib/missionPeriod';

describe('mission reward periods use the date returned by service_today', () => {
  it('端末の日付に依存せずサーバーの日付をそのまま使う', () => {
    expect(missionPeriodKey('daily', '2026-01-01')).toBe('2026-01-01');
  });

  it.each([
    ['2021-01-01', '2020-W53'],
    ['2021-01-04', '2021-W01'],
    ['2024-12-30', '2025-W01'],
    ['2025-12-29', '2026-W01'],
    ['2026-01-04', '2026-W01'],
    ['2026-01-05', '2026-W02'],
  ])('ISO週の年跨ぎ・月曜日境界: %s → %s', (date, expected) => {
    expect(missionPeriodKey('weekly', date)).toBe(expected);
  });

  it.each(['achievement', 'event'])('一度限りの %s は日付が変わっても同じキーを使う', (type) => {
    expect(missionPeriodKey(type, '2026-01-01')).toBe('once');
    expect(missionPeriodKey(type, '2027-02-02')).toBe('once');
  });

  it.each(['', 'not-a-date', '2026-02-30', '2026-01-01T00:00:00Z'])('不正なサービス日付 %s を端末日付へ置き換えない', (date) => {
    expect(() => missionPeriodKey('daily', date)).toThrow('Invalid service date');
  });
});
