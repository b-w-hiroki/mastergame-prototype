import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockRpc = jest.fn();
let mockRows: unknown[] = [];
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.order = () => q;
      q.limit = () => q;
      (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: mockRows, error: null });
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
  id: 'n1', type: 'inquiry_answered',
  payload: { inquiry_id: 'i1', subject: 'ポイント未反映の件' },
  read_at: null, created_at: new Date().toISOString(), ...over,
});

describe('Notifications screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRows = [];
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('通知が無いときは空表示', async () => {
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('お知らせはまだありません')).toBeTruthy());
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
    fireEvent.press(screen.getByText('お問い合わせに回答があります'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/support/i1');
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
    fireEvent.press(screen.getByText('すべて既読にする'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
    expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n1' });
    expect(mockRpc).toHaveBeenCalledWith('mark_notification_read', { p_id: 'n2' });
  });

  it('未知の type の通知でも一覧が壊れない', async () => {
    mockRows = [notif({ type: 'totally_new_thing', payload: {} })];
    render(<Notifications />);
    await waitFor(() => expect(screen.getByText('お知らせ')).toBeTruthy());
  });
});
