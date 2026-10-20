import type { Mission, MissionCompletion, Offer } from './types';

const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const nonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const textOrEmpty = (value: unknown) => value == null || typeof value === 'string';

export function isMissionRow(value: unknown): value is Mission {
  if (!row(value)) return false;
  return id(value.id) && ['daily', 'weekly', 'achievement', 'event', 'offer'].includes(String(value.type))
    && value.is_active === true && typeof value.title === 'string' && value.title.trim().length > 0
    && positive(value.reward_points) && positive(value.max_progress)
    && typeof value.requires_verification === 'boolean'
    && textOrEmpty(value.description) && textOrEmpty(value.icon);
}

export function isMissionCompletionRow(value: unknown, userId: string): value is MissionCompletion {
  if (!row(value)) return false;
  return value.user_id === userId && id(value.mission_id)
    && ['pending', 'confirmed', 'rejected', 'reversed'].includes(String(value.status))
    && nonNegative(value.progress) && id(value.period_key);
}

export function isOfferRow(value: unknown): value is Offer {
  if (!row(value)) return false;
  return id(value.id) && id(value.network_id) && value.status === 'active'
    && typeof value.title === 'string' && value.title.trim().length > 0
    && positive(value.reward_points) && textOrEmpty(value.description)
    && textOrEmpty(value.event_type) && textOrEmpty(value.offer_url);
}

export function isOfferCompletionRow(value: unknown, userId: string): value is { offer_id: string | null; status: string } {
  if (!row(value)) return false;
  return value.user_id === userId && (value.offer_id === null || id(value.offer_id))
    && ['pending', 'confirmed', 'rejected', 'reversed'].includes(String(value.status));
}

/** 順序依存の上書きで別の表示・操作状態にならないよう、キーの衝突を拒否する。 */
export function hasUniqueKeys<T>(values: T[], keyOf: (value: T) => string): boolean {
  const keys = new Set(values.map(keyOf));
  return keys.size === values.length;
}

/** 複数の postback があるオファーは確定を優先し、返却順でバッジを変えない。 */
export function offerCompletionStatus(statuses: string[]): string | undefined {
  if (statuses.includes('confirmed')) return 'confirmed';
  if (statuses.includes('pending')) return 'pending';
  return undefined;
}
