import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockSignUp = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signUp: (...a: unknown[]) => mockSignUp(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

import SignUp from '../app/signup';

const DOCS = [
  { slug: 'terms', version: '2026-07-01', requires_consent: true },
  { slug: 'privacy', version: '2026-07-01', requires_consent: true },
  { slug: 'tokushoho', version: '2026-07-01', requires_consent: false },
];

function fill(overrides: Partial<Record<'email' | 'pw' | 'pw2' | 'y' | 'm' | 'd', string>> = {}) {
  const v = { email: 'a@b.com', pw: 'password123', pw2: 'password123', y: '2000', m: '1', d: '1', ...overrides };
  fireEvent.changeText(screen.getByPlaceholderText('メールアドレス'), v.email);
  fireEvent.changeText(screen.getByPlaceholderText('パスワード（8文字以上）'), v.pw);
  fireEvent.changeText(screen.getByPlaceholderText('パスワード（確認）'), v.pw2);
  fireEvent.changeText(screen.getByLabelText('生年'), v.y);
  fireEvent.changeText(screen.getByLabelText('生月'), v.m);
  fireEvent.changeText(screen.getByLabelText('生日'), v.d);
}

const agree = () => fireEvent.press(screen.getByLabelText('利用規約とプライバシーポリシーに同意する'));
const submit = () => fireEvent.press(screen.getByText('アカウントを作成'));

// 現行版の取得（useEffect の非同期 setState）が落ち着くまで待ってから操作する。
// これを挟まないと act(...) 警告が出る。
async function renderReady() {
  const view = render(<SignUp />);
  await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('current_legal_documents'));
  return view;
}

describe('SignUp screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFrom.mockReturnValue({ select: jest.fn().mockResolvedValue({ data: DOCS, error: null }) });
    mockSignUp.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: null });
  });

  it('生年月日と同意欄を描画する', async () => {
    await renderReady();
    expect(screen.getByLabelText('生年')).toBeTruthy();
    expect(screen.getByLabelText('生月')).toBeTruthy();
    expect(screen.getByLabelText('生日')).toBeTruthy();
    expect(screen.getByLabelText('利用規約とプライバシーポリシーに同意する')).toBeTruthy();
  });

  it('生年月日が未入力なら登録させない', async () => {
    await renderReady();
    fill({ y: '', m: '', d: '' });
    agree();
    submit();
    expect(Alert.alert).toHaveBeenCalledWith('生年月日を入力してください');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('13歳未満は登録させない（年齢ゲート）', async () => {
    await renderReady();
    fill({ y: String(new Date().getFullYear() - 10) });
    agree();
    submit();
    expect(Alert.alert).toHaveBeenCalledWith('13歳未満の方はご登録いただけません');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('規約に同意しなければ登録させない', async () => {
    await renderReady();
    fill();
    submit(); // 同意チェックを押さない
    expect(Alert.alert).toHaveBeenCalledWith('利用規約とプライバシーポリシーへの同意が必要です');
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('登録に成功すると生年月日と「同意した版」を記録する', async () => {
    await renderReady();
    fill({ y: '2000', m: '3', d: '7' });
    agree();
    submit();

    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('set_date_of_birth', { p_dob: '2000-03-07' }),
    );
    // 同意が必要な2件だけ記録し、特商法（掲示のみ）は記録しない
    expect(mockRpc).toHaveBeenCalledWith('accept_legal', { p_slug: 'terms', p_version: '2026-07-01' });
    expect(mockRpc).toHaveBeenCalledWith('accept_legal', { p_slug: 'privacy', p_version: '2026-07-01' });
    expect(mockRpc).not.toHaveBeenCalledWith('accept_legal', expect.objectContaining({ p_slug: 'tokushoho' }));
  });

  it('未成年には保護者向けの案内を出す', async () => {
    await renderReady();
    fill({ y: String(new Date().getFullYear() - 15) });
    agree();
    submit();
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('保護者の方へ', expect.stringContaining('保護者の同意')),
    );
  });

  it('登録が失敗したら記録も遷移もしない', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'already registered' } });
    await renderReady();
    fill();
    agree();
    submit();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('登録に失敗しました', 'already registered'));
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('同意記録の失敗では登録完了を止めない（起動時チェックで回収する）', async () => {
    mockRpc.mockRejectedValue(new Error('network'));
    await renderReady();
    fill();
    agree();
    submit();
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });
});
