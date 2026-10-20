import { assertEnum, optionalInteger } from './validate';

const INT32_MAX = 2_147_483_647;

function requiredInteger(value: unknown, field: string): number {
  const parsed = optionalInteger(value, field, 1, INT32_MAX);
  if (parsed === null) throw new Error(`${field} required`);
  return parsed;
}

/** datetime-localの表示・解釈を日本時間に固定。サーバーのTZには依存しない。 */
export function toJapanInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function parseJapanDateTime(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error(`invalid ${field}`);
  const raw = value.trim();
  if (raw === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new Error(`invalid ${field}`);
  const date = new Date(`${raw}:00+09:00`);
  if (Number.isNaN(date.getTime()) || toJapanInput(date.toISOString()) !== raw) throw new Error(`invalid ${field}`);
  return date.toISOString();
}

export function readItemForm(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  if (!name) throw new Error('name required');
  return {
    name,
    description: String(form.get('description') ?? '').trim() || null,
    cost_points: requiredInteger(form.get('cost_points'), 'cost_points'),
    delivery_method: assertEnum(form.get('delivery_method'), ['csv', 'code', 'api'] as const, 'delivery_method'),
    stock: optionalInteger(form.get('stock'), 'stock', 0, INT32_MAX),
    sort: optionalInteger(form.get('sort'), 'sort', -2_147_483_648, INT32_MAX) ?? 0,
    is_active: form.get('is_active') === 'on',
  };
}

export function readMissionForm(form: FormData) {
  const title = String(form.get('title') ?? '').trim();
  if (!title || title.length > 120) throw new Error('title must be 1–120 characters');
  const startsAt = parseJapanDateTime(form.get('starts_at'), 'starts_at');
  const endsAt = parseJapanDateTime(form.get('ends_at'), 'ends_at');
  if (startsAt && endsAt && endsAt <= startsAt) throw new Error('ends_at must be after starts_at');
  return {
    type: assertEnum(form.get('type'), ['daily', 'weekly', 'achievement', 'event', 'offer'] as const, 'type'),
    title,
    description: String(form.get('description') ?? '').trim() || null,
    reward_points: requiredInteger(form.get('reward_points'), 'reward_points'),
    max_progress: optionalInteger(form.get('max_progress'), 'max_progress', 1, INT32_MAX) ?? 1,
    requires_verification: form.get('requires_verification') === 'on',
    is_active: form.get('is_active') === 'on',
    starts_at: startsAt,
    ends_at: endsAt,
  };
}
