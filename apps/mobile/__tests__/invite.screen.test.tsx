import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

const mockShow = jest.fn();
jest.mock('@/components/RewardToast', () => ({ useReward: () => ({ show: mockShow, node: null }) }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

import Invite from '../app/invite';

const STATUS = {
  code: 'A3F7KMPQ',
  pending: 1,
  confirmed: 2,
  earned_points: 100000,
  reward_referee: 30000,
  reward_referrer: 50000,
};

// my_referral_status は常に成功、redeem_referral_code はテストごとに差し替える
function mockRpcs(redeem?: unknown) {
  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'my_referral_status') return { data: STATUS, error: null };
    if (fn === 'redeem_referral_code') return { data: redeem, error: null };
    return { data: null, error: null };
  });
}

describe('Invite screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRpcs();
  });

  it('自分の招待コードと実績を表示する', async () => {
    render(<Invite />);
    await waitFor(() => expect(screen.getByText('A3F7KMPQ')).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy();          // 成立した招待
    expect(screen.getByText('100,000')).toBeTruthy();    // 招待で獲得
  });

  it('コード未入力では RPC を呼ばない', async () => {
    render(<Invite />);
    await waitFor(() => expect(screen.getByText('A3F7KMPQ')).toBeTruthy());
    fireEvent.press(screen.getByText('使う'));
    expect(Alert.alert).toHaveBeenCalledWith('招待コードを入力してください');
    expect(mockRpc).not.toHaveBeenCalledWith('redeem_referral_code', expect.anything());
  });

  it('入力を大文字化・トリムして送信し、成功で獲得演出を出す', async () => {
    mockRpcs({ status: 'ok', reward: 30000, note: 'ミッションを進めると確定します' });
    render(<Invite />);
    await waitFor(() => expect(screen.getByText('A3F7KMPQ')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('例: A3F7KMPQ'), ' zzz9kmpq ');
    fireEvent.press(screen.getByText('使う'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('redeem_referral_code', { p_code: 'ZZZ9KMPQ' }),
    );
    expect(mockShow).toHaveBeenCalledWith(30000, '招待ボーナス');
  });

  it('自己招待の拒否をユーザー向け文言で伝える', async () => {
    mockRpcs({ status: 'rejected', reason: 'self_referral' });
    render(<Invite />);
    await waitFor(() => expect(screen.getByText('A3F7KMPQ')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('例: A3F7KMPQ'), 'A3F7KMPQ');
    fireEvent.press(screen.getByText('使う'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('利用できませんでした', '自分の招待コードは使用できません。'),
    );
    expect(mockShow).not.toHaveBeenCalled();
  });

  it('同一端末の拒否は理由を詳しく明かさない（不正対策の核を露出させない）', async () => {
    mockRpcs({ status: 'rejected', reason: 'same_device' });
    render(<Invite />);
    await waitFor(() => expect(screen.getByText('A3F7KMPQ')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('例: A3F7KMPQ'), 'BBBBBBBB');
    fireEvent.press(screen.getByText('使う'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [, message] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    expect(message).toBe('このコードはこの端末ではご利用いただけません。');
    expect(message).not.toMatch(/多重|不正|同一端末|device/);
  });

  it('未知の reason でも汎用文言でフォールバックする', async () => {
    mockRpcs({ status: 'rejected', reason: 'some_future_reason' });
    render(<Invite />);
    await waitFor(() => expect(screen.getByText('A3F7KMPQ')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('例: A3F7KMPQ'), 'CCCCCCCC');
    fireEvent.press(screen.getByText('使う'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('利用できませんでした', 'このコードはご利用いただけません。'),
    );
  });

  it('共有シートに招待コードを渡す', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    render(<Invite />);
    await waitFor(() => expect(screen.getByText('A3F7KMPQ')).toBeTruthy());
    fireEvent.press(screen.getByText('招待リンクを送る'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    // ShareContent は message|url のユニオンなので、message 側であることを確かめてから読む
    const content = share.mock.calls[0][0] as { message?: string };
    expect(content.message).toContain('A3F7KMPQ');
  });
});
