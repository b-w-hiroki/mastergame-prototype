type Forum = { id: string; name: string; description: string | null; type: 'public' | 'game' };
type Topic = { id: string; forum_id: string; kind: 'request' | 'question' | 'chat'; title: string; reply_count: number; has_bounty: boolean; last_activity_at: string };
type FeedRow = { topic_id: string; game_name: string; kind: 'request' | 'question' | 'chat'; title: string; reply_count: number; has_bounty: boolean; last_activity_at: string };

const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const kind = (value: unknown) => value === 'request' || value === 'question' || value === 'chat';

export function isForumRow(value: unknown): value is Forum {
  return row(value) && text(value.id) && text(value.name)
    && (value.description === null || typeof value.description === 'string')
    && (value.type === 'public' || value.type === 'game');
}

export function isTopicRow(value: unknown): value is Topic {
  return row(value) && text(value.id) && text(value.forum_id) && kind(value.kind)
    && text(value.title) && count(value.reply_count)
    && typeof value.has_bounty === 'boolean' && date(value.last_activity_at);
}

export function isFeedRow(value: unknown): value is FeedRow {
  return row(value) && text(value.topic_id) && text(value.game_name) && kind(value.kind)
    && text(value.title) && count(value.reply_count)
    && typeof value.has_bounty === 'boolean' && date(value.last_activity_at);
}

export function hasUniqueIds<T>(rows: T[], idOf: (row: T) => string): boolean {
  return new Set(rows.map(idOf)).size === rows.length;
}
