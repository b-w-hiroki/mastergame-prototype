import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockGetUser = jest.fn();
const mockAlert = jest.fn();
const mockInsert = jest.fn();
const mockRows: Record<string, unknown> = {};
const mockErrors: Record<string, unknown> = {};

jest.mock('@/components/AppAlert', () => ({ AppAlert: { alert: (...args: unknown[]) => mockAlert(...args) } }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ slug: 'eldia' }),
  router: { push: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit']) query[method] = () => query;
    query.single = async () => ({ data: mockRows[table], error: mockErrors[table] ?? null });
    query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: mockRows[table], error: mockErrors[table] ?? null }).then(resolve);
    query.insert = (...args: unknown[]) => mockInsert(...args);
    return query;
  },
} }));

import GameDetail from '../app/games/[slug]';

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockErrors)) delete mockErrors[key];
  mockRows.game_hub_rows = { id: 'g1', slug: 'eldia', name: 'エルディア戦記', genre: 'rpg',
    description: 'ゲームの説明', platforms: ['ios'], forum_id: 'f1', followers: 1, topic_count: 1 };
  mockRows.user_games = [];
  mockRows.topics = [{ id: 't1', kind: 'question', title: '攻略相談', reply_count: 0,
    has_bounty: false, last_activity_at: '2026-10-18T00:00:00Z' }];
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  mockInsert.mockResolvedValue({ error: null });
});

it('空のゲーム応答は空画面にせず再試行を案内する', async () => {
  mockRows.game_hub_rows = null;
  render(<GameDetail />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('フォロー')).toBeNull();
});

it('再読込失敗後は古いゲームと操作欄を隠し、再試行で回復する', async () => {
  render(<GameDetail />);
  await screen.findByText('エルディア戦記');
  mockErrors.topics = { message: 'offline' };
  fireEvent(screen.UNSAFE_getByType(require('react-native').RefreshControl), 'refresh');
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('エルディア戦記')).toBeNull();
  expect(screen.queryByLabelText('フォロー')).toBeNull();
  mockErrors.topics = null;
  fireEvent.press(screen.getByText('再読み込み'));
  await screen.findByText('エルディア戦記');
  expect(screen.getByLabelText('フォロー')).toBeTruthy();
});

it('操作時にログアウト済みなら無言で終わらずログインを案内する', async () => {
  render(<GameDetail />);
  await screen.findByText('エルディア戦記');
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  await act(async () => { fireEvent.press(screen.getByLabelText('フォロー')); });
  expect(mockAlert).toHaveBeenCalledWith('ログインが必要です', expect.any(String));
  expect(mockInsert).not.toHaveBeenCalled();
});

it('正常なフォローは保存成功後に状態を更新する', async () => {
  render(<GameDetail />);
  await screen.findByText('エルディア戦記');
  await act(async () => { fireEvent.press(screen.getByLabelText('フォロー')); });
  await waitFor(() => expect(screen.getByLabelText('フォロー解除')).toBeTruthy());
  expect(mockInsert).toHaveBeenCalledWith({ user_id: 'u1', game_id: 'g1' });
});
