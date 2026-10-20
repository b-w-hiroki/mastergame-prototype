import { describe, expect, it } from 'vitest';
import { readItemForm, readMissionForm, parseJapanDateTime, toJapanInput } from './master-data';
import { optionalInteger } from './validate';

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values = { name: ' ギフト ', cost_points: '1000', delivery_method: 'code', stock: '', sort: '',
    type: 'daily', title: ' ミッション ', reward_points: '100', max_progress: '', is_active: 'on', ...overrides };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('strict integer input', () => {
  it.each([null, undefined, '', '   '])('空欄のみを未指定とする: %s', (value) => {
    expect(optionalInteger(value, 'field')).toBeNull();
  });
  it.each(['1.5', '1e3', '0x10', 'Infinity', 'NaN', 'null', '9007199254740992', {}, 1])('不正値をnullや丸めた整数へ変換しない: %s', (value) => {
    expect(() => optionalInteger(value, 'field')).toThrow('field');
  });
  it('前後空白・符号と明示した範囲を扱う', () => {
    expect(optionalInteger(' 42 ', 'field')).toBe(42);
    expect(optionalInteger('-1', 'sort')).toBe(-1);
    expect(() => optionalInteger('-1', 'stock', 0)).toThrow('stock');
  });
});

describe('item payload', () => {
  it('空欄の在庫だけを無制限とし、並び順の既定値を使う', () => {
    expect(readItemForm(form())).toMatchObject({ name: 'ギフト', stock: null, cost_points: 1000, sort: 0 });
  });
  it('在庫ゼロと負の並び順はそのまま保存する', () => {
    expect(readItemForm(form({ stock: '0', sort: '-2' }))).toMatchObject({ stock: 0, sort: -2 });
  });
  it.each(['abc', '1.5', '-1', 'Infinity', '2147483648'])('不正な在庫を無制限にしない: %s', (stock) => {
    expect(() => readItemForm(form({ stock }))).toThrow('stock');
  });
  it.each(['', '0', '-1', '1.5', '2147483648'])('必要ポイントは正のDB整数だけ: %s', (cost_points) => {
    expect(() => readItemForm(form({ cost_points }))).toThrow('cost_points');
  });
  it('不正な並び順を0へ補完しない', () => {
    expect(() => readItemForm(form({ sort: 'abc' }))).toThrow('sort');
  });
});

describe('mission payload', () => {
  it('進捗の空欄だけを既定値1とする', () => {
    expect(readMissionForm(form())).toMatchObject({ title: 'ミッション', max_progress: 1, reward_points: 100, starts_at: null, ends_at: null });
  });
  it.each(['0', '-1', 'abc', '1.5', 'Infinity', '2147483648'])('不正な進捗上限を1へ補正しない: %s', (max_progress) => {
    expect(() => readMissionForm(form({ max_progress }))).toThrow('max_progress');
  });
  it.each(['', '0', '-1', '1.5', '2147483648'])('報酬は正のDB整数だけ: %s', (reward_points) => {
    expect(() => readMissionForm(form({ reward_points }))).toThrow('reward_points');
  });
  it('開始より前または同時の終了日時を拒否する', () => {
    for (const ends_at of ['2026-10-18T23:59', '2026-10-19T00:00']) {
      expect(() => readMissionForm(form({ starts_at: '2026-10-19T00:00', ends_at }))).toThrow('ends_at');
    }
  });
  it('日本時間の期間をUTCへ変換して保存する', () => {
    expect(readMissionForm(form({ starts_at: '2026-10-19T09:00', ends_at: '2026-10-19T10:00' })))
      .toMatchObject({ starts_at: '2026-10-19T00:00:00.000Z', ends_at: '2026-10-19T01:00:00.000Z' });
  });
});

describe('Japan datetime', () => {
  it('日本時間を常に同じUTCへ変換する', () => {
    expect(parseJapanDateTime('2026-01-01T00:00', 'date')).toBe('2025-12-31T15:00:00.000Z');
    expect(toJapanInput('2025-12-31T15:00:00.000Z')).toBe('2026-01-01T00:00');
  });
  it.each(['2026-02-30T12:00', '2026-13-01T12:00', '2026-01-01T25:00', '2026-01-01T12:60', 'not-a-date', '2026-01-01T00:00Z'])('無効な日時を丸めない: %s', (value) => {
    expect(() => parseJapanDateTime(value, 'starts_at')).toThrow('starts_at');
  });
  it('空欄はnull、不正な表示元は空表示へフォールバック', () => {
    expect(parseJapanDateTime('', 'date')).toBeNull();
    expect(toJapanInput(null)).toBe('');
    expect(toJapanInput('invalid')).toBe('');
  });
});
