import { calcAge, parseDob, MIN_AGE, ADULT_AGE } from '@/lib/age';

// 判定を日付依存にしないよう、基準日を固定する
const TODAY = new Date(2026, 6, 29); // 2026-07-29

describe('calcAge', () => {
  it('誕生日を迎えた後は満年齢', () => {
    expect(calcAge(new Date(2000, 0, 1), TODAY)).toBe(26);
  });

  it('誕生日をまだ迎えていない年は1つ引く', () => {
    expect(calcAge(new Date(2000, 11, 31), TODAY)).toBe(25);
  });

  it('誕生日当日は加算する', () => {
    expect(calcAge(new Date(2000, 6, 29), TODAY)).toBe(26);
  });

  it('誕生日の前日はまだ加算しない', () => {
    expect(calcAge(new Date(2000, 6, 30), TODAY)).toBe(25);
  });
});

describe('parseDob', () => {
  it('正しい入力を ISO 文字列にする（ゼロ埋めつき）', () => {
    const r = parseDob('2000', '1', '5', TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.iso).toBe('2000-01-05');
      expect(r.age).toBe(26);
      expect(r.isMinor).toBe(false);
    }
  });

  it('未入力は incomplete', () => {
    expect(parseDob('', '1', '1', TODAY)).toMatchObject({ ok: false, reason: 'incomplete' });
    expect(parseDob('2000', '', '1', TODAY)).toMatchObject({ ok: false, reason: 'incomplete' });
  });

  it('存在しない日付（2/31）を弾く — Date の繰り上がりを見逃さない', () => {
    expect(parseDob('2000', '2', '31', TODAY)).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('うるう日は年によって可否が変わる', () => {
    expect(parseDob('2000', '2', '29', TODAY).ok).toBe(true);   // 2000 はうるう年
    expect(parseDob('2001', '2', '29', TODAY)).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('範囲外の月日を弾く', () => {
    expect(parseDob('2000', '13', '1', TODAY)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseDob('2000', '0', '1', TODAY)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseDob('2000', '1', '32', TODAY)).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('数値でない入力を弾く', () => {
    expect(parseDob('abcd', '1', '1', TODAY)).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('未来の日付を弾く', () => {
    expect(parseDob('2030', '1', '1', TODAY)).toMatchObject({ ok: false, reason: 'future' });
  });

  it('あり得ない古さを弾く', () => {
    expect(parseDob('1800', '1', '1', TODAY)).toMatchObject({ ok: false, reason: 'too_old' });
  });

  it(`${MIN_AGE}歳未満は登録できない`, () => {
    const y = TODAY.getFullYear() - MIN_AGE + 1; // 12歳
    expect(parseDob(String(y), '1', '1', TODAY)).toMatchObject({ ok: false, reason: 'under_min_age' });
  });

  it(`ちょうど${MIN_AGE}歳は登録できる`, () => {
    const r = parseDob(String(TODAY.getFullYear() - MIN_AGE), '1', '1', TODAY);
    expect(r.ok).toBe(true);
  });

  it(`${MIN_AGE}歳以上${ADULT_AGE}歳未満は未成年として扱う`, () => {
    const r = parseDob(String(TODAY.getFullYear() - 15), '1', '1', TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isMinor).toBe(true);
  });

  it(`ちょうど${ADULT_AGE}歳は未成年ではない`, () => {
    const r = parseDob(String(TODAY.getFullYear() - ADULT_AGE), '1', '1', TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isMinor).toBe(false);
  });
});
