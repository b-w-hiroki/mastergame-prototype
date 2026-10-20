import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
let mockDob: string | null = null;
let mockPending: unknown = [];
const mockRpc = jest.fn();
const mockProfile = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ single: () => mockProfile() }) }) }),
  rpc: (...a: unknown[]) => mockRpc(...a),
  auth: { signOut: () => Promise.resolve({ error: null }) },
} }));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: React.ReactNode }) => {
  const { Text } = require('react-native'); return <Text>{children}</Text>;
} }));
import { AccountSetupGate } from '@/components/AccountSetupGate';

describe('AccountSetupGate', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockDob = null;
    mockPending = [{ slug: 'terms', version: 'v1', title: '利用規約' }];
    mockProfile.mockImplementation(async () => ({ data: { date_of_birth: mockDob }, error: null }));
    mockRpc.mockImplementation(async (name, args) => {
      if (name === 'pending_legal_consents') return { data: mockPending, error: null };
      if (name === 'set_date_of_birth') { mockDob = args.p_dob; return { data: { status: 'ok' }, error: null }; }
      if (name === 'accept_legal') { mockPending = []; return { data: { ok: true }, error: null }; }
      throw new Error('unexpected RPC');
    });
  });
  afterEach(() => jest.restoreAllMocks());
  async function show() {
    render(<AccountSetupGate userId="player" />);
    await screen.findByText('登録情報を保存して続ける');
  }
  function fill() {
    fireEvent.changeText(screen.getByLabelText('確認用の生年'), '2000');
    fireEvent.changeText(screen.getByLabelText('確認用の生月'), '1');
    fireEvent.changeText(screen.getByLabelText('確認用の生日'), '2');
  }
  it('不足している生年月日と同意を記録し、再取得後に確認画面を閉じる', async () => {
    await show(); fill();
    fireEvent.press(screen.getByLabelText('表示された規約に同意する'));
    await act(async () => { fireEvent.press(screen.getByText('登録情報を保存して続ける')); });
    expect(mockRpc).toHaveBeenCalledWith('set_date_of_birth', { p_dob: '2000-01-02' });
    expect(mockRpc).toHaveBeenCalledWith('accept_legal', { p_slug: 'terms', p_version: 'v1' });
    expect(screen.queryByText('登録情報の確認')).toBeNull();
  });
  it('年齢確認済みの場合は生年月日を再入力させない', async () => {
    mockDob = '2000-01-02';
    await show();
    expect(screen.queryByLabelText('確認用の生年')).toBeNull();
    fireEvent.press(screen.getByText('登録情報を保存して続ける'));
    expect(screen.getByRole('alert').props.children).toContain('同意');
    expect(mockRpc).not.toHaveBeenCalledWith('set_date_of_birth', expect.anything());
  });
  it('13歳未満は保存できない', async () => {
    await show(); fill();
    fireEvent.changeText(screen.getByLabelText('確認用の生年'), String(new Date().getFullYear() - 10));
    fireEvent.press(screen.getByText('登録情報を保存して続ける'));
    expect(screen.getByRole('alert').props.children).toContain('13歳未満');
    expect(mockRpc).not.toHaveBeenCalledWith('set_date_of_birth', expect.anything());
  });
  it('情報取得失敗時は通常画面を開放せず再読み込みを提供する', async () => {
    mockProfile.mockRejectedValueOnce(new Error('offline'));
    render(<AccountSetupGate userId="player" />);
    await screen.findByRole('alert');
    expect(screen.queryByText('登録情報を保存して続ける')).toBeNull();
    fireEvent.press(screen.getByText('再読み込み'));
    await screen.findByText('登録情報を保存して続ける');
  });
  it.each([null, [{ slug: 'terms', version: '', title: '利用規約' }], [{ slug: 'terms', version: 'v1' }]])(
    '未同意規約の空・不正応答では確認画面を開放しない: %p', async (pending) => {
      mockPending = pending;
      render(<AccountSetupGate userId="player" />);
      await screen.findByRole('alert');
      expect(screen.queryByText('登録情報を保存して続ける')).toBeNull();
      expect(mockRpc).not.toHaveBeenCalledWith('accept_legal', expect.anything());
    },
  );
  it('アカウント切替後は前の同意チェックを引き継がない', async () => {
    mockDob = '2000-01-02';
    const view = render(<AccountSetupGate userId="player" />);
    await screen.findByText('登録情報を保存して続ける');
    fireEvent.press(screen.getByLabelText('表示された規約に同意する'));
    expect(screen.getByLabelText('表示された規約に同意する').props.accessibilityState.checked).toBe(true);
    mockPending = [{ slug: 'privacy', version: 'v2', title: 'プライバシーポリシー' }];
    view.rerender(<AccountSetupGate userId="other" />);
    await screen.findByText('プライバシーポリシー（v2）を確認する');
    expect(screen.getByLabelText('表示された規約に同意する').props.accessibilityState.checked).toBe(false);
    fireEvent.press(screen.getByText('登録情報を保存して続ける'));
    expect(screen.getByRole('alert').props.children).toContain('同意が必要');
    expect(mockRpc).not.toHaveBeenCalledWith('accept_legal', expect.anything());
  });
  it('サーバーの年齢拒否を成功扱いにしない', async () => {
    mockRpc.mockImplementation(async (name) => name === 'pending_legal_consents'
      ? { data: mockPending, error: null }
      : { data: { status: 'rejected', reason: 'under_minimum_age' }, error: null });
    await show(); fill();
    fireEvent.press(screen.getByLabelText('表示された規約に同意する'));
    await act(async () => { fireEvent.press(screen.getByText('登録情報を保存して続ける')); });
    expect(screen.getByRole('alert').props.children).toContain('年齢確認を完了できません');
    expect(mockRpc).not.toHaveBeenCalledWith('accept_legal', expect.anything());
  });
  it('部分保存失敗後は再登録せず不足情報の保存を再試行できる', async () => {
    const implementation = mockRpc.getMockImplementation()!;
    let fail = true;
    mockRpc.mockImplementation(async (name, args) => {
      if (name === 'accept_legal' && fail) { fail = false; return { error: { message: 'offline' } }; }
      return implementation(name, args);
    });
    await show(); fill();
    fireEvent.press(screen.getByLabelText('表示された規約に同意する'));
    await act(async () => { fireEvent.press(screen.getByText('登録情報を保存して続ける')); });
    expect(Alert.alert).toHaveBeenCalledWith('登録情報を保存できませんでした', expect.any(String));
    await act(async () => { fireEvent.press(screen.getByText('登録情報を保存して続ける')); });
    await waitFor(() => expect(screen.queryByText('登録情報の確認')).toBeNull());
    expect(mockRpc.mock.calls.filter(([name]) => name === 'set_date_of_birth')).toHaveLength(1);
  });

  it('応答がない場合も再試行でき、古い取得結果で確認状態を変えない', async () => {
    jest.useFakeTimers();
    try {
      let resolveOld!: (value: unknown) => void;
      mockProfile.mockReturnValueOnce(new Promise((done) => { resolveOld = done; }));
      render(<AccountSetupGate userId="player" />);
      await act(async () => { jest.advanceTimersByTime(15_000); });
      expect(screen.getByRole('alert')).toBeTruthy();
      await act(async () => { fireEvent.press(screen.getByText('再読み込み')); });
      await act(async () => { resolveOld({ data: { date_of_birth: '2000-01-02' }, error: null }); });
      expect(screen.getByLabelText('確認用の生年')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    } finally { jest.useRealTimers(); }
  });
});
