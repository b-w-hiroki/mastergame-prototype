import type { Mission, NudgeTarget } from './types';
import type { StreakState } from '../components/StreakCard';

export function isStreakState(value: unknown): value is StreakState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const nonNegativeInteger = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  return nonNegativeInteger(row.current_streak) && nonNegativeInteger(row.longest_streak)
    && typeof row.claimed_today === 'boolean' && typeof row.broken === 'boolean'
    && nonNegativeInteger(row.next_reward)
    && typeof row.max_day_index === 'number' && Number.isSafeInteger(row.max_day_index)
    && row.max_day_index >= 1 && row.max_day_index <= 366
    && typeof row.next_day_index === 'number' && Number.isSafeInteger(row.next_day_index)
    && row.next_day_index >= 1 && row.next_day_index <= row.max_day_index
    && (!row.claimed_today || (typeof row.current_streak === 'number' && row.current_streak >= 1));
}

export function isDailyMission(value: unknown): value is Mission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length > 0
    && row.type === 'daily' && row.is_active === true
    && typeof row.title === 'string' && row.title.trim().length > 0
    && typeof row.reward_points === 'number' && Number.isSafeInteger(row.reward_points) && row.reward_points > 0
    && typeof row.requires_verification === 'boolean'
    && (row.icon === null || row.icon === undefined || typeof row.icon === 'string');
}

export function isNudgeTarget(value: unknown): value is NudgeTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.none_available === true) return row.all_affordable === undefined && row.item_id === undefined;
  if (row.all_affordable === true) return row.none_available === undefined && row.item_id === undefined;
  return typeof row.item_id === 'string' && row.item_id.length > 0
    && typeof row.item_name === 'string' && row.item_name.trim().length > 0
    && typeof row.gap === 'number' && Number.isSafeInteger(row.gap) && row.gap > 0
    && typeof row.cost === 'number' && Number.isSafeInteger(row.cost) && row.cost > 0
    && row.gap <= row.cost && row.all_affordable === undefined && row.none_available === undefined;
}
