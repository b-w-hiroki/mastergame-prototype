import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, Linking, RefreshControl } from 'react-native';

// --- Supabase を差し替え（画面のデータ取得/RPC を制御）---
// jest.mock はホイストされるため参照する可変変数は `mock` 接頭辞が必須。
let mockTables: Record<string, unknown> = {};
let mockLoadFails = false;
const mockRpc = jest.fn();
const mockGetUser = jest.fn();
jest.mock('@/lib/supabase', () => {
  // PostgREST のチェーン（select/eq/limit …）を模した thenable を返す。
  const makeQuery = (rows: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'limit', 'order', 'in']) q[m] = () => q;
    (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(mockLoadFails
      ? { data: null, error: { message: 'offline' } }
      : { data: rows, error: null });
    return q;
  };
  return {
    supabase: {
      auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
      from: (table: string) => makeQuery(table in mockTables ? mockTables[table] : []),
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

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react');
    useEffect(callback, [callback]);
  },
}));

import Missions from '../app/(tabs)/missions';
import { missionPeriodKey } from '@/lib/missionPeriod';

const CLICK_ID = '0123456789abcdef0123456789abcdef';

const daily = (over: Record<string, unknown> = {}) => ({
  id: 'm1', type: 'daily', title: 'ログインボーナス', description: '毎日ログインで獲得',
  reward_points: 100, icon: '📅', is_active: true, requires_verification: false,
  max_progress: 1, starts_at: null, ends_at: null, ...over,
});

describe('Missions screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockLoadFails = false;
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockRpc.mockImplementation(async (name: string) => ({ data: name === 'service_today' ? '2026-10-18' : { ok: true, reward: 100 }, error: null }));
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
    mockTables.mission_completions = [{ user_id: 'u1', mission_id: 'm1', status: 'confirmed', progress: 1, period_key: missionPeriodKey('daily', '2026-10-18') }];
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('✓ 完了')).toBeTruthy());
    expect(screen.queryByText('達成')).toBeNull();
  });

  it('昨日の完了で今日のミッションを完了扱いにしない', async () => {
    mockTables.missions = [daily()];
    mockTables.mission_completions = [{ user_id: 'u1', mission_id: 'm1', status: 'confirmed', progress: 1, period_key: '2000-01-01' }];
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('達成')).toBeTruthy());
    expect(screen.queryByText('✓ 完了')).toBeNull();
  });

  it('履歴の返却順が前後しても当日の確認中を過去の完了で上書きしない', async () => {
    mockTables.missions = [daily()];
    mockTables.mission_completions = [
      { user_id: 'u1', mission_id: 'm1', status: 'pending', progress: 1, period_key: missionPeriodKey('daily', '2026-10-18') },
      { user_id: 'u1', mission_id: 'm1', status: 'confirmed', progress: 1, period_key: '2000-01-01' },
    ];
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('検証中')).toBeTruthy());
    expect(screen.queryByText('✓ 完了')).toBeNull();
  });

  it('先週の完了で今週の報酬を受取済みにしない', async () => {
    mockTables.missions = [daily({ type: 'weekly' })];
    mockTables.mission_completions = [{ user_id: 'u1', mission_id: 'm1', status: 'confirmed', progress: 1, period_key: '2000-W01' }];
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('デイリー')).toBeTruthy());
    fireEvent.press(screen.getByText('ウィークリー'));
    await waitFor(() => expect(screen.getByText('達成')).toBeTruthy());
    expect(screen.queryByText('✓ 完了')).toBeNull();
  });

  it('検証が必要なミッションには直接の申請ボタンを出さない', async () => {
    mockTables.missions = [daily({ requires_verification: true })];
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('条件達成後に自動反映')).toBeTruthy());
    expect(screen.queryByText('達成')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalledWith('claim_mission', expect.anything());
  });

  it('報酬付与後の再読込が失敗したら古いミッションを消して再申請を止める', async () => {
    mockTables.missions = [daily()];
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'claim_mission') mockLoadFails = true;
      return { data: name === 'service_today' ? '2026-10-18' : { ok: true, reward: 100 }, error: null };
    });
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('達成')).toBeTruthy());
    fireEvent.press(screen.getByText('達成'));
    await waitFor(() => expect(screen.getByText('再読み込み')).toBeTruthy());
    expect(screen.queryByText('✓ 完了')).toBeNull();
    expect(screen.queryByText('達成')).toBeNull();
  });

  it('ミッション取得中にアカウントが変われば旧データを表示しない', async () => {
    mockTables.missions = [daily()];
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } } })
      .mockResolvedValueOnce({ data: { user: { id: 'u2' } } });
    render(<Missions />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('ログインボーナス')).toBeNull();
    expect(screen.queryByText('達成')).toBeNull();
    expect(screen.queryByText('このカテゴリのミッションはありません')).toBeNull();
  });

  it('再読込に失敗したら古いオファーと達成状況を表示しない', async () => {
    mockTables.missions = [daily()];
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100,
      offer_url: 'https://example.com/offer', network_id: 'network1', status: 'active' }];
    render(<Missions />);
    await screen.findByText('挑戦');
    mockLoadFails = true;
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('提携オファー')).toBeNull();
    expect(screen.queryByText('達成')).toBeNull();
  });

  it('再読込失敗後は古いオファーを挑戦できない', async () => {
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100,
      offer_url: 'https://example.com/offer', network_id: 'network1', status: 'active' }];
    render(<Missions />);
    await screen.findByText('挑戦');
    mockLoadFails = true;
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('挑戦')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalledWith('record_ad_impression', expect.anything());
  });

  it('通信例外を画面上に表示し、処理中状態を解除する', async () => {
    mockTables.missions = [daily()];
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'service_today') return { data: '2026-10-18', error: null };
      throw new Error('offline');
    });
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('達成')).toBeTruthy());
    fireEvent.press(screen.getByText('達成'));
    await waitFor(() => expect(screen.getByText(/通信結果を確認できませんでした/)).toBeTruthy());
    expect(screen.queryByText('受取中…')).toBeNull();
    expect(screen.getByText('達成')).toBeTruthy();
  });

  it('サーバーが却下した場合は完了バッジや獲得演出を出さない', async () => {
    mockTables.missions = [daily()];
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : { status: 'rejected', reason: 'user_frozen' }, error: null,
    }));
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('達成')).toBeTruthy());
    fireEvent.press(screen.getByText('達成'));
    await waitFor(() => expect(screen.getByText(/この報酬は現在受け取れません/)).toBeTruthy());
    expect(screen.queryByText('✓ 完了')).toBeNull();
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('報酬額が欠損した成功応答では予定額を獲得演出に使わない', async () => {
    mockTables.missions = [daily()];
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'claim_mission' ? { ok: true } : null,
      error: null,
    }));
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('達成')).toBeTruthy());
    fireEvent.press(screen.getByText('達成'));
    await waitFor(() => expect(screen.getByText(/ポイント数を確認できませんでした/)).toBeTruthy());
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('アカウント切替後は古いミッションから受取RPCを送らない', async () => {
    mockTables.missions = [daily()];
    render(<Missions />);
    await screen.findByText('達成');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } });
    fireEvent.press(screen.getByText('達成'));
    await screen.findByText(/報酬は申請していません/);
    expect(mockRpc).not.toHaveBeenCalledWith('claim_mission', expect.anything());
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('受取RPCの送信後にアカウントが変われば古い報酬を演出しない', async () => {
    mockTables.missions = [daily()];
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation((name: string) => name === 'claim_mission'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18' : null, error: null }));
    render(<Missions />);
    await screen.findByText('達成');
    fireEvent.press(screen.getByText('達成'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('claim_mission', { p_mission_id: 'm1' }));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } });
    finish({ data: { ok: true, reward: 100 }, error: null });
    await screen.findByText(/ポイント履歴で受取結果/);
    expect(mockShow).not.toHaveBeenCalled();
    expect(screen.queryByText('✓ 完了')).toBeNull();
  });

  it('受取RPCの送信中に画面を再読込しても古い報酬を演出しない', async () => {
    mockTables.missions = [daily()];
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation((name: string) => name === 'claim_mission'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18' : null, error: null }));
    render(<Missions />);
    await screen.findByText('達成');
    fireEvent.press(screen.getByText('達成'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('claim_mission', { p_mission_id: 'm1' }));
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    finish({ data: { ok: true, reward: 100 }, error: null });
    await screen.findByText(/ポイント履歴で受取結果/);
    expect(mockShow).not.toHaveBeenCalled();
    expect(screen.queryByText('✓ 完了')).toBeNull();
  });

  it('旧アカウントの受取が未応答でも新アカウントの受取を塞がず、旧応答で新しい処理表示を消さない', async () => {
    mockTables.missions = [daily()];
    const finish: ((value: unknown) => void)[] = [];
    mockRpc.mockImplementation((name: string) => name === 'claim_mission'
      ? new Promise((resolve) => { finish.push(resolve); })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18' : null, error: null }));
    render(<Missions />);
    await screen.findByText('達成');
    fireEvent.press(screen.getByText('達成'));
    await waitFor(() => expect(finish).toHaveLength(1));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } });
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText('達成');
    fireEvent.press(screen.getByText('達成'));
    await waitFor(() => expect(finish).toHaveLength(2));
    await act(async () => { finish[0]({ data: { ok: true, reward: 100 }, error: null }); });
    expect(screen.getByText('受取中…')).toBeTruthy();
    expect(mockShow).not.toHaveBeenCalled();
    await act(async () => { finish[1]({ data: { ok: true, reward: 100 }, error: null }); });
    await waitFor(() => expect(mockShow).toHaveBeenCalledTimes(1));
  });

  it('アカウント切替後は古いオファーの記録RPCを送らない', async () => {
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100,
      offer_url: 'https://offers.partner.test/offer', mission_id: 'm-offer', network_id: 'network1', status: 'active' }];
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Missions />);
    await screen.findByText('挑戦');
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } });
    fireEvent.press(screen.getByText('挑戦'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('開けませんでした', expect.stringContaining('ログイン状態')));
    expect(mockRpc).not.toHaveBeenCalledWith('record_ad_impression', expect.anything());
    expect(open).not.toHaveBeenCalled();
  });

  it('オファー記録後にアカウントが変われば外部リンクを開かない', async () => {
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100,
      offer_url: 'https://offers.partner.test/offer', mission_id: 'm-offer', network_id: 'network1', status: 'active' }];
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation((name: string) => name === 'record_ad_impression'
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve({ data: name === 'service_today' ? '2026-10-18' : null, error: null }));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Missions />);
    await screen.findByText('挑戦');
    fireEvent.press(screen.getByText('挑戦'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('record_ad_impression', expect.anything()));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } });
    finish({ data: { ok: true, remaining: 2 }, error: null });
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('開けませんでした', expect.stringContaining('アカウント')));
    expect(open).not.toHaveBeenCalled();
  });

  it('外部リンクを開く待機中にアカウントが変われば旧オファーの成功案内を出さない', async () => {
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100,
      offer_url: 'https://offers.partner.test/offer', mission_id: 'm-offer', network_id: 'n1', status: 'active' }];
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'track_click' ? CLICK_ID : { ok: true, remaining: 2 }, error: null,
    }));
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    let finish!: () => void;
    jest.spyOn(Linking, 'openURL').mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<Missions />);
    await screen.findByText('挑戦');
    fireEvent.press(screen.getByText('挑戦'));
    await waitFor(() => expect(finish).toBeDefined());
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2' } } });
    await act(async () => { finish(); });
    expect(Alert.alert).not.toHaveBeenCalledWith('達成後に確定します', expect.any(String));
  });

  it('オファー記録RPCが空応答なら外部ページを開かない', async () => {
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100, offer_url: 'https://offers.partner.test/offer', mission_id: 'm-offer', network_id: 'n1', status: 'active' }];
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : null, error: null,
    }));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('挑戦')).toBeTruthy());
    fireEvent.press(screen.getByText('挑戦'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('開けませんでした', expect.stringContaining('利用状況')));
    expect(open).not.toHaveBeenCalled();
  });

  it('オファー記録RPCがok=falseなら外部ページを開かない', async () => {
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100, offer_url: 'https://offers.partner.test/offer', mission_id: 'm-offer', network_id: 'n1', status: 'active' }];
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : { ok: false, remaining: 3 }, error: null,
    }));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('挑戦')).toBeTruthy());
    fireEvent.press(screen.getByText('挑戦'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('開けませんでした', expect.stringContaining('利用状況')));
    expect(open).not.toHaveBeenCalled();
  });

  it('オファー記録が成功し残枠があれば外部ページを開く', async () => {
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100, offer_url: 'https://offers.partner.test/offer', mission_id: 'm-offer', network_id: 'n1', status: 'active' }];
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : name === 'track_click' ? CLICK_ID : { ok: true, remaining: 2 }, error: null,
    }));
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('挑戦')).toBeTruthy());
    fireEvent.press(screen.getByText('挑戦'));
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining('click_id=' + CLICK_ID)));
  });

  it('オファーの日次残枠が0なら外部ページを開かない', async () => {
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100, offer_url: 'https://offers.partner.test/offer', mission_id: 'm-offer', network_id: 'n1', status: 'active' }];
    mockRpc.mockImplementation(async (name: string) => ({
      data: name === 'service_today' ? '2026-10-18' : { ok: true, remaining: 0 }, error: null,
    }));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('挑戦')).toBeTruthy());
    fireEvent.press(screen.getByText('挑戦'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('本日の上限に達しました', expect.any(String)));
    expect(open).not.toHaveBeenCalled();
  });

  it('無効なオファーURLは記録RPCも外部遷移も行わない', async () => {
    mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100, offer_url: 'javascript:alert(1)', network_id: 'n1', status: 'active' }];
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Missions />);
    await waitFor(() => expect(screen.getByText('挑戦')).toBeTruthy());
    fireEvent.press(screen.getByText('挑戦'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('準備中', expect.stringContaining('リンク')));
    expect(mockRpc).not.toHaveBeenCalledWith('record_ad_impression', expect.anything());
    expect(open).not.toHaveBeenCalled();
  });

  it('取得失敗時はエラーバナーを表示し、再読み込みで再取得する', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('offline'));
    render(<Missions />);
    await waitFor(() =>
      expect(screen.getByText('データの取得に失敗しました。通信環境を確認してください。')).toBeTruthy(),
    );
    expect(screen.queryByText('このカテゴリのミッションはありません')).toBeNull();
    // 復旧させて再読み込み → ミッションが表示される
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTables.missions = [daily()];
    fireEvent.press(screen.getByText('再読み込み'));
    await waitFor(() => expect(screen.getByText(/ログインボーナス/)).toBeTruthy());
  });

  it.each(['missions', 'mission_completions', 'offers', 'offer_completions'])(
    '%sが空応答なら未達成・未挑戦として表示せず再読み込みを促す', async (table) => {
      mockTables.missions = [daily()];
      mockTables.offers = [{ id: 'o1', title: '提携オファー', reward_points: 100,
        offer_url: 'https://offers.partner.test/offer', mission_id: 'm-offer', network_id: 'n1', status: 'active' }];
      mockTables[table] = null;
      render(<Missions />);
      await screen.findByText('データの取得に失敗しました。通信環境を確認してください。');
      expect(screen.queryByText('達成')).toBeNull();
      expect(screen.queryByText('挑戦')).toBeNull();
      expect(screen.queryByText('このカテゴリのミッションはありません')).toBeNull();
    },
  );

  it('正常な空配列は取得成功として扱う', async () => {
    render(<Missions />);
    await screen.findByText('このカテゴリのミッションはありません');
    expect(screen.queryByText(/データの取得に失敗しました/)).toBeNull();
  });

  it('表示対象外の過去履歴が混ざっても現在の一覧を表示する', async () => {
    mockTables.missions = [daily()];
    mockTables.mission_completions = [{ user_id: 'u1', mission_id: 'old-mission', status: 'confirmed', progress: 1, period_key: 'once' }];
    mockTables.offers = [{ id: 'o1', network_id: 'n1', title: '提携オファー', reward_points: 100, status: 'active' }];
    mockTables.offer_completions = [{ user_id: 'u1', offer_id: 'old-offer', status: 'confirmed' }];
    render(<Missions />);
    await screen.findByText('達成');
    expect(screen.getByText('挑戦')).toBeTruthy();
  });

  it.each(['missions', 'offers', 'mission_completions'])(
    '%s の同じキーが重複したら操作を止める', async (table) => {
      mockTables.missions = [daily()];
      mockTables.offers = [{ id: 'o1', network_id: 'n1', title: '提携オファー', reward_points: 100, status: 'active' }];
      mockTables.mission_completions = [{ user_id: 'u1', mission_id: 'm1', status: 'confirmed', progress: 1, period_key: '2026-10-18' }];
      mockTables[table] = [
        (mockTables[table] as object[])[0],
        (mockTables[table] as object[])[0],
      ];
      render(<Missions />);
      await screen.findByText('データの取得に失敗しました。通信環境を確認してください。');
      expect(screen.queryByText('達成')).toBeNull();
      expect(screen.queryByText('挑戦')).toBeNull();
    },
  );

  it.each([
    [['pending', 'confirmed'], '✓ 獲得'],
    [['confirmed', 'pending'], '✓ 獲得'],
    [['rejected', 'pending'], '確認中'],
  ])('オファー履歴 %j は返却順によらず %s を表示する', async (statuses, badge) => {
    mockTables.offers = [{ id: 'o1', network_id: 'n1', title: '提携オファー', reward_points: 100, status: 'active' }];
    mockTables.offer_completions = statuses.map((status) => ({ user_id: 'u1', offer_id: 'o1', status }));
    render(<Missions />);
    await screen.findByText(badge);
    expect(screen.queryByText('挑戦')).toBeNull();
  });

  it.each([
    ['missions', [daily({ reward_points: -1 })]],
    ['mission_completions', [{ user_id: 'u2', mission_id: 'm1', status: 'confirmed', progress: 1, period_key: '2026-10-18' }]],
    ['offers', [{ id: 'o1', network_id: 'n1', title: '提携オファー', reward_points: NaN, status: 'active' }]],
    ['offer_completions', [{ user_id: 'u2', offer_id: 'o1', status: 'confirmed' }]],
    ['mission_completions', [{ user_id: 'u1', mission_id: 'm1', status: 'unknown', progress: 1, period_key: '2026-10-18' }]],
    ['offer_completions', [{ user_id: 'u1', offer_id: 'o1', status: 'unknown' }]],
  ])('%s の不正な行を正常な一覧として表示しない', async (table, rows) => {
    mockTables.missions = [daily()];
    mockTables.offers = [{ id: 'o1', network_id: 'n1', title: '提携オファー', reward_points: 100, status: 'active' }];
    mockTables[table as string] = rows;
    render(<Missions />);
    await screen.findByText('データの取得に失敗しました。通信環境を確認してください。');
    expect(screen.queryByText('達成')).toBeNull();
    expect(screen.queryByText('挑戦')).toBeNull();
  });
});
