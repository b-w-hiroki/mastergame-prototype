// 入力バリデーション（Next 非依存の純粋関数。単体テスト対象）。
// server action で service_role 書き込み前に使い、不正な id/enum を弾く。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(v: unknown, field = 'id'): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!UUID_RE.test(s)) throw new Error(`invalid ${field}`);
  return s;
}

export function assertEnum<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  const s = typeof v === 'string' ? v : '';
  if (!(allowed as readonly string[]).includes(s)) throw new Error(`invalid ${field}`);
  return s as T;
}
