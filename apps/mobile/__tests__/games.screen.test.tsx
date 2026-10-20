import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, RefreshControl } from 'react-native';

const mockGetUser = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockDelete = jest.fn();
let mockTableErrors: Record<string, unknown> = {};

// game_hub_rows / user_games の2テーブルを扱うので、テーブル名で分岐するチェーンを作る
jest.mock('@/lib/supabase', () => {
  const chain = (rows: unknown[], table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) {
      q[m] = (...a: unknown[]) => { if (m === 'select') mockSelect(table, ...a); return q; };
    }
    (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: mockTableErrors[table] ?? null });
    q.insert = (...a: unknown[]) => mockInsert(table, ...a);
    q.delete = () => {
      const d: Record<string, unknown> = {};
      d.eq = () => d;
      (d as { then: unknown }).then = (resolve: (v: unknown) => void) => { mockDelete(table); resolve({ error: null }); };
      return d;
    };
    return q;
  };
  return {
    supabase: {
      auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: (table: string) => {
        const tables = (global as any).__tables;
        return chain(tables && table in tables ? tables[table] : [], table);
      },
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: (...a: unknown[]) => mockPush(...a) },
}));

import Games from '../app/games/index';

const GAME = {
  id: 'g1', slug: 'eldia', name: 'エルディア戦記', genre: 'rpg',
  description: '王道ファンタジーRPG。', platforms: ['ios', 'android'],
  is_featured: true, followers: 3, topic_count: 7,
};

function setTables(t: Record<string, unknown[]>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).__tables = t;
}

describe('Games hub screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockInsert.mockResolvedValue({ error: null });
    mockTableErrors = {};
    setTables({ game_hub_rows: [GAME], user_games: [] });
  });

  it('タイトルとメタ情報を表示する', async () => {
    render(<Games />);
    await waitFor(() => expect(screen.getByText('エルディア戦記')).toBeTruthy());
    expect(screen.getByText('王道ファンタジーRPG。')).toBeTruthy();
    expect(screen.getByText('注目')).toBeTruthy();
    // ジャンル・プラットフォーム・件数が1行にまとまる
    expect(screen.getByText(/iOS\/Android/)).toBeTruthy();
    expect(screen.getByText(/投稿 7/)).toBeTruthy();
    expect(screen.getByText(/フォロー 3/)).toBeTruthy();
  });

  it('未フォローなら「フォロー」、押すと user_games に追加する', async () => {
    render(<Games />);
    await waitFor(() => expect(screen.getByText('フォロー')).toBeTruthy());
    fireEvent.press(screen.getByText('フォロー'));
    // 保存が成功してから表示を切り替える
    await waitFor(() => expect(screen.getByText('フォロー中')).toBeTruthy());
    await waitFor(() =>
      expect(mockInsert).toHaveBeenCalledWith('user_games', { user_id: 'u1', game_id: 'g1' }),
    );
  });

  it('フォロー済みなら「フォロー中」と表示し、押すと解除する', async () => {
    setTables({ game_hub_rows: [GAME], user_games: [{ game_id: 'g1' }] });
    render(<Games />);
    await waitFor(() => expect(screen.getByText('フォロー中')).toBeTruthy());
    fireEvent.press(screen.getByText('フォロー中'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('user_games'));
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('カードをタップするとそのタイトルの掲示板へ遷移する', async () => {
    render(<Games />);
    await waitFor(() => expect(screen.getByText('エルディア戦記')).toBeTruthy());
    fireEvent.press(screen.getByText('エルディア戦記'));
    expect(mockPush).toHaveBeenCalledWith('/games/eldia');
  });

  it('タイトルが無いときは空表示にする', async () => {
    setTables({ game_hub_rows: [], user_games: [] });
    render(<Games />);
    await waitFor(() => expect(screen.getByText('ゲームがまだ登録されていません')).toBeTruthy());
  });

  it('未ログインでも一覧は見られる（フォロー状態は空）', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    render(<Games />);
    await waitFor(() => expect(screen.getByText('エルディア戦記')).toBeTruthy());
    expect(screen.getByText('フォロー')).toBeTruthy();
  });
  it('フォローの通信例外後も状態を変えず再試行できる', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockInsert.mockRejectedValueOnce(new Error('offline'));
    render(<Games />);
    await screen.findByText('エルディア戦記');
    await act(async () => { fireEvent.press(screen.getByText('フォロー')); });
    expect(screen.queryByText('フォロー中')).toBeNull();
    expect(alert).toHaveBeenCalledWith('フォローを保存できませんでした', expect.any(String));
    await act(async () => { fireEvent.press(screen.getByText('フォロー')); });
    expect(screen.getByText('フォロー中')).toBeTruthy();
    alert.mockRestore();
  });
  it('フォローボタンはカードへのクリック伝播を止める', async () => {
    render(<Games />);
    await screen.findByText('エルディア戦記');
    const stopPropagation = jest.fn();
    await act(async () => { fireEvent.press(screen.getByText('フォロー'), { stopPropagation }); });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('再読込失敗後は古いゲームとフォローボタンを隠し、再試行で回復する', async () => {
    render(<Games />);
    await screen.findByText('エルディア戦記');
    mockTableErrors.game_hub_rows = { message: 'offline' };
    fireEvent(screen.UNSAFE_getByType(RefreshControl), 'refresh');
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('エルディア戦記')).toBeNull();
    expect(screen.queryByLabelText('エルディア戦記をフォロー')).toBeNull();
    mockTableErrors = {};
    fireEvent.press(screen.getByText('再読み込み'));
    await screen.findByText('エルディア戦記');
  });

  it('ゲーム一覧の空応答は正常な空一覧と区別する', async () => {
    setTables({ game_hub_rows: null as unknown as unknown[], user_games: [] });
    render(<Games />);
    await screen.findByText(/データの取得に失敗しました/);
    expect(screen.queryByText('ゲームがまだ登録されていません')).toBeNull();
  });

  it('操作時にログアウト済みならログインを案内し、書き込まない', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<Games />);
    await screen.findByText('エルディア戦記');
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    await act(async () => { fireEvent.press(screen.getByText('フォロー')); });
    expect(alert).toHaveBeenCalledWith('ログインが必要です', expect.any(String));
    expect(mockInsert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
