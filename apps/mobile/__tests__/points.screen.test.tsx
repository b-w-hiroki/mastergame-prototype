import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

let mockTables: Record<string, unknown> = {};
let mockParams: { section?: string; request_id?: string } = {};
let mockLoadFails = false;
let mockPageLoadFails = false;
let mockPageReturnsNull = false;
let mockTargetLoadFails = false;
let mockTargetOverride: unknown = undefined;
let mockDelayPages = false;
let mockDeferredPage: (() => void) | null = null;
let mockUserId = 'u1';
let mockAuthUnavailable = false;
const mockRpc = jest.fn();
const mockPush = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => mockAuthUnavailable
      ? { data: { user: null }, error: { message: 'offline' } }
      : { data: { user: { id: mockUserId } }, error: null } },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      let rows = mockTables[table] ?? [];
      const order: Array<{ key: string; ascending: boolean }> = [];
      let limit = Number.POSITIVE_INFINITY;
      let single = false;
      let paging = false;
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'abortSignal']) query[method] = () => query;
      for (const method of ['single', 'maybeSingle']) query[method] = () => { single = true; return query; };
      query.order = (key: string, options: { ascending: boolean } = { ascending: true }) => {
        order.push({ key, ascending: options.ascending });
        return query;
      };
      query.eq = (key: string, value: unknown) => {
        if (Array.isArray(rows)) rows = rows.filter((row) => row[key] === value);
        return query;
      };
      query.limit = (count: number) => {
        limit = count;
        return query;
      };
      query.or = (filter: string) => {
        paging = true;
        const cursor = /^requested_at\.lt\.(.+),and\(requested_at\.eq\.(.+),id\.lt\.(.+)\)$/.exec(filter);
        if (!cursor) throw new Error('Invalid history cursor');
        if (Array.isArray(rows)) rows = rows.filter((row) => row.requested_at < cursor[1]
          || (row.requested_at === cursor[2] && row.id < cursor[3]));
        return query;
      };
      query.then = (resolve: (value: unknown) => void) => {
        if (mockLoadFails || (paging && mockPageLoadFails) || (table === 'exchange_requests' && single && mockTargetLoadFails)) {
          return resolve({ data: null, error: { message: 'offline' } });
        }
        if (table === 'exchange_requests' && single && mockTargetOverride !== undefined) {
          return resolve({ data: mockTargetOverride, error: null });
        }
        if (paging && mockPageReturnsNull) return resolve({ data: null, error: null });
        let data = rows;
        if (Array.isArray(rows)) {
          const page = [...rows].sort((a, b) => {
            for (const { key, ascending } of order) {
              if (a[key] < b[key]) return ascending ? -1 : 1;
              if (a[key] > b[key]) return ascending ? 1 : -1;
            }
            return 0;
          }).slice(0, limit);
          data = single ? page[0] ?? null : page;
        }
        const result = { data, error: null };
        if (paging && mockDelayPages) {
          mockDeferredPage = () => resolve(result);
          return;
        }
        return resolve(result);
      };
      return query;
    },
  },
}));
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

import Points from '../app/(tabs)/points';

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'item1', name: 'ゲームチケット', description: null, cost_points: 1000,
  stock: 3, is_active: true, sort: 1, ...overrides,
});
const wallet = (overrides: Record<string, unknown> = {}) => ({
  user_id: 'u1', balance: 5000, lifetime_earned: 5000, lifetime_spent: 0, ...overrides,
});
const request = (overrides: Record<string, unknown> = {}) => ({
  id: requestId(1), user_id: 'u1', item_id: 'item1', cost_points: 1000,
  status: 'processing', requested_at: '2026-10-18T03:00:00Z', code: null, ...overrides,
});
const requestId = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const ledgerEntry = (overrides: Record<string, unknown> = {}) => ({
  id: requestId(1), user_id: 'u1', delta: 100, reason: 'mission',
  status: 'confirmed', created_at: '2026-10-18T03:00:00Z', ...overrides,
});
const accrual = (overrides: Record<string, unknown> = {}) => ({
  id: requestId(2), user_id: 'u1', period: '2026-10-01', accrued_points: 50,
  ...overrides,
});
const oldRequests = () => Array.from({ length: 25 }, (_, index) => request({
  id: requestId(index + 1), status: 'fulfilled', code: `CODE-${index + 1}`,
}));

describe('Points exchange flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockLoadFails = false;
    mockPageLoadFails = false;
    mockPageReturnsNull = false;
    mockTargetLoadFails = false;
    mockTargetOverride = undefined;
    mockDelayPages = false;
    mockDeferredPage = null;
    mockUserId = 'u1';
    mockAuthUnavailable = false;
    mockTables = {
      point_wallets: wallet(),
      point_ledger: [], exchange_items: [item()], exchange_requests: [],
      user_vip: { user_id: 'u1', xp: 100, tier_name: 'Bronze', staking_rate_bps: 100 },
      staking_accruals: [], wallet_expiry: { user_id: 'u1', expires_on: null },
    };
    mockRpc.mockResolvedValue({ data: { ok: true, status: 'processing', request_id: requestId(1) }, error: null });
  });

  function confirm() {
    fireEvent.press(screen.getByText('交換を申請'));
  }

  it('確認前は申請せず、確認後は最新残高と申請履歴へ切り替わる', async () => {
    mockRpc.mockImplementation(async () => {
      mockTables.point_wallets = wallet({ balance: 4000, lifetime_spent: 1000 });
      mockTables.exchange_requests = [request()];
      return { data: { ok: true, status: 'processing', request_id: requestId(1) }, error: null };
    });
    render(<Points />);
    await waitFor(() => expect(screen.getByText('交換')).toBeTruthy());
    fireEvent.press(screen.getByText('交換'));
    expect(screen.getByText('交換の確認')).toBeTruthy();
    expect(screen.getByText('交換後の残高: 4,000 P')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
    await act(async () => { confirm(); });
    await waitFor(() => expect(screen.getByText('確認中')).toBeTruthy());
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('request_exchange', { p_item_id: 'item1' });
    expect(screen.getByText(/4,000/)).toBeTruthy();
    expect(screen.getByText(/「ゲームチケット」を交換申請しました/)).toBeTruthy();
  });

  it('申請が通信例外になっても操作可能に戻り、成功案内を出さない', async () => {
    mockRpc.mockRejectedValue(new Error('offline'));
    render(<Points />);
    await waitFor(() => expect(screen.getByText('交換')).toBeTruthy());
    fireEvent.press(screen.getByText('交換'));
    await act(async () => { confirm(); });
    await waitFor(() => expect(screen.getByText(/通信結果を確認できませんでした/)).toBeTruthy());
    expect(screen.getByText('交換申請')).toBeTruthy();
    expect(screen.queryByText(/「ゲームチケット」を交換申請しました/)).toBeNull();
    fireEvent.press(screen.getByText('交換履歴を確認 ›'));
    expect(screen.getByText('交換申請')).toBeTruthy();
  });

  it('確認画面をキャンセルした場合はポイント交換を申請しない', async () => {
    render(<Points />);
    await waitFor(() => expect(screen.getByText('交換')).toBeTruthy());
    fireEvent.press(screen.getByText('交換'));
    expect(screen.getByText('交換の確認')).toBeTruthy();
    fireEvent.press(screen.getByText('キャンセル'));
    expect(screen.queryByText('交換の確認')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('確認画面の後にアカウントが変われば交換申請を送らない', async () => {
    render(<Points />);
    await screen.findByText('交換');
    fireEvent.press(screen.getByText('交換'));
    mockUserId = 'u2';
    await act(async () => { confirm(); });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(screen.queryByText(/「ゲームチケット」を交換申請しました/)).toBeNull();
    await screen.findByText(/データの取得に失敗しました/);
  });

  it('送信中にアカウントが変われば古い申請の成功を表示しない', async () => {
    let finish!: (result: { data: { ok: boolean; status: string; request_id: string }; error: null }) => void;
    mockRpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Points />);
    await screen.findByText('交換');
    fireEvent.press(screen.getByText('交換'));
    await act(async () => { confirm(); });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    mockUserId = 'u2';
    await act(async () => { finish({ data: { ok: true, status: 'processing', request_id: requestId(1) }, error: null }); });
    expect(screen.queryByText(/「ゲームチケット」を交換申請しました/)).toBeNull();
    await screen.findByText(/データの取得に失敗しました/);
  });

  it('送信前に本人確認できなければ未申請と案内する', async () => {
    render(<Points />);
    await screen.findByText('交換');
    fireEvent.press(screen.getByText('交換'));
    mockAuthUnavailable = true;
    await act(async () => { confirm(); });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(screen.getByText(/交換は申請していません/)).toBeTruthy();
  });

  it('送信中に同一アカウントの画面を更新したら古い成功を表示しない', async () => {
    let finish!: (result: { data: { ok: boolean; status: string; request_id: string }; error: null }) => void;
    mockRpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Points />);
    await screen.findByText('交換');
    fireEvent.press(screen.getByText('交換'));
    await act(async () => { confirm(); });
    await act(async () => { await screen.UNSAFE_getByType(RefreshControl).props.onRefresh(); });
    await act(async () => { finish({ data: { ok: true, status: 'processing', request_id: requestId(1) }, error: null }); });
    expect(screen.queryByText(/「ゲームチケット」を交換申請しました/)).toBeNull();
    expect(screen.getByText(/画面の情報が更新されました/)).toBeTruthy();
  });

  it('送信中のアカウント切替と通信失敗が重なっても古い申請案内を出さない', async () => {
    let fail!: (reason: Error) => void;
    mockRpc.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    render(<Points />);
    await screen.findByText('交換');
    fireEvent.press(screen.getByText('交換'));
    await act(async () => { confirm(); });
    mockUserId = 'u2';
    await act(async () => { fail(new Error('offline')); });
    expect(screen.queryByText(/通信結果を確認できませんでした/)).toBeNull();
    expect(screen.getByText(/ログイン状態が変わりました/)).toBeTruthy();
  });

  it('申請中は別の商品を押しても追加の確認や申請を開始しない', async () => {
    let finish!: (result: { data: { ok: boolean; status: string; request_id: string }; error: null }) => void;
    mockRpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    mockTables.exchange_items = [item(), item({ id: 'item2', name: '別のチケット' })];
    render(<Points />);
    await waitFor(() => expect(screen.getAllByText('交換')).toHaveLength(2));
    fireEvent.press(screen.getAllByText('交換')[0]);
    await act(async () => { confirm(); });
    expect(screen.getByText('申請中…')).toBeTruthy();
    fireEvent.press(screen.getByText('交換'));
    expect(screen.queryByText('交換の確認')).toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ data: { ok: true, status: 'processing', request_id: requestId(1) }, error: null }); });
    expect(screen.getByText(/「ゲームチケット」を交換申請しました/)).toBeTruthy();
  });

  it.each([
    null,
    { ok: false, status: 'processing', request_id: requestId(1) },
    { ok: true, status: 'processing', request_id: 'invalid' },
  ])('応答が不確かな場合は成功扱いせず履歴確認を案内する: %p', async (data) => {
    mockRpc.mockResolvedValue({ data, error: null });
    render(<Points />);
    await waitFor(() => expect(screen.getByText('交換')).toBeTruthy());
    fireEvent.press(screen.getByText('交換'));
    await act(async () => { confirm(); });
    expect(screen.getByText(/交換申請の結果を確認できませんでした/)).toBeTruthy();
    expect(screen.getByText('交換申請')).toBeTruthy();
    expect(screen.queryByText(/「ゲームチケット」を交換申請しました/)).toBeNull();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('在庫切れの申請エラーは画面内で案内し、在庫を再取得する', async () => {
    mockRpc.mockImplementation(async () => {
      mockTables.exchange_items = [item({ stock: 0 })];
      return { data: null, error: { message: 'out of stock' } };
    });
    render(<Points />);
    await waitFor(() => expect(screen.getByText('交換')).toBeTruthy());
    fireEvent.press(screen.getByText('交換'));
    await act(async () => { confirm(); });
    expect(screen.getByText(/このアイテムは売り切れました/)).toBeTruthy();
    expect(screen.queryByText('交換')).toBeNull();
    expect(screen.queryByText('ミッションでポイントをためる ›')).toBeNull();
  });

  it('残高不足の目標は売り切れを除いた最安商品にして、ミッションへ案内する', async () => {
    mockTables.point_wallets = wallet({ balance: 1000 });
    mockTables.exchange_items = [
      item({ id: 'soldout', name: '売り切れ', cost_points: 1500, stock: 0 }),
      item({ id: 'next', name: '次の目標', cost_points: 3000 }),
      item({ id: 'later', name: '高額アイテム', cost_points: 10000 }),
    ];
    render(<Points />);
    await waitFor(() => expect(screen.getByText(/「次の目標」まであと/)).toBeTruthy());
    expect(screen.queryByText(/「売り切れ」まであと/)).toBeNull();
    fireEvent.press(screen.getByText('ミッションでポイントをためる ›'));
    expect(mockPush).toHaveBeenCalledWith('/missions');
  });

  it('履歴リンクでは完了した本人のコードだけを表示する', async () => {
    mockParams = { section: 'history' };
    mockTables.exchange_requests = [
      request({ id: requestId(1), status: 'fulfilled', code: 'RECEIVED-CODE' }),
      request({ id: requestId(2), code: 'NOT-YET-READY' }),
      request({ id: requestId(3), user_id: 'u2', status: 'fulfilled', code: 'OTHER-USER' }),
    ];
    render(<Points />);
    await waitFor(() => expect(screen.getByText('受取コード: RECEIVED-CODE')).toBeTruthy());
    expect(screen.queryByText(/NOT-YET-READY/)).toBeNull();
    expect(screen.queryByText(/OTHER-USER/)).toBeNull();
  });

  it('同時刻の申請が多くてもページ間で重複・欠落させず過去のコードを表示する', async () => {
    mockParams = { section: 'history' };
    mockTables.exchange_requests = oldRequests();
    render(<Points />);
    await waitFor(() => expect(screen.getByText('20件表示')).toBeTruthy());
    expect(screen.getByText('受取コード: CODE-25')).toBeTruthy();
    expect(screen.getByText('受取コード: CODE-6')).toBeTruthy();
    expect(screen.queryByText('受取コード: CODE-5')).toBeNull();
    mockTables.exchange_requests = [request({ id: requestId(999), status: 'fulfilled', code: 'NEW-REQUEST' }), ...oldRequests()];
    fireEvent.press(screen.getByText('以前の交換申請を表示'));
    await waitFor(() => expect(screen.getByText('25件表示')).toBeTruthy());
    expect(screen.getAllByText(/^受取コード: CODE-/)).toHaveLength(25);
    expect(screen.getByText('受取コード: CODE-1')).toBeTruthy();
    expect(screen.queryByText('受取コード: NEW-REQUEST')).toBeNull();
    expect(screen.queryByText('以前の交換申請を表示')).toBeNull();
  });

  it('過去履歴の読込失敗で表示済みコードを失わず、その場で再試行できる', async () => {
    mockParams = { section: 'history' };
    mockTables.exchange_requests = oldRequests();
    mockPageLoadFails = true;
    render(<Points />);
    await waitFor(() => expect(screen.getByText('20件表示')).toBeTruthy());
    fireEvent.press(screen.getByText('以前の交換申請を表示'));
    await waitFor(() => expect(screen.getByText(/過去の交換申請を読み込めませんでした/)).toBeTruthy());
    expect(screen.getAllByText(/^受取コード: CODE-/)).toHaveLength(20);
    mockPageLoadFails = false;
    fireEvent.press(screen.getByText('もう一度読み込む'));
    await waitFor(() => expect(screen.getByText('25件表示')).toBeTruthy());
    expect(screen.queryByText(/過去の交換申請を読み込めませんでした/)).toBeNull();
  });

  it('追加ページが空応答でも残りの履歴が無いと断定せず再試行できる', async () => {
    mockParams = { section: 'history' };
    mockTables.exchange_requests = oldRequests();
    mockPageReturnsNull = true;
    render(<Points />);
    await screen.findByText('20件表示');
    fireEvent.press(screen.getByText('以前の交換申請を表示'));
    await screen.findByText(/過去の交換申請を読み込めませんでした/);
    expect(screen.getAllByText(/^受取コード: CODE-/)).toHaveLength(20);
    mockPageReturnsNull = false;
    fireEvent.press(screen.getByText('もう一度読み込む'));
    await screen.findByText('25件表示');
  });

  it('追加ページに不正な申請が混じる場合は表示済み履歴を保って再試行できる', async () => {
    mockParams = { section: 'history' };
    mockTables.exchange_requests = oldRequests().map((entry) => entry.id === requestId(1)
      ? { ...entry, cost_points: -1, code: 'INVALID-PAGE-CODE' } : entry);
    render(<Points />);
    await screen.findByText('20件表示');
    fireEvent.press(screen.getByText('以前の交換申請を表示'));
    await screen.findByText(/過去の交換申請を読み込めませんでした/);
    expect(screen.getByText('20件表示')).toBeTruthy();
    expect(screen.queryByText('受取コード: INVALID-PAGE-CODE')).toBeNull();
    mockTables.exchange_requests = oldRequests();
    fireEvent.press(screen.getByText('もう一度読み込む'));
    await screen.findByText('25件表示');
    expect(screen.getByText('受取コード: CODE-1')).toBeTruthy();
  });

  it('全体更新の失敗では古い受取コードと履歴を表示しない', async () => {
    mockParams = { section: 'history' };
    mockTables.exchange_requests = [request({ status: 'fulfilled', code: 'PRIVATE-CODE' })];
    render(<Points />);
    await screen.findByText('受取コード: PRIVATE-CODE');
    mockLoadFails = true;
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('受取コード: PRIVATE-CODE')).toBeNull();
    expect(screen.queryByText('1件表示')).toBeNull();
    expect(screen.getAllByText('— P').length).toBeGreaterThan(0);
  });

  it.each([
    ledgerEntry({ delta: '100' }),
    ledgerEntry({ status: 'unknown' }),
    ledgerEntry({ created_at: 'not-a-date' }),
  ])('不正な台帳行は履歴・推移へ渡さず、再読込で回復する: %p', async (invalidEntry) => {
    mockParams = { section: 'history' };
    mockTables.point_ledger = [invalidEntry];
    render(<Points />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('＋100 P')).toBeNull();
    expect(screen.queryByText('ポイント履歴はまだありません。')).toBeNull();
    mockTables.point_ledger = [ledgerEntry()];
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText('＋100 P');
  });

  it.each([
    { table: 'user_vip', invalid: { user_id: 'u2', xp: 100, tier_name: 'Bronze', staking_rate_bps: 100 } },
    { table: 'user_vip', invalid: { user_id: 'u1', xp: 100, tier_name: 'Bronze', staking_rate_bps: '100' } },
    { table: 'staking_accruals', invalid: [accrual({ accrued_points: '50' })] },
    { table: 'wallet_expiry', invalid: { user_id: 'u2', expires_on: '2026-11-01' } },
  ])('不正なVIP・付与・失効情報を表示せず、再読込で回復する: $table', async ({ table, invalid }) => {
    mockParams = { section: 'history' };
    const valid = mockTables[table];
    mockTables[table] = invalid;
    render(<Points />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText(/現在の月利/)).toBeNull();
    expect(screen.queryByText('＋50 P')).toBeNull();
    mockTables[table] = valid;
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText(/現在の月利/);
  });

  it('本人の保有ボーナスだけを表示する', async () => {
    mockParams = { section: 'history' };
    mockTables.staking_accruals = [accrual(), accrual({ id: requestId(3), user_id: 'u2', accrued_points: 999 })];
    render(<Points />);
    await screen.findByText('＋50 P');
    expect(screen.queryByText('＋999 P')).toBeNull();
  });

  it('初回履歴に不正な申請が混じる場合はコードを表示せず、再読込で回復する', async () => {
    mockParams = { section: 'history' };
    mockTables.exchange_requests = [request({ status: 'fulfilled', code: 'INVALID-INITIAL-CODE', cost_points: -1 })];
    render(<Points />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('受取コード: INVALID-INITIAL-CODE')).toBeNull();
    mockTables.exchange_requests = [request({ status: 'fulfilled', code: 'VALID-CODE' })];
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText('受取コード: VALID-CODE');
  });

  it('通知が指す古い申請は直近20件より前でも先頭に表示し、追加読込時も重複させない', async () => {
    mockParams = { section: 'history', request_id: requestId(1) };
    mockTables.exchange_requests = oldRequests();
    render(<Points />);
    await waitFor(() => expect(screen.getByText('通知の交換申請')).toBeTruthy());
    expect(screen.getByText('受取コード: CODE-1')).toBeTruthy();
    expect(screen.getByText('21件表示')).toBeTruthy();
    fireEvent.press(screen.getByText('以前の交換申請を表示'));
    await waitFor(() => expect(screen.getByText('25件表示')).toBeTruthy());
    expect(screen.getAllByText('受取コード: CODE-1')).toHaveLength(1);
  });

  it('別ユーザーの申請IDをURLへ指定しても本人の通常履歴だけを表示する', async () => {
    mockParams = { section: 'history', request_id: requestId(999) };
    mockTables.exchange_requests = [
      ...oldRequests(), request({ id: requestId(999), user_id: 'u2', status: 'fulfilled', code: 'PRIVATE-CODE' }),
    ];
    render(<Points />);
    await waitFor(() => expect(screen.getByText(/指定された交換申請が見つかりませんでした/)).toBeTruthy());
    expect(screen.getByText('20件表示')).toBeTruthy();
    expect(screen.queryByText(/PRIVATE-CODE/)).toBeNull();
  });

  it('通知の申請だけ取得できなくても通常の履歴を表示し続ける', async () => {
    mockParams = { section: 'history', request_id: requestId(1) };
    mockTables.exchange_requests = oldRequests();
    mockTargetLoadFails = true;
    render(<Points />);
    await waitFor(() => expect(screen.getByText(/通知の交換申請を取得できませんでした/)).toBeTruthy());
    expect(screen.getByText('20件表示')).toBeTruthy();
    expect(screen.queryByText('再読み込み')).toBeNull();
  });

  it.each([
    request({ id: requestId(1), status: 'fulfilled', code: 'UNVERIFIED-CODE', cost_points: -1 }),
    request({ id: requestId(999), status: 'fulfilled', code: 'WRONG-ID-CODE' }),
    request({ id: requestId(1), user_id: 'u2', status: 'fulfilled', code: 'WRONG-USER-CODE' }),
  ])('通知先の不正・別ID・別ユーザー応答は受取コードを表示せず通常履歴を維持する: %p', async (target) => {
    mockParams = { section: 'history', request_id: requestId(1) };
    mockTables.exchange_requests = [request({ id: requestId(2), status: 'fulfilled', code: 'OWN-CODE' })];
    mockTargetOverride = target;
    render(<Points />);
    await screen.findByText(/通知の交換申請を取得できませんでした/);
    expect(screen.getByText('受取コード: OWN-CODE')).toBeTruthy();
    expect(screen.queryByText(/UNVERIFIED-CODE|WRONG-ID-CODE|WRONG-USER-CODE/)).toBeNull();
    expect(screen.queryByText('通知の交換申請')).toBeNull();
  });

  it('不正な申請IDでも画面を壊さず、本人の履歴を確認できる', async () => {
    mockParams = { section: 'history', request_id: 'invalid&section=exchange' };
    mockTables.exchange_requests = oldRequests();
    mockTargetLoadFails = true;
    render(<Points />);
    await waitFor(() => expect(screen.getByText(/指定された交換申請が見つかりませんでした/)).toBeTruthy());
    expect(screen.getByText('20件表示')).toBeTruthy();
    expect(screen.queryByText('再読み込み')).toBeNull();
  });

  it('更新前の追加読込が後から完了しても更新済み履歴へ混入させない', async () => {
    mockParams = { section: 'history' };
    mockTables.exchange_requests = oldRequests();
    mockDelayPages = true;
    render(<Points />);
    await waitFor(() => expect(screen.getByText('20件表示')).toBeTruthy());
    fireEvent.press(screen.getByText('以前の交換申請を表示'));
    await waitFor(() => expect(mockDeferredPage).not.toBeNull());
    mockTables.exchange_requests = [request({ id: requestId(999), status: 'fulfilled', code: 'REFRESHED' })];
    await act(async () => { await screen.UNSAFE_getByType(RefreshControl).props.onRefresh(); });
    expect(screen.getByText('受取コード: REFRESHED')).toBeTruthy();
    await act(async () => { mockDeferredPage?.(); });
    expect(screen.getByText('1件表示')).toBeTruthy();
    expect(screen.queryAllByText(/^受取コード: CODE-/)).toHaveLength(0);
  });

  it('読み込み失敗をアイテム未登録として表示しない', async () => {
    mockLoadFails = true;
    render(<Points />);
    await waitFor(() => expect(screen.getByText('再読み込み')).toBeTruthy());
    expect(screen.queryByText('現在交換できるアイテムはありません。')).toBeNull();
    expect(screen.queryByText('ミッションでポイントをためる ›')).toBeNull();
  });

  it('残高が空応答なら0Pと表示せず交換を許可しない', async () => {
    mockTables.point_wallets = null;
    render(<Points />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.getAllByText('— P').length).toBeGreaterThan(0);
    expect(screen.queryByText('5,000 P')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalledWith('request_exchange', expect.anything());
  });

  it.each([
    wallet({ user_id: 'u2' }),
    wallet({ lifetime_earned: '5000' }),
    wallet({ lifetime_spent: -1 }),
  ])('本人以外・不正な累計値の残高を表示せず、再読込で回復する: %p', async (invalidWallet) => {
    mockTables.point_wallets = invalidWallet;
    render(<Points />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.getAllByText('— P').length).toBeGreaterThan(0);
    expect(screen.queryByText('5,000 P')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
    mockTables.point_wallets = wallet();
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText('交換');
    expect(screen.queryByText('— P')).toBeNull();
  });

  it('交換商品一覧が不正な応答なら空の一覧と扱わない', async () => {
    mockTables.exchange_items = { invalid: true };
    render(<Points />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('現在交換できるアイテムはありません。')).toBeNull();
  });

  it.each([
    item({ cost_points: -1 }),
    item({ cost_points: '1000' }),
    item({ stock: -2 }),
    item({ name: '' }),
  ])('不正な交換商品は表示・申請せず、再読込で回復する: %p', async (invalidItem) => {
    mockTables.exchange_items = [invalidItem];
    render(<Points />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('ゲームチケット')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalledWith('request_exchange', expect.anything());
    mockTables.exchange_items = [item()];
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText('ゲームチケット');
    expect(screen.getByText('1,000 P', { exact: false })).toBeTruthy();
  });
});
