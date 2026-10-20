import { fireEvent, render, screen } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

const mockData: Record<string, unknown> = {};
const mockErrors: Record<string, unknown> = {};
const mockGetUser = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  rpc: async () => ({ data: mockData.feed, error: mockErrors.feed ?? null }),
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'limit']) query[method] = () => query;
    query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: mockData[table], error: mockErrors[table] ?? null }).then(resolve);
    return query;
  },
} }));

import Community from '../app/(tabs)/community';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  for (const key of Object.keys(mockErrors)) delete mockErrors[key];
  mockData.forums = [{ id: 'f1', name: '公開ギルド', description: null, type: 'public' }];
  mockData.topics = [{ id: 't1', forum_id: 'f1', kind: 'question', title: '攻略相談',
    reply_count: 1, has_bounty: false, last_activity_at: '2026-10-18T00:00:00Z' }];
  mockData.feed = [{ topic_id: 't2', game_name: 'エルディア戦記', kind: 'chat', title: '今日の話題',
    reply_count: 0, has_bounty: false, last_activity_at: '2026-10-18T00:00:00Z' }];
});

it('取得中にアカウントが変われば旧ユーザーのフィードを表示しない', async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null })
    .mockResolvedValueOnce({ data: { user: { id: 'u2' } }, error: null });
  render(<Community />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('今日の話題')).toBeNull();
  expect(screen.queryByText('攻略相談')).toBeNull();
});

it.each([
  ['forums', [{ id: 'f1', name: '', description: null, type: 'public' }]],
  ['topics', [{ id: 't1', forum_id: 'f1', kind: 'question', title: '攻略相談', reply_count: -1, has_bounty: false, last_activity_at: '2026-10-18T00:00:00Z' }]],
  ['feed', [{ topic_id: 't2', game_name: 'エルディア戦記', kind: 'chat', title: '今日の話題', reply_count: 0, has_bounty: false, last_activity_at: 'invalid' }]],
])('%s の不正な行を投稿導線に渡さない', async (source, rows) => {
  mockData[source] = rows;
  render(<Community />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('今日の話題')).toBeNull();
  expect(screen.queryByText('攻略相談')).toBeNull();
});

it.each(['forums', 'topics', 'feed'])('%s の重複IDを正常な一覧にしない', async (source) => {
  mockData[source] = [(mockData[source] as object[])[0], (mockData[source] as object[])[0]];
  render(<Community />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('今日の話題')).toBeNull();
});

it('再読込失敗後は古いフィードを隠し、再試行で回復する', async () => {
  render(<Community />);
  await screen.findByText('今日の話題');
  mockErrors.feed = { message: 'offline' };
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('今日の話題')).toBeNull();
  expect(screen.queryByText('攻略相談')).toBeNull();
  mockErrors.feed = null;
  fireEvent.press(screen.getByText('再読み込み'));
  await screen.findByText('今日の話題');
});

it('フィードの空応答は正常な0件と区別する', async () => {
  mockData.feed = null;
  render(<Community />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText(/フォロー中のゲームの投稿はまだありません/)).toBeNull();
});

it('正常な0件では未フォローと断定せず新着なしを案内する', async () => {
  mockData.feed = [];
  render(<Community />);
  await screen.findByText(/フォロー中のゲームの投稿はまだありません/);
  expect(screen.getByText(/ゲームをフォローすると/)).toBeTruthy();
});
