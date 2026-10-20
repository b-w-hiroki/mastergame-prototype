import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

let mockTables: Record<string, unknown> = {};
let mockLoadFails = false;
let mockUserId: string | null = 'u1';
let mockAuthIds: string[] | null = null;
const mockRpc = jest.fn();
const mockPush = jest.fn();
const mockShow = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => {
      const id = mockAuthIds?.shift() ?? mockUserId;
      return { data: { user: id ? { id } : null }, error: null };
    } },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      let rows = mockTables[table];
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'order', 'limit', 'single']) query[method] = () => query;
      query.eq = (key: string, value: unknown) => {
        if (Array.isArray(rows)) rows = rows.filter((row) => row[key] === value);
        return query;
      };
      query.then = (resolve: (value: unknown) => void) => resolve(mockLoadFails
        ? { data: null, error: { message: 'offline' } }
        : { data: rows, error: null });
      return query;
    },
  },
}));
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/components/RewardToast', () => ({ useReward: () => ({ show: mockShow, node: null }) }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), EVENTS: {} }));

import Home from '../app/(tabs)/index';

const mission = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1', type: 'daily', title: 'デイリー報酬', is_active: true,
  reward_points: 1000, requires_verification: false, ...overrides,
});
const completion = (overrides: Record<string, unknown> = {}) => ({
  user_id: 'u1', mission_id: 'm1', status: 'confirmed',
  period_key: '2026-10-18', ...overrides,
});
const notification = (overrides: Record<string, unknown> = {}) => ({
  id: 'n1', user_id: 'u1', type: 'inquiry_answered',
  payload: { inquiry_id: 'i1', subject: '回答' }, read_at: null,
  created_at: '2026-10-18T00:00:00Z', ...overrides,
});
const streak = (overrides: Record<string, unknown> = {}) => ({
  current_streak: 0, longest_streak: 0, claimed_today: false,
  next_day_index: 1, next_reward: 100, max_day_index: 7, broken: false,
  ...overrides,
});

describe('Home daily rewards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadFails = false;
    mockUserId = 'u1';
    mockAuthIds = null;
    mockTables = {
      point_wallets: { user_id: 'u1', balance: 2000 }, user_vip: null,
      missions: [mission()], notifications: [], mission_completions: [],
    };
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'next_nudge_target' ? { none_available: true }
        : name === 'claim_mission' ? { ok: true, reward: 1000 } : null,
      error: null,
    }));
  });

  it('当日の受取済み報酬は再び申請するボタンを出さない', async () => {
    mockTables.mission_completions = [completion()];
    render(<Home />);
    await waitFor(() => expect(screen.getByText('✓ 受取済み')).toBeTruthy());
    expect(screen.queryByText('受け取る')).toBeNull();
  });

  it('昨日の達成履歴があっても今日の報酬は受け取れる', async () => {
    mockTables.mission_completions = [completion({
      period_key: '2026-10-17',
    })];
    render(<Home />);
    await waitFor(() => expect(screen.getByText('受け取る')).toBeTruthy());
    expect(screen.queryByText('✓ 受取済み')).toBeNull();
  });

  it('確認中の報酬は再申請できない', async () => {
    mockTables.mission_completions = [completion({ status: 'pending' })];
    render(<Home />);
    await waitFor(() => expect(screen.getByText('確認中')).toBeTruthy());
    expect(screen.queryByText('受け取る')).toBeNull();
  });

  it('サーバー検証が必要な報酬は条件確認へ案内する', async () => {
    mockTables.missions = [mission({ requires_verification: true })];
    render(<Home />);
    await waitFor(() => expect(screen.getByText('条件を確認')).toBeTruthy());
    fireEvent.press(screen.getByText('条件を確認'));
    expect(mockPush).toHaveBeenCalledWith('/missions');
    expect(mockRpc).not.toHaveBeenCalledWith('claim_mission', expect.anything());
  });

  it('受取成功後の再読込が失敗しても古いミッションを再申請させない', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'claim_mission') mockLoadFails = true;
      return { data: name === 'service_today' ? '2026-10-18' : name === 'next_nudge_target' ? { none_available: true }
        : name === 'claim_mission' ? { ok: true, reward: 1000 } : null, error: null };
    });
    render(<Home />);
    await waitFor(() => expect(screen.getByText('受け取る')).toBeTruthy());
    fireEvent.press(screen.getByText('受け取る'));
    await waitFor(() => expect(screen.getByText('再読み込み')).toBeTruthy());
    expect(screen.queryByText('受け取る')).toBeNull();
    expect(mockShow).toHaveBeenCalledWith(1000, 'デイリー報酬');
    expect(mockRpc).toHaveBeenCalledWith('claim_mission', { p_mission_id: 'm1' });
  });

  it('HTTP通信が成功でもサーバーが却下した報酬を獲得済みにしない', async () => {
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'next_nudge_target' ? { none_available: true }
        : name === 'claim_mission' ? { status: 'rejected', reason: 'user_frozen' } : null,
      error: null,
    }));
    render(<Home />);
    await waitFor(() => expect(screen.getByText('受け取る')).toBeTruthy());
    fireEvent.press(screen.getByText('受け取る'));
    await waitFor(() => expect(screen.getByText(/この報酬は現在受け取れません/)).toBeTruthy());
    expect(screen.queryByText('✓ 受取済み')).toBeNull();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('ミッション成功応答に報酬額が無い場合、予定額を獲得額として演出しない', async () => {
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'next_nudge_target' ? { none_available: true }
        : name === 'claim_mission' ? { ok: true } : null,
      error: null,
    }));
    render(<Home />);
    await waitFor(() => expect(screen.getByText('受け取る')).toBeTruthy());
    fireEvent.press(screen.getByText('受け取る'));
    await waitFor(() => expect(screen.getByText(/ポイント数を確認できませんでした/)).toBeTruthy());
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('連続ログイン成功応答に報酬額が無い場合、0P獲得と表示しない', async () => {
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'next_nudge_target' ? { none_available: true }
        : name === 'my_streak' ? { current_streak: 0, longest_streak: 0, claimed_today: false, next_day_index: 1, next_reward: 100, max_day_index: 7, broken: false }
          : name === 'claim_daily_streak' ? { status: 'ok', streak: 1 } : null,
      error: null,
    }));
    render(<Home />);
    await waitFor(() => expect(screen.getByText('＋100 P を受け取る')).toBeTruthy());
    fireEvent.press(screen.getByText('＋100 P を受け取る'));
    await waitFor(() => expect(screen.getByText(/ポイント数を確認できませんでした/)).toBeTruthy());
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('連続ログインの正当な0P設定は獲得演出なしで伝える', async () => {
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'next_nudge_target' ? { none_available: true }
        : name === 'my_streak' ? { current_streak: 0, longest_streak: 0, claimed_today: false, next_day_index: 1, next_reward: 0, max_day_index: 7, broken: false }
          : name === 'claim_daily_streak' ? { status: 'ok', streak: 1, reward: 0 } : null,
      error: null,
    }));
    render(<Home />);
    await waitFor(() => expect(screen.getByText('＋0 P を受け取る')).toBeTruthy());
    fireEvent.press(screen.getByText('＋0 P を受け取る'));
    await waitFor(() => expect(screen.getByText(/ポイント付与なし/)).toBeTruthy());
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('ホーム通知の既読RPCがok=falseなら失敗を案内し、遷移は維持する', async () => {
    mockTables.notifications = [notification()];
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'next_nudge_target' ? { none_available: true }
        : name === 'mark_notification_read' ? { ok: false } : null,
      error: null,
    }));
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/お問い合わせに回答があります/)).toBeTruthy());
    fireEvent.press(screen.getByText(/お問い合わせに回答があります/));
    await waitFor(() => expect(screen.getByText(/既読の保存に失敗しました/)).toBeTruthy());
    expect(mockPush).toHaveBeenCalledWith('/support/i1');
  });

  it('ホーム通知を連続タップしても既読RPCは一回だけ送る', async () => {
    mockTables.notifications = [notification()];
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation((name: string) => name === 'mark_notification_read'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18' : null, error: null }));
    render(<Home />);
    await screen.findByText(/お問い合わせに回答があります/);
    fireEvent.press(screen.getByText(/お問い合わせに回答があります/));
    fireEvent.press(screen.getByText(/お問い合わせに回答があります/));
    await waitFor(() => expect(mockRpc.mock.calls.filter(([name]) => name === 'mark_notification_read')).toHaveLength(1));
    finish({ data: { ok: true }, error: null });
    await waitFor(() => expect(mockRpc.mock.calls.filter(([name]) => name === 'service_today').length).toBeGreaterThan(1));
  });

  it('アカウント切替後の古いホーム通知は既読RPCを送らない', async () => {
    mockTables.notifications = [notification()];
    render(<Home />);
    await screen.findByText(/お問い合わせに回答があります/);
    mockUserId = 'u2';
    fireEvent.press(screen.getByText(/お問い合わせに回答があります/));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/support/i1'));
    expect(mockRpc).not.toHaveBeenCalledWith('mark_notification_read', expect.anything());
  });

  it('既読RPC待ちに再読込したら古い失敗を新しいホームへ表示しない', async () => {
    mockTables.notifications = [notification()];
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation((name: string) => name === 'mark_notification_read'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18' : null, error: null }));
    render(<Home />);
    await screen.findByText(/お問い合わせに回答があります/);
    fireEvent.press(screen.getByText(/お問い合わせに回答があります/));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' }));
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    finish({ data: { ok: false }, error: null });
    await screen.findByText('回答');
    expect(screen.queryByText(/既読の保存に失敗しました/)).toBeNull();
  });

  it('ホームのお知らせは本人分だけ表示する', async () => {
    mockTables.notifications = [notification(), notification({ id: 'n2', user_id: 'u2', payload: { subject: '他人の回答' } })];
    render(<Home />);
    await screen.findByText('回答');
    expect(screen.queryByText('他人の回答')).toBeNull();
  });

  it.each([
    notification({ payload: ['invalid'] }),
    notification({ read_at: 'invalid-date' }),
  ])('ホーム通知の不正行を表示せず取得失敗とする: %p', async (invalid) => {
    mockTables.notifications = [invalid];
    render(<Home />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('回答')).toBeNull();
    expect(screen.getByText('🪙 — P')).toBeTruthy();
  });

  it('再取得失敗では古い通知とVIP情報を消す', async () => {
    mockTables.notifications = [notification()];
    mockTables.user_vip = { user_id: 'u1', xp: 0, tier_name: 'Bronze', staking_rate_bps: 0 };
    render(<Home />);
    await screen.findByText('回答');
    mockLoadFails = true;
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('回答')).toBeNull();
    expect(screen.queryByText('VIP Bronze')).toBeNull();
  });

  it('再読込失敗後は残高を未確認と表示し、古いミッションを申請しない', async () => {
    render(<Home />);
    await screen.findByText('受け取る');
    mockLoadFails = true;
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.getByText('🪙 — P')).toBeTruthy();
    expect(screen.queryByText('受け取る')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalledWith('claim_mission', expect.anything());
  });

  it('残高が空応答なら0Pと決めつけず、受取操作を出さない', async () => {
    mockTables.point_wallets = null;
    render(<Home />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.getByText('🪙 — P')).toBeTruthy();
    expect(screen.queryByText('受け取る')).toBeNull();
  });

  it('ホームの取得中にアカウントが変われば旧データを表示しない', async () => {
    mockAuthIds = ['u1', 'u2'];
    render(<Home />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.getByText('🪙 — P')).toBeTruthy();
    expect(screen.queryByText('受け取る')).toBeNull();
    expect(screen.queryByText('本日のミッションはありません')).toBeNull();
  });

  it.each([
    mission({ id: '' }),
    mission({ reward_points: -1 }),
    mission({ requires_verification: null }),
  ])('不正なデイリーミッションを表示・申請させない: %p', async (row) => {
    mockTables.missions = [row];
    render(<Home />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('受け取る')).toBeNull();
    expect(screen.queryByText('デイリー報酬')).toBeNull();
  });

  it.each([
    { item_id: 'item1', item_name: '景品', gap: -1, cost: 100 },
    { item_id: 'item1', item_name: '景品', gap: 50, cost: 0 },
    { all_affordable: true, item_id: 'item1' },
  ])('不正な交換ナッジを表示せず取得失敗にする: %p', async (nudge) => {
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'next_nudge_target' ? nudge : null,
      error: null,
    }));
    render(<Home />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('次の交換目標')).toBeNull();
    expect(screen.queryByText('受け取る')).toBeNull();
  });

  it.each([
    streak({ next_reward: -1 }),
    streak({ next_day_index: 8 }),
    streak({ max_day_index: 10000 }),
    streak({ claimed_today: 'yes' }),
    streak({ claimed_today: true, current_streak: 0 }),
  ])('不正な連続ログイン応答で受取ボタンを出さない: %p', async (state) => {
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'my_streak' ? state : null,
      error: null,
    }));
    render(<Home />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText(/P を受け取る/)).toBeNull();
    expect(screen.queryByText('受け取る')).toBeNull();
  });

  it('連続ログイン応答の異常後、再読み込みで正常なカードへ回復する', async () => {
    let state = streak({ next_reward: -1 });
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'my_streak' ? state : null,
      error: null,
    }));
    render(<Home />);
    await screen.findByText(/データの取得に失敗しました/);
    state = streak();
    fireEvent.press(screen.getByText('再読み込み'));
    await screen.findByText('＋100 P を受け取る');
    expect(screen.queryByText(/データの取得に失敗しました/)).toBeNull();
  });

  it.each([
    { user_id: 'u2', balance: 2000 },
    { user_id: 'u1', balance: -1 },
  ])('不正な残高応答では残高と受取操作を出さない: %p', async (wallet) => {
    mockTables.point_wallets = wallet;
    render(<Home />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.getByText('🪙 — P')).toBeTruthy();
    expect(screen.queryByText('受け取る')).toBeNull();
  });

  it.each([
    { user_id: 'u2', xp: 0, tier_name: 'Bronze', staking_rate_bps: 0 },
    { user_id: 'u1', xp: -1, tier_name: 'Bronze', staking_rate_bps: 0 },
  ])('不正なVIP応答では本人の情報として表示しない: %p', async (vip) => {
    mockTables.user_vip = vip;
    render(<Home />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('VIP Bronze')).toBeNull();
    expect(screen.queryByText('受け取る')).toBeNull();
  });

  it.each([
    completion({ user_id: 'u2' }),
    completion({ status: 'unknown' }),
    completion({ mission_id: '' }),
  ])('不正な当日達成履歴で受取操作を出さない: %p', async (row) => {
    mockTables.mission_completions = [row];
    render(<Home />);
    if (row.user_id === 'u2') {
      await screen.findByText('受け取る');
      expect(screen.queryByText('✓ 受取済み')).toBeNull();
    } else {
      await screen.findByText(/データの取得に失敗しました/);
      expect(screen.queryByText('受け取る')).toBeNull();
    }
  });

  it('同時に受取ボタンが押されてもRPCは一回だけ送る', async () => {
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation((name: string) => name === 'claim_mission'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18' : null, error: null }));
    render(<Home />);
    await screen.findByText('受け取る');
    const button = screen.getByText('受け取る');
    fireEvent.press(button);
    fireEvent.press(button);
    await waitFor(() => expect(mockRpc.mock.calls.filter(([name]) => name === 'claim_mission')).toHaveLength(1));
    mockTables.mission_completions = [completion()];
    finish({ data: { ok: true, reward: 1000 }, error: null });
    await screen.findByText('✓ 受取済み');
  });

  it('アカウント切替後は古いホームからミッション受取を送信しない', async () => {
    render(<Home />);
    await screen.findByText('受け取る');
    mockUserId = 'u2';
    fireEvent.press(screen.getByText('受け取る'));
    await screen.findByText(/報酬は申請していません/);
    expect(mockRpc).not.toHaveBeenCalledWith('claim_mission', expect.anything());
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('ミッション受取の送信後にアカウントが変われば古い成功を表示しない', async () => {
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation((name: string) => name === 'claim_mission'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18' : null, error: null }));
    render(<Home />);
    await screen.findByText('受け取る');
    fireEvent.press(screen.getByText('受け取る'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('claim_mission', { p_mission_id: 'm1' }));
    mockUserId = 'u2';
    finish({ data: { ok: true, reward: 1000 }, error: null });
    await screen.findByText(/ポイント履歴で受取結果/);
    expect(mockShow).not.toHaveBeenCalled();
    expect(screen.queryByText('✓ 受取済み')).toBeNull();
  });

  it('ミッション受取の送信中にホームを再読込しても古い成功を表示しない', async () => {
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation((name: string) => name === 'claim_mission'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18' : null, error: null }));
    render(<Home />);
    await screen.findByText('受け取る');
    fireEvent.press(screen.getByText('受け取る'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('claim_mission', { p_mission_id: 'm1' }));
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    finish({ data: { ok: true, reward: 1000 }, error: null });
    await screen.findByText(/ポイント履歴で受取結果/);
    expect(mockShow).not.toHaveBeenCalled();
    expect(screen.queryByText('✓ 受取済み')).toBeNull();
  });

  it('連続ログイン受取の送信後にアカウントが変われば古い報酬を演出しない', async () => {
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation((name: string) => name === 'claim_daily_streak'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18'
        : name === 'my_streak' ? streak() : null, error: null }));
    render(<Home />);
    await screen.findByText('＋100 P を受け取る');
    fireEvent.press(screen.getByText('＋100 P を受け取る'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('claim_daily_streak'));
    mockUserId = 'u2';
    finish({ data: { status: 'ok', streak: 1, reward: 100 }, error: null });
    await screen.findByText(/ポイント履歴で受取結果/);
    expect(mockShow).not.toHaveBeenCalled();
  });
});
