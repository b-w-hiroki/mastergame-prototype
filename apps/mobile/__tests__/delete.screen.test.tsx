import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
let mockWallet: { balance: number } | null = { balance: 5000 };
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.single = () => Promise.resolve({ data: mockWallet, error: null });
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

import DeleteAccount from '../app/account/delete';

// Alert.alert の確認ダイアログで「退会する」を自動的に押す
function autoConfirm() {
  (Alert.alert as jest.Mock).mockImplementation((_t, _m, buttons) => {
    const destructive = (buttons ?? []).find((b: { style?: string }) => b?.style === 'destructive');
    destructive?.onPress?.();
  });
}

function rpcs(overrides: Record<string, unknown> = {}) {
  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'my_account_deletion') return { data: overrides.my_account_deletion ?? { pending: false }, error: null };
    if (fn === 'request_account_deletion') {
      return { data: overrides.request_account_deletion ?? { status: 'ok', scheduled_at: '2026-08-05T00:00:00Z' }, error: null };
    }
    if (fn === 'cancel_account_deletion') return { data: { status: 'ok' }, error: null };
    return { data: null, error: null };
  });
}

describe('Delete account screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockWallet = { balance: 5000 };
    rpcs();
  });

  it('退会の影響（ポイント失効を含む）を事前に説明する', async () => {
    render(<DeleteAccount />);
    await waitFor(() => expect(screen.getByText('退会するとどうなりますか？')).toBeTruthy());
    expect(screen.getByText(/失効/)).toBeTruthy();
    expect(screen.getByText(/投稿者は「退会したユーザー」と表示されます/)).toBeTruthy();
  });

  it('残高がある場合は交換を促す導線を出す', async () => {
    render(<DeleteAccount />);
    await waitFor(() => expect(screen.getByText(/5,000 P を保有/)).toBeTruthy());
    fireEvent.press(screen.getByText('ポイントを交換する ›'));
    expect(mockPush).toHaveBeenCalledWith('/exchange');
  });

  it('残高0なら交換の警告は出さない', async () => {
    mockWallet = { balance: 0 };
    render(<DeleteAccount />);
    await waitFor(() => expect(screen.getByText('退会するとどうなりますか？')).toBeTruthy());
    expect(screen.queryByText(/を保有しています/)).toBeNull();
  });

  it('確認ダイアログで失効額を提示してから申請する', async () => {
    render(<DeleteAccount />);
    await waitFor(() => expect(screen.getByText('退会手続きへ進む')).toBeTruthy());
    autoConfirm();
    fireEvent.press(screen.getByText('退会手続きへ進む'));

    // 確認文言に失効するポイント数が含まれる
    const [, message] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).toContain('5,000 P');
    expect(message).toContain('失効');

    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('request_account_deletion', { p_reason: null }),
    );
  });

  it('確認をキャンセルしたら申請しない', async () => {
    render(<DeleteAccount />);
    await waitFor(() => expect(screen.getByText('退会手続きへ進む')).toBeTruthy());
    // 何も押さない（既定の Alert.alert モックは何も呼ばない）
    fireEvent.press(screen.getByText('退会手続きへ進む'));
    expect(mockRpc).not.toHaveBeenCalledWith('request_account_deletion', expect.anything());
  });

  it('理由を入力して申請できる', async () => {
    render(<DeleteAccount />);
    await waitFor(() => expect(screen.getByLabelText('退会理由')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('退会理由'), '  ポイントが貯まりにくい  ');
    autoConfirm();
    fireEvent.press(screen.getByText('退会手続きへ進む'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('request_account_deletion', { p_reason: 'ポイントが貯まりにくい' }),
    );
  });

  it('手続き中は完了予定日とキャンセル導線を出す', async () => {
    rpcs({ my_account_deletion: { pending: true, scheduled_at: '2026-08-05T00:00:00Z' } });
    render(<DeleteAccount />);
    await waitFor(() => expect(screen.getByText('退会手続き中')).toBeTruthy());
    expect(screen.getByText(/2026年8月5日に退会が完了します/)).toBeTruthy();
    fireEvent.press(screen.getByText('退会をキャンセルする'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('cancel_account_deletion'));
  });

  it('完了済みの再申請はユーザー向け文言で伝える', async () => {
    rpcs({ request_account_deletion: { status: 'rejected', reason: 'already_deleted' } });
    render(<DeleteAccount />);
    await waitFor(() => expect(screen.getByText('退会手続きへ進む')).toBeTruthy());
    autoConfirm();
    fireEvent.press(screen.getByText('退会手続きへ進む'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('手続きできませんでした', 'すでに退会手続きが完了しています。'),
    );
  });
});
