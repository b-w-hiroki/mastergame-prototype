import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockAlert = jest.fn();
const mockInsert = jest.fn();
const mockRows: Record<string, unknown> = {};
const mockErrors: Record<string, unknown> = {};

jest.mock('@/components/AppAlert', () => ({ AppAlert: { alert: (...args: unknown[]) => mockAlert(...args) } }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'topic-1' }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  rpc: (...args: unknown[]) => mockRpc(...args),
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'in']) query[method] = () => query;
    query.single = async () => ({ data: mockRows[table], error: mockErrors[table] ?? null });
    query.insert = (...args: unknown[]) => mockInsert(...args);
    query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: mockRows[table], error: mockErrors[table] ?? null }).then(resolve);
    return query;
  },
} }));

import TopicDetail from '../app/topic/[id]';

const POST_ID = '00000000-0000-4000-8000-000000000001';
const ANSWER_ID = '00000000-0000-4000-8000-000000000002';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'author' } }, error: null });
  for (const key of Object.keys(mockErrors)) delete mockErrors[key];
  mockRows.topics = { id: 'topic-1', title: '質問', kind: 'question', status: 'open', has_bounty: true,
    author_id: 'author', best_answer_post_id: null };
  mockRows.posts = [
    { id: POST_ID, body: '本文', is_op: true, author_id: 'author', created_at: '2026-10-18T00:00:00Z' },
    { id: ANSWER_ID, body: '回答', is_op: false, author_id: 'other', created_at: '2026-10-18T01:00:00Z' },
  ];
  mockRows.reactions = [];
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockInsert.mockResolvedValue({ error: null });
});

it('読込中にアカウントが変われば旧投稿とベスト選定ボタンを出さない', async () => {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'author' } }, error: null })
    .mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });
  render(<TopicDetail />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('回答')).toBeNull();
  expect(screen.queryByText('ベストに選ぶ')).toBeNull();
});

it.each([
  ['topics', { id: 'topic-1', title: '', kind: 'question', status: 'open', has_bounty: true, author_id: 'author', best_answer_post_id: null }],
  ['posts', [{ id: POST_ID, body: '本文', is_op: true, author_id: 'author', created_at: 'invalid' }]],
  ['reactions', [{ post_id: 'unknown', user_id: 'author', kind: 'like' }]],
])('%s の不正な応答を操作に渡さない', async (table, rows) => {
  mockRows[table] = rows;
  render(<TopicDetail />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('ベストに選ぶ')).toBeNull();
  expect(screen.queryByPlaceholderText('返信を書く…')).toBeNull();
});

it('リアクションの空応答は0件として表示しない', async () => {
  mockRows.reactions = null;
  render(<TopicDetail />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('回答')).toBeNull();
});

it('正常な空リアクションは0件として表示する', async () => {
  await ready();
  expect(screen.getAllByText('♥ 0')).toHaveLength(2);
});

async function ready() {
  render(<TopicDetail />);
  await screen.findByText('回答');
}

it('返信の空応答では入力を消さず、再送前の確認を促す', async () => {
  await ready();
  fireEvent.changeText(screen.getByPlaceholderText('返信を書く…'), '追記');
  await act(async () => { fireEvent.press(screen.getByText('送信')); });
  expect(mockRpc).toHaveBeenCalledWith('add_reply', { p_topic_id: 'topic-1', p_body: '追記' });
  expect(screen.getByPlaceholderText('返信を書く…').props.value).toBe('追記');
  expect(mockAlert).toHaveBeenCalledWith('返信結果を確認できませんでした', expect.stringContaining('再送する前'));
});

it('返信の正しい応答では入力を消す', async () => {
  mockRpc.mockResolvedValue({ data: { ok: true, post_id: POST_ID }, error: null });
  await ready();
  fireEvent.changeText(screen.getByPlaceholderText('返信を書く…'), '追記');
  await act(async () => { fireEvent.press(screen.getByText('送信')); });
  expect(screen.getByPlaceholderText('返信を書く…').props.value).toBe('');
  expect(mockAlert).not.toHaveBeenCalled();
});

it('返信送信直前に本人が変わればRPCを呼ばず入力を保持する', async () => {
  await ready();
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });
  fireEvent.changeText(screen.getByPlaceholderText('返信を書く…'), '追記');
  await act(async () => { fireEvent.press(screen.getByText('送信')); });
  expect(mockRpc).not.toHaveBeenCalled();
  expect(screen.getByPlaceholderText('返信を書く…').props.value).toBe('追記');
  expect(mockAlert).toHaveBeenCalledWith('ログイン状態が変わりました', expect.any(String));
});

it('返信送信後に本人が変われば成功として入力を消さない', async () => {
  mockRpc.mockResolvedValue({ data: { ok: true, post_id: POST_ID }, error: null });
  await ready();
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'author' } }, error: null })
    .mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });
  fireEvent.changeText(screen.getByPlaceholderText('返信を書く…'), '追記');
  await act(async () => { fireEvent.press(screen.getByText('送信')); });
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(screen.getByPlaceholderText('返信を書く…').props.value).toBe('追記');
  expect(mockAlert).toHaveBeenCalledWith('操作結果を確認してください', expect.stringContaining('再操作する前'));
});

it('いいね送信直前に本人が変わればRPCを呼ばない', async () => {
  await ready();
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });
  await act(async () => { fireEvent.press(screen.getAllByText('♥ 0')[0]); });
  expect(mockRpc).not.toHaveBeenCalled();
});

it('ベスト選定の確認中に本人が変わればRPCを呼ばない', async () => {
  await ready();
  fireEvent.press(screen.getByText('ベストに選ぶ'));
  const buttons = mockAlert.mock.calls[0][2];
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });
  await act(async () => { await buttons[1].onPress(); });
  expect(mockRpc).not.toHaveBeenCalled();
});

it('通報理由の選択中に本人が変われば保存しない', async () => {
  await ready();
  fireEvent.press(screen.getAllByText('通報')[0]);
  const buttons = mockAlert.mock.calls[0][2];
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });
  await act(async () => { buttons[0].onPress(); });
  expect(mockInsert).not.toHaveBeenCalled();
});

it('アカウント変更後の再読込で前ユーザーの返信下書きを消す', async () => {
  await ready();
  fireEvent.changeText(screen.getByPlaceholderText('返信を書く…'), '前ユーザーの下書き');
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'author' } }, error: null })
    .mockResolvedValueOnce({ data: { user: { id: 'author' } }, error: null })
    .mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null })
    .mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });
  await act(async () => { fireEvent.press(screen.getByText('送信')); });
  expect(screen.getByPlaceholderText('返信を書く…').props.value).toBe('');
});

it('画面離脱後にベスト選定を確定しても旧RPCを送らない', async () => {
  const view = render(<TopicDetail />);
  await screen.findByText('ベストに選ぶ');
  fireEvent.press(screen.getByText('ベストに選ぶ'));
  const buttons = mockAlert.mock.calls[0][2];
  view.unmount();
  await act(async () => { await buttons[1].onPress(); });
  expect(mockRpc).not.toHaveBeenCalled();
});

it('リアクションの空応答では結果不明を知らせる', async () => {
  await ready();
  await act(async () => { fireEvent.press(screen.getAllByText('♥ 0')[0]); });
  expect(mockAlert).toHaveBeenCalledWith('リアクションの結果を確認できませんでした', expect.any(String));
});

it('ベストアンサーの不正応答では確定扱いせず履歴確認を促す', async () => {
  mockRpc.mockResolvedValue({ data: { ok: true, best_answer_post_id: POST_ID }, error: null });
  await ready();
  fireEvent.press(screen.getByText('ベストに選ぶ'));
  const buttons = mockAlert.mock.calls[0][2];
  await act(async () => { await buttons[1].onPress(); });
  expect(mockRpc).toHaveBeenCalledWith('set_best_answer', { p_topic_id: 'topic-1', p_post_id: ANSWER_ID });
  expect(mockAlert).toHaveBeenCalledWith('ベストアンサーの結果を確認できませんでした', expect.stringContaining('ポイント履歴'));
});

it('ベストアンサーの正しい応答は結果不明の警告を出さない', async () => {
  mockRpc.mockResolvedValue({ data: { ok: true, best_answer_post_id: ANSWER_ID }, error: null });
  await ready();
  fireEvent.press(screen.getByText('ベストに選ぶ'));
  const buttons = mockAlert.mock.calls[0][2];
  await act(async () => { await buttons[1].onPress(); });
  await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
  expect(mockAlert).toHaveBeenCalledTimes(1);
});

it('再読込の失敗後は古い本文と返信欄を隠し、再試行で回復する', async () => {
  await ready();
  mockRpc.mockImplementation(async () => {
    mockErrors.posts = { message: 'offline' };
    return { data: { ok: true, post_id: POST_ID }, error: null };
  });
  fireEvent.changeText(screen.getByPlaceholderText('返信を書く…'), '追記');
  await act(async () => { fireEvent.press(screen.getByText('送信')); });
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('回答')).toBeNull();
  expect(screen.queryByPlaceholderText('返信を書く…')).toBeNull();
  mockErrors.posts = null;
  fireEvent.press(screen.getByText('再読み込み'));
  await screen.findByText('回答');
  expect(screen.getByPlaceholderText('返信を書く…')).toBeTruthy();
});

it('トピックが空応答なら空の投稿一覧ではなく再試行を案内する', async () => {
  mockRows.topics = null;
  render(<TopicDetail />);
  await screen.findByText(/データの取得に失敗しました/);
  expect(screen.queryByText('まだ投稿がありません')).toBeNull();
  expect(screen.queryByPlaceholderText('返信を書く…')).toBeNull();
});
