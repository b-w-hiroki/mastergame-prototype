import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockRpc = jest.fn();
let mockInquiry: unknown;
let mockMessages: unknown;
let mockInquiryError: unknown;
let mockMessagesError: unknown;

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      q.single = () => Promise.resolve({ data: mockInquiry, error: mockInquiryError });
      q.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: table === 'inquiry_messages' ? mockMessages : null, error: mockMessagesError }).then(resolve);
      return q;
    },
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'i1' }),
}));

import SupportThread from '../app/support/[id]';

describe('Support thread screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockInquiry = { id: 'i1', subject: '問い合わせ', status: 'open' };
    mockMessages = [{ id: 'm1', is_staff: false, body: '本文', created_at: '2026-07-01T00:00:00Z' }];
    mockInquiryError = null;
    mockMessagesError = null;
    mockRpc.mockResolvedValue({ data: { status: 'ok' }, error: null });
  });

  it('正常な返信は対象IDと本文を送る', async () => {
    render(<SupportThread />);
    await waitFor(() => expect(screen.getByText('問い合わせ')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('返信内容'), '  回答ありがとうございます  ');
    fireEvent.press(screen.getByText('返信する'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('reply_to_inquiry', {
      p_inquiry_id: 'i1', p_body: '回答ありがとうございます',
    }));
  });

  it('4,000文字超の返信は送らない', async () => {
    render(<SupportThread />);
    await waitFor(() => expect(screen.getByText('問い合わせ')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('返信内容'), 'あ'.repeat(4001));
    fireEvent.press(screen.getByText('返信する'));
    expect(Alert.alert).toHaveBeenCalledWith('返信は4,000文字以内で入力してください');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('空応答では入力を残し、成功扱いしない', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    render(<SupportThread />);
    await waitFor(() => expect(screen.getByText('問い合わせ')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('返信内容'), '追記します');
    fireEvent.press(screen.getByText('返信する'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('送信できませんでした', expect.any(String)));
    expect(screen.getByLabelText('返信内容').props.value).toBe('追記します');
  });

  it('メッセージ取得失敗では古い内容も返信欄も表示しない', async () => {
    mockMessagesError = { message: 'offline' };
    render(<SupportThread />);
    await waitFor(() => expect(screen.getByText(/データの取得に失敗しました/)).toBeTruthy());
    expect(screen.queryByText('問い合わせ')).toBeNull();
    expect(screen.queryByText('返信する')).toBeNull();
  });

  it('返信後の再取得が失敗したら古いスレッドを操作可能にしない', async () => {
    render(<SupportThread />);
    await waitFor(() => expect(screen.getByText('問い合わせ')).toBeTruthy());
    mockMessagesError = { message: 'offline' };
    fireEvent.changeText(screen.getByLabelText('返信内容'), '追記');
    fireEvent.press(screen.getByText('返信する'));
    await waitFor(() => expect(screen.getByText(/データの取得に失敗しました/)).toBeTruthy());
    expect(screen.queryByText('問い合わせ')).toBeNull();
    expect(screen.queryByText('返信する')).toBeNull();
  });

  it('問い合わせが見つからない場合も空画面にせずエラー表示する', async () => {
    mockInquiry = null;
    render(<SupportThread />);
    await waitFor(() => expect(screen.getByText(/データの取得に失敗しました/)).toBeTruthy());
    expect(screen.queryByText('返信する')).toBeNull();
  });
});
