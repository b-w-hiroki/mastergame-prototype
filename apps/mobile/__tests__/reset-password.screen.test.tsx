import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockInitialURL = jest.fn();
const mockExchange = jest.fn();
const mockSetSession = jest.fn();
const mockUpdate = jest.fn();
const mockGetUser = jest.fn();
const mockAuthChanged = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-linking', () => ({ getInitialURL: () => mockInitialURL() }));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => {
    const { Text } = require('react-native');
    return <Text>{children}</Text>;
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: {
  exchangeCodeForSession: (...a: unknown[]) => mockExchange(...a),
  setSession: (...a: unknown[]) => mockSetSession(...a),
  updateUser: (...a: unknown[]) => mockUpdate(...a),
  getUser: () => mockGetUser(),
  onAuthStateChange: (...a: unknown[]) => mockAuthChanged(...a),
} } }));

import ResetPassword from '../app/reset-password';

async function ready() {
  render(<ResetPassword />);
  await screen.findByPlaceholderText('新しいパスワード');
}
function fill(password = 'new-password123', confirmation = password) {
  fireEvent.changeText(screen.getByPlaceholderText('新しいパスワード'), password);
  fireEvent.changeText(screen.getByPlaceholderText('新しいパスワード（確認）'), confirmation);
}

describe('password recovery', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockParams = {};
    mockInitialURL.mockResolvedValue('https://example.test/reset-password?code=recovery-code');
    mockExchange.mockResolvedValue({ data: { user: { id: 'recovery-user' } }, error: null });
    mockSetSession.mockResolvedValue({ data: { user: { id: 'recovery-user' } }, error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'recovery-user' } }, error: null });
    mockAuthChanged.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
    mockUpdate.mockResolvedValue({ error: null });
  });

  it('PKCE の認証を待ってからフォームを表示する', async () => {
    await ready();
    expect(mockExchange).toHaveBeenCalledWith('recovery-code');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('起動済みアプリのルートに渡された code を優先する', async () => {
    mockInitialURL.mockResolvedValue('mastergame://home');
    mockParams = { code: 'warm-link-code' };
    await ready();
    expect(mockExchange).toHaveBeenCalledWith('warm-link-code');
  });

  it('旧形式の recovery token も検証する', async () => {
    mockInitialURL.mockResolvedValue('https://example.test/reset-password#type=recovery&access_token=access&refresh_token=refresh');
    await ready();
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' });
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it.each([
    'https://example.test/reset-password',
    'https://example.test/reset-password#error=access_denied',
    'https://example.test/reset-password#type=signup&access_token=access&refresh_token=refresh',
  ])('無効なリンクでは変更できない: %s', async (url) => {
    mockInitialURL.mockResolvedValue(url);
    render(<ResetPassword />);
    await screen.findByRole('alert');
    expect(screen.queryByPlaceholderText('新しいパスワード')).toBeNull();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('期限切れや通信例外を未処理にせず再送を案内する', async () => {
    mockExchange.mockRejectedValue(new Error('expired'));
    render(<ResetPassword />);
    await screen.findByRole('alert');
    expect(screen.getByText('再設定メールを再送する')).toBeTruthy();
  });

  it('短いパスワードと確認不一致は送信しない', async () => {
    await ready();
    fill('short');
    fireEvent.press(screen.getByText('パスワードを変更'));
    expect(screen.getByRole('alert').props.children).toContain('8文字');
    fill('new-password123', 'different');
    fireEvent.press(screen.getByText('パスワードを変更'));
    expect(screen.getByRole('alert').props.children).toContain('一致');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('失敗後は再試行でき、成功後はフォームを閉じる', async () => {
    mockUpdate.mockResolvedValueOnce({ error: { message: 'offline' } });
    await ready();
    fill();
    await act(async () => { fireEvent.press(screen.getByText('パスワードを変更')); });
    expect(screen.getByRole('alert').props.children).toContain('再試行');
    await act(async () => { fireEvent.press(screen.getByText('パスワードを変更')); });
    expect(mockUpdate).toHaveBeenLastCalledWith({ password: 'new-password123' });
    expect(screen.getByText('ホームへ進む')).toBeTruthy();
    expect(screen.queryByPlaceholderText('新しいパスワード')).toBeNull();
  });

  it('送信中の重複更新を防ぐ', async () => {
    let resolve!: (value: { error: null }) => void;
    mockUpdate.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await ready();
    fill();
    fireEvent.press(screen.getByText('パスワードを変更'));
    fireEvent.press(screen.getByText('変更中...'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    await act(async () => { resolve({ error: null }); });
    await waitFor(() => expect(screen.getByText('ホームへ進む')).toBeTruthy());
  });
  it('再設定中に別のアカウントへ変わったら入力を破棄し更新しない', async () => {
    await ready(); fill();
    act(() => { mockAuthChanged.mock.calls[0][0]('SIGNED_IN', { user: { id: 'different-user' } }); });
    expect(screen.queryByPlaceholderText('新しいパスワード')).toBeNull();
    expect(screen.getByRole('alert').props.children).toContain('アカウントが変更');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('変更直前に対象ユーザーを再確認し、不一致なら送信しない', async () => {
    await ready(); fill();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'different-user' } }, error: null });
    await act(async () => { fireEvent.press(screen.getByText('パスワードを変更')); });
    expect(screen.getByRole('alert').props.children).toContain('再設定対象');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
  it('本人確認の通信中にアカウントが変わったら更新を送らない', async () => {
    let resolveUser!: (value: unknown) => void;
    mockGetUser.mockReturnValueOnce(new Promise((done) => { resolveUser = done; }));
    await ready(); fill();
    fireEvent.press(screen.getByText('パスワードを変更'));
    act(() => { mockAuthChanged.mock.calls[0][0]('SIGNED_IN', { user: { id: 'different-user' } }); });
    await act(async () => { resolveUser({ data: { user: { id: 'recovery-user' } }, error: null }); });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').props.children).toContain('アカウントが変更');
  });
  it.each([{ error: null }, { error: { message: 'offline' } }])(
    '更新通信中のアカウント切替では完了表示も切替案内の上書きもしない: %p', async (response) => {
      let resolveUpdate!: (value: unknown) => void;
      mockUpdate.mockReturnValueOnce(new Promise((done) => { resolveUpdate = done; }));
      await ready(); fill();
      fireEvent.press(screen.getByText('パスワードを変更'));
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      act(() => { mockAuthChanged.mock.calls[0][0]('SIGNED_IN', { user: { id: 'different-user' } }); });
      await act(async () => { resolveUpdate(response); });
      expect(screen.queryByText('ホームへ進む')).toBeNull();
      expect(screen.getByRole('alert').props.children).toContain('アカウントが変更');
    },
  );
});
