import { fireEvent, render, screen } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

const mockData: Record<string, unknown> = {};
const mockErrors: Record<string, unknown> = {};

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
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order']) query[method] = () => query;
    query.single = async () => ({ data: mockData[table], error: mockErrors[table] ?? null });
    query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: mockData[table], error: mockErrors[table] ?? null }).then(resolve);
    return query;
  },
} }));

import MyPage from '../app/(tabs)/mypage';

beforeEach(() => {
  for (const key of Object.keys(mockErrors)) delete mockErrors[key];
  mockData.profiles = { id: 'u1', username: 'テストユーザー', handle: '@player', xp: 20 };
  mockData.user_vip = { user_id: 'u1', xp: 20, tier_name: 'Bronze', staking_rate_bps: 100 };
  mockData.vip_tiers = [{ name: 'Bronze', min_xp: 0, sort: 1 }];
  mockData.user_genres = [{ genre: 'rpg' }];
});

it('再読込失敗後は古いプロフィールを隠し、再試行で回復する', async () => {
  render(<MyPage />);
  await screen.findByText('テストユーザー');
  mockErrors.profiles = { message: 'offline' };
  fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('テストユーザー')).toBeNull();
  expect(screen.queryByText('@player')).toBeNull();
  expect(screen.queryByText('VIP Bronze')).toBeNull();
  mockErrors.profiles = null;
  fireEvent.press(screen.getByText('再読み込み'));
  await screen.findByText('テストユーザー');
});

it('別ユーザーのプロフィール応答は表示しない', async () => {
  mockData.profiles = { id: 'u2', username: '別ユーザー', handle: '@other', xp: 20 };
  render(<MyPage />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('別ユーザー')).toBeNull();
});

it('プロフィールの空応答は正常な未設定と区別する', async () => {
  mockData.profiles = null;
  render(<MyPage />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('@player')).toBeNull();
});
