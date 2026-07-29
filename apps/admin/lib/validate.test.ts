import { describe, it, expect } from 'vitest';
import { assertUuid, assertEnum, assertSlug } from '@/lib/validate';

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

describe('assertSlug', () => {
  it('英小文字・数字・ハイフンの slug を通す', () => {
    expect(assertSlug('eldia')).toBe('eldia');
    expect(assertSlug('puzzle-kingdom')).toBe('puzzle-kingdom');
    expect(assertSlug('game2')).toBe('game2');
  });

  it('大文字は小文字化し、前後の空白を落とす', () => {
    expect(assertSlug('  Eldia  ')).toBe('eldia');
  });

  it('先頭・末尾のハイフンを拒否する（URL とフォーラム slug に埋まるため）', () => {
    expect(() => assertSlug('-eldia')).toThrow();
    expect(() => assertSlug('eldia-')).toThrow();
  });

  it('連続ハイフンを拒否する', () => {
    expect(() => assertSlug('foo--bar')).toThrow();
  });

  it('記号・空白・日本語を拒否する', () => {
    expect(() => assertSlug('foo bar')).toThrow();
    expect(() => assertSlug('foo/bar')).toThrow();
    expect(() => assertSlug('foo_bar')).toThrow();
    expect(() => assertSlug('エルディア')).toThrow();
  });

  it('短すぎる/長すぎる slug を拒否する', () => {
    expect(() => assertSlug('a')).toThrow();
    expect(() => assertSlug('a'.repeat(60))).toThrow();
  });

  it('文字列でない入力を拒否する', () => {
    expect(() => assertSlug(null)).toThrow();
    expect(() => assertSlug(123)).toThrow();
  });
});
