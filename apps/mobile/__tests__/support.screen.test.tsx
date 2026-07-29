import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockRpc = jest.fn();
let mockRows: unknown[] = [];
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.order = () => q;
      (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: mockRows, error: null });
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
  // useFocusEffect は初回に1度だけ実行する
  useFocusEffect: (cb: () => void) => { const { useEffect } = require('react'); useEffect(cb, []); },
}));

import Support from '../app/support/index';

describe('Support screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRows = [];
    mockRpc.mockResolvedValue({ data: { status: 'ok', inquiry_id: 'i1' }, error: null });
  });

  it('問い合わせが無いときは空表示', async () => {
    render(<Support />);
    await waitFor(() => expect(screen.getByText('まだ問い合わせはありません')).toBeTruthy());
  });

  it('既存の問い合わせを一覧表示し、タップでスレッドを開く', async () => {
    mockRows = [{ id: 'i1', category: 'points', subject: 'ポイントが入りません', status: 'answered', created_at: '2026-07-01T00:00:00Z', last_message_at: '2026-07-02T00:00:00Z' }];
    render(<Support />);
    await waitFor(() => expect(screen.getByText('ポイントが入りません')).toBeTruthy());
    expect(screen.getByText('回答あり')).toBeTruthy();
    fireEvent.press(screen.getByText('ポイントが入りません'));
    expect(mockPush).toHaveBeenCalledWith('/support/i1');
  });

  it('未入力では送信しない', async () => {
    render(<Support />);
    await waitFor(() => expect(screen.getByText('＋ 新しく問い合わせる')).toBeTruthy());
    fireEvent.press(screen.getByText('＋ 新しく問い合わせる'));
    fireEvent.press(screen.getByText('送信する'));
    expect(Alert.alert).toHaveBeenCalledWith('件名と内容を入力してください');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('種別・件名・内容を送信する（既定はポイント未反映）', async () => {
    render(<Support />);
    await waitFor(() => expect(screen.getByText('＋ 新しく問い合わせる')).toBeTruthy());
    fireEvent.press(screen.getByText('＋ 新しく問い合わせる'));
    fireEvent.changeText(screen.getByLabelText('件名'), '  オファーが未反映  ');
    fireEvent.changeText(screen.getByLabelText('内容'), '  昨日達成しました  ');
    fireEvent.press(screen.getByText('送信する'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('create_inquiry', {
        p_category: 'points',
        p_subject: 'オファーが未反映',
        p_body: '昨日達成しました',
      }),
    );
  });

  it('種別を切り替えて送信できる', async () => {
    render(<Support />);
    await waitFor(() => expect(screen.getByText('＋ 新しく問い合わせる')).toBeTruthy());
    fireEvent.press(screen.getByText('＋ 新しく問い合わせる'));
    fireEvent.press(screen.getByText('不具合の報告'));
    fireEvent.changeText(screen.getByLabelText('件名'), '落ちる');
    fireEvent.changeText(screen.getByLabelText('内容'), '起動時に落ちます');
    fireEvent.press(screen.getByText('送信する'));
    await waitFor(() =>
      expect(mockRpc).toHaveBeenCalledWith('create_inquiry', expect.objectContaining({ p_category: 'bug' })),
    );
  });

  it('日次上限をユーザー向け文言で伝える', async () => {
    mockRpc.mockResolvedValue({ data: { status: 'rejected', reason: 'daily_cap' }, error: null });
    render(<Support />);
    await waitFor(() => expect(screen.getByText('＋ 新しく問い合わせる')).toBeTruthy());
    fireEvent.press(screen.getByText('＋ 新しく問い合わせる'));
    fireEvent.changeText(screen.getByLabelText('件名'), '件名');
    fireEvent.changeText(screen.getByLabelText('内容'), '内容');
    fireEvent.press(screen.getByText('送信する'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        '送信できませんでした',
        '本日の問い合わせ上限に達しました。既存の問い合わせへの返信はご利用いただけます。',
      ),
    );
  });
});
