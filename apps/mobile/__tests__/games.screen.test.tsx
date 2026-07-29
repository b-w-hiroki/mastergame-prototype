import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockGetUser = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockDelete = jest.fn();

// game_hub_rows / user_games の2テーブルを扱うので、テーブル名で分岐するチェーンを作る
jest.mock('@/lib/supabase', () => {
  const chain = (rows: unknown[], table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) {
      q[m] = (...a: unknown[]) => { if (m === 'select') mockSelect(table, ...a); return q; };
    }
    (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
    q.insert = (...a: unknown[]) => { mockInsert(table, ...a); return Promise.resolve({ error: null }); };
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
      from: (table: string) => chain((global as any).__tables?.[table] ?? [], table),
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
    // 楽観更新で即座に表示が変わる
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
});
