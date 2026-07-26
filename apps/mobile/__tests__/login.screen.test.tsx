import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

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
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('主要な要素（見出し・入力欄・ボタン）を描画する', () => {
    render(<Login />);
    expect(screen.getByText('おかえりなさい')).toBeTruthy();
    expect(screen.getByPlaceholderText('メールアドレス')).toBeTruthy();
    expect(screen.getByPlaceholderText('パスワード')).toBeTruthy();
    expect(screen.getByText('ログイン')).toBeTruthy();
  });

  it('未入力でログインを押すと検証アラートを出し、認証は呼ばない', () => {
    render(<Login />);
    fireEvent.press(screen.getByText('ログイン'));
    expect(Alert.alert).toHaveBeenCalledWith('メールアドレスとパスワードを入力してください');
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

  it('認証失敗時は失敗アラートを表示する', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    render(<Login />);
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), 'a@b.com');
    fireEvent.changeText(screen.getByPlaceholderText('パスワード'), 'x');
    fireEvent.press(screen.getByText('ログイン'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('ログインに失敗しました', 'Invalid login credentials'),
    );
  });

  it('Googleログインで OAuth フローを起動する', () => {
    mockSignInWithOAuth.mockResolvedValue(undefined);
    render(<Login />);
    fireEvent.press(screen.getByText('Googleでログイン'));
    expect(mockSignInWithOAuth).toHaveBeenCalledWith('google');
  });
});
