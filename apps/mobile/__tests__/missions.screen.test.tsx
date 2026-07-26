import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// --- Supabase を差し替え（画面のデータ取得/RPC を制御）---
// jest.mock はホイストされるため参照する可変変数は `mock` 接頭辞が必須。
let mockTables: Record<string, unknown[]> = {};
const mockRpc = jest.fn();
const mockGetUser = jest.fn();
jest.mock('@/lib/supabase', () => {
  // PostgREST のチェーン（select/eq/limit …）を模した thenable を返す。
  const makeQuery = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'limit', 'order', 'in']) q[m] = () => q;
    (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
    return q;
  };
  return {
    supabase: {
      auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
      from: (table: string) => makeQuery(mockTables[table] ?? []),
      rpc: (...a: unknown[]) => mockRpc(...a),
    },
  };
});

// 演出（Animated）は本テストの対象外。show の呼び出しだけ検証する。
const mockShow = jest.fn();
jest.mock('@/components/RewardToast', () => ({ useReward: () => ({ show: mockShow, node: null }) }));

// SafeAreaView はネイティブ計測を伴うため素の View に置換。
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

import Missions from '../app/(tabs)/missions';

const daily = (over: Record<string, unknown> = {}) => ({
  id: 'm1', type: 'daily', title: 'ログインボーナス', description: '毎日ログインで獲得',
  reward_points: 100, icon: '📅', is_active: true, requires_verification: false,
  max_progress: 1, starts_at: null, ends_at: null, ...over,
});

describe('Missions screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockRpc.mockResolvedValue({ error: null });
    mockTables = { missions: [], mission_completions: [], offers: [], offer_completions: [] };
  });

  it('選択中タブのミッションを一覧表示する', async () => {
    mockTables.missions = [daily(), { ...daily({ id: 'm2', type: 'weekly', title: '週間チャレンジ' }) }];
    render(<Missions />);
    await waitFor(() => expect(screen.getByText(/ログインボーナス/)).toBeTruthy());
    expect(screen.getByText('＋100 P')).toBeTruthy();
    // デイリータブ選択中はウィークリーの項目は出ない
    expect(screen.queryByText('週間チャレンジ')).toBeNull();
  });

  it('タブを切り替えると別種別のミッションが表示される', async () => {
    mockTables.missions = [daily(), daily({ id: 'm2', type: 'weekly', title: '週間チャレンジ' })];
    render(<Missions />);
    await waitFor(() => expect(screen.getByText(/ログインボーナス/)).toBeTruthy());
    fireEvent.press(screen.getByText('ウィークリー'));
    expect(screen.getByText(/週間チャレンジ/)).toBeTruthy();
    expect(screen.queryByText(/ログインボーナス/)).toBeNull();
  });

  it('「達成」を押すと claim_mission RPC を呼び、獲得演出を出す', async () => {
    mockTables.missions = [daily()];
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('達成')).toBeTruthy());
    fireEvent.press(screen.getByText('達成'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('claim_mission', { p_mission_id: 'm1' }),
    );
    expect(mockShow).toHaveBeenCalledWith(100, 'ログインボーナス');
  });

  it('確定済みミッションは「達成」ボタンでなく完了バッジを出す', async () => {
    mockTables.missions = [daily()];
    mockTables.mission_completions = [{ mission_id: 'm1', status: 'confirmed', progress: 1 }];
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('✓ 完了')).toBeTruthy());
    expect(screen.queryByText('達成')).toBeNull();
  });

  it('取得失敗時はエラーバナーを表示し、再読み込みで再取得する', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('offline'));
    render(<Missions />);
    await waitFor(() =>
      expect(screen.getByText('データの取得に失敗しました。通信環境を確認してください。')).toBeTruthy(),
    );
    // 復旧させて再読み込み → ミッションが表示される
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTables.missions = [daily()];
    fireEvent.press(screen.getByText('再読み込み'));
    await waitFor(() => expect(screen.getByText(/ログインボーナス/)).toBeTruthy());
  });
});
