import { describe, expect, it } from 'vitest';
import { assertExchangeResult, fulfillmentCode } from './exchange-actions';

describe('exchange administration validation', () => {
  it('コード配布は空欄を拒否する', () => {
    expect(() => fulfillmentCode('   ', 'code')).toThrow('code required');
    expect(fulfillmentCode('  GIFT-123  ', 'code')).toBe('GIFT-123');
  });

  it('他の配布方法は空欄を許し、未知の方法は拒否する', () => {
    expect(fulfillmentCode('', 'api')).toBeNull();
    expect(fulfillmentCode(' ', 'csv')).toBeNull();
    expect(() => fulfillmentCode('', 'unknown')).toThrow('invalid delivery method');
  });

  it('ファイル入力や長すぎるコードを拒否する', () => {
    expect(() => fulfillmentCode(null, 'code')).toThrow('invalid code');
    expect(() => fulfillmentCode('x'.repeat(65), 'code')).toThrow('code too long');
  });

  it('RPCの明示的成功以外を失敗扱いにする', () => {
    expect(() => assertExchangeResult({ ok: true }, 'fulfill')).not.toThrow();
    expect(() => assertExchangeResult(null, 'fulfill')).toThrow('unknown');
    expect(() => assertExchangeResult({ ok: false, reason: 'not_processing' }, 'cancel')).toThrow('not_processing');
    expect(() => assertExchangeResult({}, 'cancel')).toThrow('unknown');
  });
});
