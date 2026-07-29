// 年齢まわりの純粋関数（単体テスト対象）。
// サーバ側でも set_date_of_birth が同じ判定をするので、ここでの検証は UX 用の先出し。

export const MIN_AGE = 13;   // 登録可能な最低年齢（app_config.min_age と揃える）
export const ADULT_AGE = 18; // 成人年齢（app_config.adult_age と揃える）

/** 誕生日をまだ迎えていない年は加算しない、実年齢の計算。 */
export function calcAge(dob: Date, today: Date = new Date()): number {
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

export type DobResult =
  | { ok: true; iso: string; age: number; isMinor: boolean }
  | { ok: false; reason: 'incomplete' | 'invalid' | 'future' | 'too_old' | 'under_min_age' };

/**
 * 年/月/日の入力を検証して ISO 文字列にする。
 * 「2月31日」のような存在しない日付は Date が繰り上げてしまうため、
 * 生成後に年月日が一致するかを確認して弾く。
 */
export function parseDob(
  year: string,
  month: string,
  day: string,
  today: Date = new Date(),
): DobResult {
  if (year.trim() === '' || month.trim() === '' || day.trim() === '') {
    return { ok: false, reason: 'incomplete' };
  }
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return { ok: false, reason: 'invalid' };
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false, reason: 'invalid' };

  const dob = new Date(y, m - 1, d);
  // 繰り上がり検出（例: 2/31 → 3/3）
  if (dob.getFullYear() !== y || dob.getMonth() !== m - 1 || dob.getDate() !== d) {
    return { ok: false, reason: 'invalid' };
  }
  if (dob.getTime() > today.getTime()) return { ok: false, reason: 'future' };
  if (y < today.getFullYear() - 120) return { ok: false, reason: 'too_old' };

  const age = calcAge(dob, today);
  if (age < MIN_AGE) return { ok: false, reason: 'under_min_age' };

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    ok: true,
    iso: `${y}-${pad(m)}-${pad(d)}`,
    age,
    isMinor: age < ADULT_AGE,
  };
}

export const DOB_ERROR_MESSAGE: Record<Exclude<DobResult, { ok: true }>['reason'], string> = {
  incomplete: '生年月日を入力してください',
  invalid: '生年月日が正しくありません',
  future: '生年月日が未来の日付になっています',
  too_old: '生年月日が正しくありません',
  under_min_age: `${MIN_AGE}歳未満の方はご登録いただけません`,
};
