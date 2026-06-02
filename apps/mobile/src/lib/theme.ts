// 共通カラーパレット（prototype core-flow.html と整合）
export const colors = {
  bg: '#f4f5f8',
  paper: '#ffffff',
  ink: '#1f2430',
  sub: '#6b7280',
  muted: '#9aa0ac',
  line: '#e4e7ec',
  line2: '#d8dbe2',
  accent: '#4f46e5',
  accentSoft: '#eef0ff',
  gold: '#b88a2e',
  goldSoft: '#f6efda',
  ok: '#179a5b',
  okSoft: '#e6f4ec',
  warn: '#c98a16',
  warnSoft: '#fbf2dc',
  danger: '#c0392b',
};

// ポイント→円換算（1,000P = 1円。app_config.point_yen_rate と整合）
export const pointsToYen = (p: number) => Math.floor(p / 1000);
