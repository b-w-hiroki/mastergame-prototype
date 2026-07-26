import { describe, it, expect } from 'vitest';
import { assertUuid, assertEnum } from '@/lib/validate';

const UUID = '11111111-2222-3333-4444-555555555555';

describe('assertUuid', () => {
  it('accepts a valid uuid and trims', () => {
    expect(assertUuid(UUID)).toBe(UUID);
    expect(assertUuid(`  ${UUID}  `)).toBe(UUID);
  });
  it('rejects non-uuid strings', () => {
    expect(() => assertUuid('not-a-uuid')).toThrow('invalid id');
    expect(() => assertUuid('11111111-2222-3333-4444-5555')).toThrow();
    expect(() => assertUuid('')).toThrow();
  });
  it('rejects non-string inputs (null/undefined/number)', () => {
    expect(() => assertUuid(null)).toThrow();
    expect(() => assertUuid(undefined)).toThrow();
    expect(() => assertUuid(123)).toThrow();
  });
  it('uses the field name in the error', () => {
    expect(() => assertUuid('x', 'target_id')).toThrow('invalid target_id');
  });
  it('does NOT coerce the literal string "null"', () => {
    // String(formData.get('id')) の "null" 罠を弾けること
    expect(() => assertUuid('null')).toThrow();
  });
});

describe('assertEnum', () => {
  const actions = ['delete', 'warn', 'dismiss'] as const;
  it('accepts allowed values', () => {
    expect(assertEnum('warn', actions, 'action')).toBe('warn');
  });
  it('rejects values outside the allowlist', () => {
    expect(() => assertEnum('nuke', actions, 'action')).toThrow('invalid action');
    expect(() => assertEnum('', actions, 'action')).toThrow();
    expect(() => assertEnum(undefined, actions, 'action')).toThrow();
  });
});
