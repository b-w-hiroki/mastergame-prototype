import type { AppNotification } from '@/lib/types';

/** 通知を個人画面へ渡す前に、所有者と表示に必要な項目を確認する。 */
export function isNotificationRow(value: unknown, userId: string): value is AppNotification {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && row.id.length > 0
    && row.user_id === userId
    && typeof row.type === 'string' && row.type.trim().length > 0
    && !!row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
    && (row.read_at === null || (typeof row.read_at === 'string' && Number.isFinite(Date.parse(row.read_at))));
}
