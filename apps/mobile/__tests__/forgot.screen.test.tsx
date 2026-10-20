import { act, fireEvent, render, screen } from '@testing-library/react-native';
const mockReset = jest.fn();
jest.mock('expo-linking', () => ({ createURL: (path: string) => `https://example.test/${path}` }));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: {
  resetPasswordForEmail: (...a: unknown[]) => mockReset(...a),
} } }));
import Forgot from '../app/forgot';

describe('recovery mail', () => {
  beforeEach(() => { jest.resetAllMocks(); mockReset.mockResolvedValue({ error: null }); });
  it('空欄と不正な形式は送信しない', () => {
    render(<Forgot />);
    fireEvent.press(screen.getByText('再設定メールを送信'));
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), 'invalid');
    fireEvent.press(screen.getByText('再設定メールを送信'));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();
  });
  it('空白を除いた宛先と実在する再設定ルートを指定する', async () => {
    render(<Forgot />);
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), '  a@example.test  ');
    await act(async () => { fireEvent.press(screen.getByText('再設定メールを送信')); });
    expect(mockReset).toHaveBeenCalledWith('a@example.test', { redirectTo: 'https://example.test/reset-password' });
    expect(screen.getByText(/登録済みの場合/)).toBeTruthy();
  });
  it.each(['response', 'exception'])('送信失敗後に再試行できる: %s', async (kind) => {
    if (kind === 'response') mockReset.mockResolvedValueOnce({ error: { message: 'rate limit' } });
    else mockReset.mockRejectedValueOnce(new Error('offline'));
    render(<Forgot />);
    fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), 'a@example.test');
    await act(async () => { fireEvent.press(screen.getByText('再設定メールを送信')); });
    expect(screen.getByRole('alert')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText('再設定メールを送信')); });
    expect(mockReset).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/登録済みの場合/)).toBeTruthy();
  });
});
