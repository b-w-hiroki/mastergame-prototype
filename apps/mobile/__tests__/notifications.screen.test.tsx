import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { RefreshControl } from 'react-native';

const mockRpc = jest.fn();
let mockRows: unknown = [];
let mockLoadFails = false;
let mockUserId = 'u1';
let mockAuthIds: string[] | null = null;
let mockAuthFails = false;
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => {
      if (mockAuthFails) return { data: { user: null }, error: { message: 'offline' } };
      const id = mockAuthIds?.shift() ?? mockUserId;
      return { data: { user: { id } }, error: null };
    } },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => {
      let rows = mockRows;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.eq = (key: string, value: unknown) => {
        if (Array.isArray(rows)) rows = rows.filter((row) => row[key] === value);
        return q;
      };
      (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve(mockLoadFails
        ? { data: null, error: { message: 'offline' } }
        : { data: rows, error: null });
      return q;
    },
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));

import Notifications from '../app/notifications';

const notif = (over: Record<string, unknown> = {}) => ({
  id: 'n1', user_id: 'u1', type: 'inquiry_answered',
  payload: { inquiry_id: 'i1', subject: 'ポイント未反映の件' },
  read_at: null, created_at: new Date().toISOString(), ...over,
});

describe('Notifications screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRows = [];
    mockLoadFails = false;
    mockUserId = 'u1';
    mockAuthIds = null;
    mockAuthFails = false;
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('通知が無いときは空表示', async () => {
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('お知らせはまだありません')).toBeTruthy());
  });

  it.each([null, { invalid: true }])('通知一覧の不正応答は正常な0件と区別する: %p', async (rows) => {
    mockRows = rows;
    render(<Notifications />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('お知らせはまだありません')).toBeNull();
    expect(screen.queryByText('すべて既読にする')).toBeNull();
  });

  it('本人以外の通知は一覧と既読操作へ渡さない', async () => {
    mockRows = [notif(), notif({ id: 'n2', user_id: 'u2', payload: { subject: '他人の通知' } })];
    render(<Notifications />);
    await screen.findByText('ポイント未反映の件');
    expect(screen.queryByText('他人の通知')).toBeNull();
    expect(screen.getByText('未読 1 件')).toBeTruthy();
  });

  it('通知の取得中にアカウントが変われば旧通知を表示しない', async () => {
    mockRows = [notif()];
    mockAuthIds = ['u1', 'u2'];
    render(<Notifications />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('ポイント未反映の件')).toBeNull();
    expect(screen.queryByText('お知らせはまだありません')).toBeNull();
    expect(screen.queryByText('すべて既読にする')).toBeNull();
  });

  it.each([
    notif({ payload: ['invalid'] }),
    notif({ read_at: 'invalid-date' }),
    notif({ type: '' }),
  ])('不正な通知行を空一覧として表示せず再読込で回復する: %p', async (invalid) => {
    mockRows = [invalid];
    render(<Notifications />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('お知らせはまだありません')).toBeNull();
    expect(screen.queryByText('すべて既読にする')).toBeNull();
    mockRows = [notif()];
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText('ポイント未反映の件');
  });

  it('本人確認に失敗したら古い通知を消し、既読操作を止める', async () => {
    mockRows = [notif()];
    render(<Notifications />);
    await screen.findByText('ポイント未反映の件');
    mockAuthFails = true;
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('ポイント未反映の件')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('再読込失敗時は古い通知と既読操作を残さない', async () => {
    mockRows = [notif()];
    render(<Notifications />);
    await screen.findByText('お問い合わせに回答があります');
    mockLoadFails = true;
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('お問い合わせに回答があります')).toBeNull();
    expect(screen.queryByText('すべて既読にする')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('通知を種別に応じた文言で一覧表示する', async () => {
    mockRows = [
      notif(),
      notif({ id: 'n2', type: 'point_expiry_notice', payload: { balance: 5000, expires_on: '2026-09-01' }, read_at: '2026-08-01T00:00:00Z' }),
    ];
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('お問い合わせに回答があります')).toBeTruthy());
    expect(screen.getByText('ポイント未反映の件')).toBeTruthy();
    expect(screen.getByText('ポイントの有効期限が近づいています')).toBeTruthy();
    expect(screen.getByText(/5,000 P が 2026年9月1日 に失効します/)).toBeTruthy();
  });

  it('未読件数と「すべて既読にする」を出し、未読が無ければ出さない', async () => {
    mockRows = [notif(), notif({ id: 'n2', read_at: '2026-08-01T00:00:00Z' })];
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('未読 1 件')).toBeTruthy());
    expect(screen.getByText('すべて既読にする')).toBeTruthy();
  });

  it('タップで既読化して該当画面へ遷移する', async () => {
    mockRows = [notif()];
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('お問い合わせに回答があります')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('お問い合わせに回答があります'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/support/i1');
  });

  it('交換完了の通知を押すと既読化して受取コードを確認できる履歴へ移動する', async () => {
    mockRows = [notif({ type: 'exchange_fulfilled', payload: { request_id: 'r1', has_code: true } })];
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('ポイント交換が完了しました')).toBeTruthy());
    expect(screen.getByText('受取コードを交換履歴で確認できます。')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('ポイント交換が完了しました'));
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/points?section=history&request_id=r1'));
    expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' });
  });

  it('既読の通知は再度既読化しない（無駄なRPCを発行しない）', async () => {
    mockRows = [notif({ read_at: '2026-08-01T00:00:00Z' })];
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('お問い合わせに回答があります')).toBeTruthy());
    fireEvent.press(screen.getByText('お問い合わせに回答があります'));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/support/i1'); // 遷移はする
  });

  it('遷移先の無い通知はタップしても遷移しない', async () => {
    mockRows = [notif({ type: 'report_result', payload: {} })];
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('通報の対応が完了しました')).toBeTruthy());
    fireEvent.press(screen.getByText('通報の対応が完了しました'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('「すべて既読にする」で未読の全件に既読RPCを発行する', async () => {
    mockRows = [notif(), notif({ id: 'n2' }), notif({ id: 'n3', read_at: '2026-08-01T00:00:00Z' })];
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('未読 2 件')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('すべて既読にする'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
    expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' });
    expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n2' });
  });

  it('未知の type の通知でも一覧が壊れない', async () => {
    mockRows = [notif({ type: 'totally_new_thing', payload: {} })];
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('お知らせ')).toBeTruthy());
  });

  it('一括既読は成功した通知だけ反映し、失敗分は未読で残す', async () => {
    mockRows = [notif(), notif({ id: 'n2' })];
    mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    render(<Notifications />);
    await screen.findByText('未読 2 件');
    await act(async () => { fireEvent.press(screen.getByText('すべて既読にする')); });
    expect(screen.getByText('未読 1 件')).toBeTruthy();
    expect(screen.getByRole('alert').props.children).toContain('一部');
  });

  it('個別既読のエラー応答を検出して未読へ戻し、遷移は妨げない', async () => {
    mockRows = [notif()];
    mockRpc.mockResolvedValueOnce({ error: { message: 'offline' } });
    render(<Notifications />);
    await screen.findByText('お問い合わせに回答があります');
    await act(async () => { fireEvent.press(screen.getByText('お問い合わせに回答があります')); });
    expect(screen.getByText('未読 1 件')).toBeTruthy();
    expect(screen.getByRole('alert').props.children).toContain('既読の保存に失敗');
    expect(mockPush).toHaveBeenCalledWith('/support/i1');
  });
  it('個別既読のok=falseを失敗として未読へ戻す', async () => {
    mockRows = [notif()];
    mockRpc.mockResolvedValueOnce({ data: { ok: false }, error: null });
    render(<Notifications />);
    await screen.findByText('お問い合わせに回答があります');
    await act(async () => { fireEvent.press(screen.getByText('お問い合わせに回答があります')); });
    expect(screen.getByText('未読 1 件')).toBeTruthy();
    expect(screen.getByRole('alert').props.children).toContain('既読の保存に失敗');
    expect(mockPush).toHaveBeenCalledWith('/support/i1');
  });
  it('アカウント切替後の古い通知からは既読RPCを送らない', async () => {
    mockRows = [notif()];
    render(<Notifications />);
    await screen.findByText('お問い合わせに回答があります');
    mockUserId = 'u2';
    await act(async () => { fireEvent.press(screen.getByText('お問い合わせに回答があります')); });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/support/i1');
  });

  it('個別既読の応答待ちに再読込したら古い失敗を新しい一覧に反映しない', async () => {
    mockRows = [notif()];
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Notifications />);
    await screen.findByText('お問い合わせに回答があります');
    fireEvent.press(screen.getByText('お問い合わせに回答があります'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' }));
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText('未読 1 件');
    await act(async () => { finish({ data: { ok: false }, error: null }); });
    expect(screen.queryByText(/既読の保存に失敗しました/)).toBeNull();
    expect(screen.getByText('未読 1 件')).toBeTruthy();
  });

  it('一括既読の送信中にアカウントが変わったら残りを送信しない', async () => {
    mockRows = [notif(), notif({ id: 'n2' })];
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Notifications />);
    await screen.findByText('未読 2 件');
    fireEvent.press(screen.getByText('すべて既読にする'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    mockUserId = 'u2';
    await act(async () => { finish({ data: { ok: true }, error: null }); });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('一部の既読を保存できませんでした')).toBeNull();
  });

  it('一括既読のok=falseは成功件数に含めない', async () => {
    mockRows = [notif(), notif({ id: 'n2' })];
    mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null })
      .mockResolvedValueOnce({ data: { ok: false }, error: null });
    render(<Notifications />);
    await screen.findByText('未読 2 件');
    await act(async () => { fireEvent.press(screen.getByText('すべて既読にする')); });
    expect(screen.getByText('未読 1 件')).toBeTruthy();
    expect(screen.getByRole('alert').props.children).toContain('一部');
  });
  it('一括処理中に個別通知を開いても同じ既読を重複送信しない', async () => {
    let resolve!: (value: unknown) => void;
    mockRows = [notif(), notif({ id: 'n2', type: 'report_result' })];
    mockRpc.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<Notifications />);
    await screen.findByText('未読 2 件');
    await act(async () => { fireEvent.press(screen.getByText('すべて既読にする')); });
    await act(async () => { fireEvent.press(screen.getByText('お問い合わせに回答があります')); });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ error: { message: 'offline' } }); });
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls.filter(([, args]) => args.p_id === 'n1')).toHaveLength(1);
    expect(screen.getByText('未読 1 件')).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith('/support/i1');
  });
});
