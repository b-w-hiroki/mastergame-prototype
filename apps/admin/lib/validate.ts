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

// URL やフォーラムの slug（game-<slug>）に埋め込まれるため、形式を厳しく固定する。
// 英小文字・数字・ハイフンのみ、先頭末尾は英数字、3〜50文字。
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export function assertSlug(v: unknown, field = 'slug'): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!SLUG_RE.test(s)) throw new Error(`invalid ${field}`);
  // 連続ハイフンは見た目・可読性が悪く、意図しない衝突も生みやすいので弾く
  if (s.includes('--')) throw new Error(`invalid ${field}`);
  return s;
}
