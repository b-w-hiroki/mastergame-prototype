import { resolveNotification, relativeTime, formatDate } from '@/lib/notifications';
import type { AppNotification } from '@mastergame/shared';

const n = (type: string, payload: Record<string, unknown> = {}): AppNotification => ({
  id: 'n1', type, payload, read_at: null, created_at: '2026-08-01T00:00:00Z',
});

describe('resolveNotification', () => {
  it('運営回答はスレッドへ飛ぶ', () => {
    const v = resolveNotification(n('inquiry_answered', { inquiry_id: 'i1', subject: 'ポイント未反映' }));
    expect(v.href).toBe('/support/i1');
    expect(v.body).toBe('ポイント未反映');
  });

  it('運営回答で inquiry_id が無ければ一覧へフォールバック', () => {
    const v = resolveNotification(n('inquiry_answered', { subject: 'x' }));
    expect(v.href).toBe('/support');
  });

  it('失効予告は金額と期日を文言化し、交換へ誘導する', () => {
    const v = resolveNotification(n('point_expiry_notice', { balance: 5000, expires_on: '2026-09-01' }));
    expect(v.body).toContain('5,000 P');
    expect(v.body).toContain('2026年9月1日');
    expect(v.href).toBe('/exchange');
  });

  it('失効予告で payload が欠けていても汎用文言で成立する', () => {
    const v = resolveNotification(n('point_expiry_notice', {}));
    expect(v.body).toBe('保有ポイントの有効期限が近づいています。');
    expect(v.href).toBe('/exchange');
  });

  it('失効済みはポイント画面へ', () => {
    const v = resolveNotification(n('point_expired', { points: 1200 }));
    expect(v.body).toContain('1,200 P');
    expect(v.href).toBe('/points');
  });

  it('返信・ベストアンサー・リアクションはトピックへ飛ぶ', () => {
    expect(resolveNotification(n('reply', { topic_id: 't1' })).href).toBe('/topic/t1');
    expect(resolveNotification(n('best_answer', { topic_id: 't2', amount: 500 })).href).toBe('/topic/t2');
    expect(resolveNotification(n('reaction', { topic_id: 't3' })).href).toBe('/topic/t3');
  });

  it('topic_id が無い返信は遷移先なし（開いて既読化のみ）', () => {
    expect(resolveNotification(n('reply', {})).href).toBeNull();
  });

  it('未知の type でも壊れず、payload の title/body/href を尊重する', () => {
    const v = resolveNotification(n('future_type', { title: '新機能', body: '詳細', href: '/games' }));
    expect(v.title).toBe('新機能');
    expect(v.body).toBe('詳細');
    expect(v.href).toBe('/games');
  });

  it('未知の type で payload が空なら汎用のお知らせ表示', () => {
    const v = resolveNotification(n('mystery', {}));
    expect(v.title).toBe('お知らせ');
    expect(v.href).toBeNull();
  });

  it('payload が null でも落ちない', () => {
    const v = resolveNotification({ ...n('reply'), payload: null as never });
    expect(v.href).toBeNull();
  });

  it('数値であるべき欄に文字列が来ても落ちない（サーバ側の型ゆらぎ耐性）', () => {
    const v = resolveNotification(n('point_expiry_notice', { balance: '5000', expires_on: '2026-09-01' }));
    expect(v.body).toBe('保有ポイントの有効期限が近づいています。');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  it.each([
    ['2026-08-10T11:59:40Z', 'たった今'],
    ['2026-08-10T11:30:00Z', '30分前'],
    ['2026-08-10T09:00:00Z', '3時間前'],
    ['2026-08-08T12:00:00Z', '2日前'],
  ])('%s → %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });

  it('30日以上前は日付表示に切り替わる', () => {
    expect(relativeTime('2026-06-01T00:00:00Z', now)).toBe('6/1');
  });

  it('不正な日付は空文字（画面を壊さない）', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});

describe('formatDate', () => {
  it('ISO 日付を日本語表記にする', () => {
    expect(formatDate('2026-09-01')).toBe('2026年9月1日');
  });
  it('パースできない入力はそのまま返す', () => {
    expect(formatDate('???')).toBe('???');
  });
});
