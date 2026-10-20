import { act, render, waitFor } from '@testing-library/react-native';
const mockReplace = jest.fn();
const mockGetSession = jest.fn();
const mockAuthChange = jest.fn();
const mockGenres = jest.fn();
const mockRegisterDevice = jest.fn();
const mockStackMount = jest.fn();
let mockSegment = 'reset-password';
jest.mock('expo-router', () => ({
  Stack: () => {
    const { useEffect } = require('react');
    useEffect(() => { mockStackMount(); }, []);
    return null;
  },
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => [mockSegment],
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaProvider: View };
});
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: {
    getSession: () => mockGetSession(),
    onAuthStateChange: (...a: unknown[]) => mockAuthChange(...a),
  },
  from: () => ({ select: () => ({ eq: (...a: unknown[]) => mockGenres(...a) }) }),
} }));
jest.mock('@/lib/push', () => ({ registerPushToken: () => Promise.resolve() }));
jest.mock('@/lib/device', () => ({ registerDevice: () => mockRegisterDevice() }));
jest.mock('@/components/AccountSetupGate', () => ({ AccountSetupGate: () => null }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), flushEvents: jest.fn(), setAnalyticsUser: jest.fn(), EVENTS: {} }));
import RootLayout from '../app/_layout';

describe('auth navigation gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegment = 'reset-password';
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockAuthChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
    mockGenres.mockResolvedValue({ count: 1, error: null });
    mockRegisterDevice.mockResolvedValue(undefined);
  });
  it.each([null, { user: { id: 'player' } }])('再設定中はセッションの有無で移動させない: %s', async (session) => {
    mockGetSession.mockResolvedValue({ data: { session } });
    render(<RootLayout />);
    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('再設定リンクの認証イベント後もフォームに留まる', async () => {
    render(<RootLayout />);
    await act(async () => {});
    await act(async () => {
      const callback = mockAuthChange.mock.calls[0][0];
      expect(callback('PASSWORD_RECOVERY', { user: { id: 'player' } })).toBeUndefined();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('再送画面はログイン済みでも利用できる', async () => {
    mockSegment = 'forgot';
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'player' } } } });
    render(<RootLayout />);
    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalled();
  });
  it('通常の未認証画面は引き続きログインへ移動する', async () => {
    mockSegment = '(tabs)';
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });
  it('初期セッション取得の例外でも未処理のまま停止しない', async () => {
    mockSegment = '(tabs)';
    mockGetSession.mockRejectedValueOnce(new Error('offline'));
    render(<RootLayout />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
  });
  it.each(['legal', 'auth-callback'])('未認証でも必要な公開ルートへアクセスできる: %s', async (segment) => {
    mockSegment = segment;
    render(<RootLayout />);
    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('遅い起動時の未認証結果が、新しいログインイベントを上書きしない', async () => {
    mockSegment = '(tabs)';
    let resolve!: (value: unknown) => void;
    mockGetSession.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<RootLayout />);
    await act(async () => {
      mockAuthChange.mock.calls[0][0]('SIGNED_IN', { user: { id: 'new-player' } });
    });
    await act(async () => { resolve({ data: { session: null } }); });
    expect(mockGenres).toHaveBeenCalledWith('user_id', 'new-player');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('アカウント切替後に古いジャンル取得が戻っても現在の判定を変えない', async () => {
    mockSegment = '(tabs)';
    let resolveOld!: (value: unknown) => void;
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'old-player' } } } });
    mockGenres.mockReturnValueOnce(new Promise((done) => { resolveOld = done; }));
    render(<RootLayout />);
    await act(async () => {});
    await act(async () => { mockAuthChange.mock.calls[0][0]('SIGNED_IN', { user: { id: 'new-player' } }); });
    await act(async () => { resolveOld({ count: 0, error: null }); });
    expect(mockReplace).not.toHaveBeenCalledWith('/onboarding');
  });

  it('設定の判定中にログイン画面からホームへ先走って移動しない', async () => {
    mockSegment = 'login';
    let resolve!: (value: unknown) => void;
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'player' } } } });
    mockGenres.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<RootLayout />);
    await act(async () => {});
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => { resolve({ count: 0, error: null }); });
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    expect(mockReplace).not.toHaveBeenCalledWith('/');
    expect(mockGenres).toHaveBeenCalledTimes(1);
  });

  it('同じユーザーのトークン更新で端末登録とジャンル取得を繰り返さない', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'player' } } } });
    render(<RootLayout />);
    await act(async () => {});
    await act(async () => { mockAuthChange.mock.calls[0][0]('TOKEN_REFRESHED', { user: { id: 'player' } }); });
    expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
    expect(mockGenres).toHaveBeenCalledTimes(1);
  });
  it('通常画面はアカウント切替時に作り直し、画面のローカル状態を持ち越さない', async () => {
    mockSegment = '(tabs)';
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'first' } } } });
    render(<RootLayout />);
    await act(async () => {});
    const mounts = mockStackMount.mock.calls.length;
    await act(async () => { mockAuthChange.mock.calls[0][0]('SIGNED_IN', { user: { id: 'second' } }); });
    expect(mockStackMount).toHaveBeenCalledTimes(mounts + 1);
  });
  it.each(['reset-password', 'auth-callback'])('認証成立時も一度限りのcode処理画面を作り直さない: %s', async (segment) => {
    mockSegment = segment;
    render(<RootLayout />);
    await act(async () => {});
    const mounts = mockStackMount.mock.calls.length;
    await act(async () => { mockAuthChange.mock.calls[0][0]('PASSWORD_RECOVERY', { user: { id: 'player' } }); });
    expect(mockStackMount).toHaveBeenCalledTimes(mounts);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
