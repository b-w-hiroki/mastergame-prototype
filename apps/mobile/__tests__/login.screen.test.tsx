import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';

// --- モック（Supabase / OAuth / router を差し替えて画面単体を検証）---
// jest.mock はホイストされるため、ファクトリが参照する変数は `mock` 接頭辞が必須。
const mockSignInWithPassword = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => mockSignInWithPassword(...a) } },
}));
const mockSignInWithOAuth = jest.fn();
jest.mock('@/lib/auth', () => ({ signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a) }));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

import Login from '../app/login';

describe('Login screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('主要な要素（見出し・入力欄・ボタン）を描画する', () => {
    render(<Login />);
    expect(screen.getByText('おかえりなさい')).toBeTruthy();
    expect(screen.getByPlaceholderText('メールアドレス')).toBeTruthy();
    expect(screen.getByPlaceholderText('パスワード')).toBeTruthy();
    expect(screen.getByText('ログイン')).toBeTruthy();
  });

  it('未入力のエラーを画面に表示し、認証は呼ばない', () => {
    render(<Login />);
    fireEvent.press(screen.getByText('ログイン'));
    expect(screen.getByRole('alert').props.children).toBe('メールアドレスとパスワードを入力してください');
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('入力後の送信で signInWithPassword を（trim して）呼ぶ', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });
    render(<Login />);
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), '  player@example.com  ');
    fireEvent.changeText(screen.getByPlaceholderText('パスワード'), 'password123');
    fireEvent.press(screen.getByText('ログイン'));
    await waitFor(() =>
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'player@example.com',
        password: 'password123',
      }),
    );
  });

  it('認証失敗時は次の行動が分かるエラーを表示する', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<Login />);
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), 'a@b.com');
    fireEvent.changeText(screen.getByPlaceholderText('パスワード'), 'x');
    fireEvent.press(screen.getByText('ログイン'));
    await waitFor(() =>
      expect(screen.getByRole('alert').props.children).toContain('新規アカウント作成'),
    );
  });

  it('Googleログインで OAuth フローを起動する', async () => {
    mockSignInWithOAuth.mockResolvedValue(undefined);
    render(<Login />);
    await act(async () => { fireEvent.press(screen.getByText('Googleでログイン')); });
    expect(mockSignInWithOAuth).toHaveBeenCalledWith('google');
  });

  it('メール形式の誤りを送信前に検出する', () => {
    render(<Login />);
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), 'not-an-email');
    fireEvent.changeText(screen.getByPlaceholderText('パスワード'), 'password123');
    fireEvent.press(screen.getByText('ログイン'));
    expect(screen.getByRole('alert').props.children).toContain('形式');
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it('通信例外の後も再試行でき、前のエラーが消える', async () => {
    mockSignInWithPassword.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ error: null });
    render(<Login />);
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), 'a@b.com');
    fireEvent.changeText(screen.getByPlaceholderText('パスワード'), 'password123');
    await act(async () => { fireEvent.press(screen.getByText('ログイン')); });
    expect(screen.getByRole('alert').props.children).toContain('通信に失敗');
    await act(async () => { fireEvent.press(screen.getByText('ログイン')); });
    expect(mockSignInWithPassword).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('認証中は連打と別方式の認証を抑止する', async () => {
    let resolve!: (value: { error: null }) => void;
    mockSignInWithPassword.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<Login />);
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), 'a@b.com');
    fireEvent.changeText(screen.getByPlaceholderText('パスワード'), 'password123');
    fireEvent.press(screen.getByText('ログイン'));
    fireEvent.press(screen.getByText('認証中...'));
    fireEvent.press(screen.getByText('Googleでログイン'));
    expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
    await act(async () => { resolve({ error: null }); });
    expect(screen.getByText('ログイン')).toBeTruthy();
  });

  it('未確認メールと OAuth 失敗も画面上に案内する', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: { message: 'Email not confirmed' } });
    mockSignInWithOAuth.mockRejectedValueOnce(new Error('provider unavailable'));
    render(<Login />);
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), 'a@b.com');
    fireEvent.changeText(screen.getByPlaceholderText('パスワード'), 'password123');
    await act(async () => { fireEvent.press(screen.getByText('ログイン')); });
    expect(screen.getByRole('alert').props.children).toContain('迷惑メール');
    await act(async () => { fireEvent.press(screen.getByText('Appleでログイン')); });
    expect(screen.getByRole('alert').props.children).toContain('外部サービス');
    expect(screen.getByText('ログイン')).toBeTruthy();
  });
});
