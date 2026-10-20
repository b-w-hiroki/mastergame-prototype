import { describe, expect, it } from 'vitest';
import { assertSupportResult, replyBody } from './support-actions';

describe('support administration validation', () => {
  it('返信本文を整え、空欄と不正入力を拒否する', () => {
    expect(replyBody('  返信です  ')).toBe('返信です');
    expect(() => replyBody('  ')).toThrow('body required');
    expect(() => replyBody(null)).toThrow('invalid body');
  });

  it('DBの最大文字数を超える返信を切り捨てずに拒否する', () => {
    expect(replyBody('あ'.repeat(4000))).toHaveLength(4000);
    expect(() => replyBody('あ'.repeat(4001))).toThrow('body too long');
  });

  it('返信・クローズの明示的な成功応答だけを認める', () => {
    expect(() => assertSupportResult({ status: 'ok' }, 'answer_inquiry')).not.toThrow();
    expect(() => assertSupportResult(null, 'answer_inquiry')).toThrow('unexpected response');
    expect(() => assertSupportResult({ status: 'unknown' }, 'close_inquiry')).toThrow('unexpected response');
  });
});
