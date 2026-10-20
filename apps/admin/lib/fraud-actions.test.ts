import { describe, expect, it } from 'vitest';
import { assertFraudResult } from './fraud-actions';

describe('fraud action result', () => {
  it('選択した対応が実行された場合だけ成功とする', () => {
    expect(() => assertFraudResult({ status: 'resolved', action: 'freeze' }, 'freeze')).not.toThrow();
    expect(() => assertFraudResult({ status: 'resolved', action: 'ban' }, 'freeze')).toThrow();
  });

  it('他担当者による解決済みや空応答を成功にしない', () => {
    expect(() => assertFraudResult({ status: 'duplicate', reason: 'already_resolved' }, 'ban')).toThrow();
    expect(() => assertFraudResult(null, 'dismiss')).toThrow();
  });
});
