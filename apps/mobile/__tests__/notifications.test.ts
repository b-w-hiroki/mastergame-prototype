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
    expect(v.href).toBe('/points?section=exchange');
  });

  it('失効予告で payload が欠けていても汎用文言で成立する', () => {
    const v = resolveNotification(n('point_expiry_notice', {}));
    expect(v.body).toBe('保有ポイントの有効期限が近づいています。');
    expect(v.href).toBe('/points?section=exchange');
  });

  it('失効済みはポイント履歴へ', () => {
    const v = resolveNotification(n('point_expired', { points: 1200 }));
    expect(v.body).toContain('1,200 P');
    expect(v.href).toBe('/points?section=history');
  });

  it('コード付き交換の完了通知から交換履歴へ案内する', () => {
    const v = resolveNotification(n('exchange_fulfilled', { request_id: 'r1', has_code: true }));
    expect(v.title).toBe('ポイント交換が完了しました');
    expect(v.body).toContain('受取コード');
    expect(v.href).toBe('/points?section=history&request_id=r1');
  });

  it('コードのない交換完了では受取コードを案内しない', () => {
    const v = resolveNotification(n('exchange_fulfilled', { request_id: 'r1', has_code: false }));
    expect(v.body).not.toContain('受取コード');
    expect(v.href).toBe('/points?section=history&request_id=r1');
  });

  it('交換取消は返還されたポイントを表示する', () => {
    const v = resolveNotification(n('exchange_cancelled', { request_id: 'r1', refunded: 50000, reason: 'admin_cancel' }));
    expect(v.title).toBe('ポイント交換が取り消されました');
    expect(v.body).toContain('50,000 P が返還');
    expect(v.body).not.toContain('admin_cancel');
    expect(v.href).toBe('/points?section=history&request_id=r1');
  });

  it('申請IDをURLの別パラメータとして解釈させない', () => {
    const v = resolveNotification(n('exchange_fulfilled', { request_id: 'r1&section=exchange' }));
    expect(v.href).toBe('/points?section=history&request_id=r1%26section%3Dexchange');
  });

  it.each(['exchange_fulfilled', 'exchange_cancelled'])('交換通知 %s は空のpayloadでも履歴へ案内する', (type) => {
    const v = resolveNotification(n(type));
    expect(v.title).not.toBe('お知らせ');
    expect(v.href).toBe('/points?section=history');
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
  it.each(['https://example.test', '//example.test', '/\\example.test', 'javascript:alert(1)', '/points\n', '/topic/../../login', '/%2f%2fexample.test', '/login', '/missing-route'])('未知の通知の危険/未定義リンクを開かない: %s', (href) => {
    expect(resolveNotification(n('future_type', { href })).href).toBeNull();
  });
  it.each(['/games', '/games/eldia', '/points?section=history', '/support/i1', '/legal/terms'])('既知の内部ルートは通知から開ける: %s', (href) => {
    expect(resolveNotification(n('future_type', { href })).href).toBe(href);
  });
  it.each(['../login', 't1?redirect=outside', 'a/b', ''])('不正な詳細IDを別ルートとして解釈しない: %s', (id) => {
    expect(resolveNotification(n('reply', { topic_id: id })).href).toBeNull();
    expect(resolveNotification(n('inquiry_answered', { inquiry_id: id })).href).toBe('/support');
  });
  it.each([-10, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])('不正な報酬を獲得済みとして表示しない: %s', (amount) => {
    expect(resolveNotification(n('best_answer', { amount })).body).toBeNull();
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
  it('日付だけの値をタイムゾーン変換で前日へずらさない', () => {
    expect(formatDate('2026-01-01')).toBe('2026年1月1日');
  });
  it('実在しない日付を翌月の日時に変換しない', () => {
    expect(formatDate('2026-02-30')).toBe('2026-02-30');
  });
});
