import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockList = jest.fn();
const mockTarget = jest.fn();
const mockWallet = jest.fn();
const mockRpc = jest.fn();
const mockReplace = jest.fn();
const mockGetUser = jest.fn();
let mockParams: { forum?: string } = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams,
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  from: (name: string) => name === 'forums'
    ? { select: () => ({ limit: () => mockList(), eq: () => ({ maybeSingle: () => mockTarget() }) }) }
    : { select: () => ({ eq: () => ({ single: () => mockWallet() }) }) },
  rpc: (...a: unknown[]) => mockRpc(...a),
} }));
import NewTopic from '../app/topic/new';

const FORUMS = [{ id: 'f1', name: '公開ギルド', type: 'public' }, { id: 'f2', name: 'ゲームギルド', type: 'game' }];
const TOPIC_ID = '123e4567-e89b-42d3-a456-426614174000';

async function ready() {
  render(<NewTopic />);
  await waitFor(() => expect(screen.getByRole('button', { name: '投稿する' }).props.accessibilityState.disabled).toBe(false));
  await screen.findByText('公開ギルド');
}
function fill(bounty = '') {
  fireEvent.changeText(screen.getByLabelText('投稿タイトル'), '  質問です  ');
  fireEvent.changeText(screen.getByLabelText('投稿本文'), '  本文です  ');
  fireEvent.changeText(screen.getByLabelText('報酬ポイント'), bounty);
}

describe('topic creation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetUser.mockResolvedValue({ data: { user: { id: 'player' } }, error: null });
    mockParams = {};
    mockList.mockImplementation(async () => ({ data: [...FORUMS], error: null }));
    mockWallet.mockResolvedValue({ data: { balance: 1000 }, error: null });
    mockTarget.mockResolvedValue({ data: { id: 'f3', name: '別のゲームギルド', type: 'game' }, error: null });
    mockRpc.mockResolvedValue({ data: { ok: true, topic_id: TOPIC_ID }, error: null });
  });
  afterEach(() => jest.restoreAllMocks());
  it('報酬と前後空白を除いた本文を送信する', async () => {
    await ready(); fill('500');
    await act(async () => { fireEvent.press(screen.getByText('投稿する')); });
    expect(mockRpc).toHaveBeenCalledWith('create_topic', {
      p_forum_id: 'f1', p_kind: 'question', p_title: '質問です', p_body: '本文です', p_bounty_amount: 500,
    });
    expect(mockReplace).toHaveBeenCalledWith(`/topic/${TOPIC_ID}`);
  });
  it.each(['1.5', '-1', '1e2', '0x10', 'Infinity', '9007199254740992'])('整数でない/安全に扱えない値は丸めず送信しない: %s', async (value) => {
    await ready(); fill(value);
    expect(screen.getByRole('alert').props.children).toContain('整数');
    fireEvent.press(screen.getByText('投稿する'));
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('DBのinteger上限を超える賭けポイントは送らない', async () => {
    mockWallet.mockResolvedValue({ data: { balance: 3_000_000_000 }, error: null });
    await ready(); fill('2147483648');
    expect(screen.getByRole('alert').props.children).toContain('整数');
    fireEvent.press(screen.getByText('投稿する'));
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('DBのinteger上限値は有効な賭けポイントとして送れる', async () => {
    mockWallet.mockResolvedValue({ data: { balance: 2_147_483_647 }, error: null });
    await ready(); fill('2147483647');
    await act(async () => { fireEvent.press(screen.getByText('投稿する')); });
    expect(mockRpc).toHaveBeenCalledWith('create_topic', expect.objectContaining({ p_bounty_amount: 2_147_483_647 }));
  });
  it('残高を超える報酬は送信しない', async () => {
    await ready(); fill('1001');
    fireEvent.press(screen.getByText('投稿する'));
    expect(screen.getByRole('alert').props.children).toContain('不足');
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('ギルドを切り替えても一覧を再取得せず、選択先に投稿する', async () => {
    await ready(); fill();
    fireEvent.press(screen.getByText('ゲームギルド'));
    await act(async () => { fireEvent.press(screen.getByText('投稿する')); });
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('create_topic', expect.objectContaining({ p_forum_id: 'f2' }));
  });
  it('初期30件にない指定ギルドも個別取得して表示する', async () => {
    mockParams = { forum: 'f3' };
    await ready(); fill();
    expect(screen.getByText('別のゲームギルド')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText('投稿する')); });
    expect(mockRpc).toHaveBeenCalledWith('create_topic', expect.objectContaining({ p_forum_id: 'f3' }));
  });
  it('取得に失敗した指定先を別のギルドへ勝手に変更せず、再読込を提供する', async () => {
    mockParams = { forum: 'missing' };
    mockTarget.mockResolvedValue({ data: null, error: null });
    render(<NewTopic />);
    await screen.findByText(/データの取得に失敗/);
    fill();
    fireEvent.press(screen.getByText('投稿する'));
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('一覧取得失敗中は投稿を禁止し、再読み込みで回復する', async () => {
    mockList.mockRejectedValueOnce(new Error('offline'));
    render(<NewTopic />);
    await screen.findByText(/データの取得に失敗/);
    fireEvent.press(screen.getByText('投稿する'));
    expect(mockRpc).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('再読み込み'));
    await screen.findByText('公開ギルド');
    expect(screen.queryByText(/データの取得に失敗/)).toBeNull();
  });
  it.each([null, { balance: -1 }, { balance: 1.5 }])('残高応答が不正なら投稿を禁止して残高を未確認表示する: %p', async (wallet) => {
    mockWallet.mockResolvedValue({ data: wallet, error: null });
    render(<NewTopic />);
    await screen.findByText(/データの取得に失敗/);
    expect(screen.getByText('保有 —')).toBeTruthy();
    expect(screen.getByRole('button', { name: '投稿する' }).props.accessibilityState.disabled).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('ギルド一覧の空応答は正常な0件と区別する', async () => {
    mockList.mockResolvedValue({ data: null, error: null });
    render(<NewTopic />);
    await screen.findByText(/データの取得に失敗/);
    expect(screen.queryByText('ギルドがありません')).toBeNull();
    expect(screen.getByRole('button', { name: '投稿する' }).props.accessibilityState.disabled).toBe(true);
  });
  it('再読込失敗時に以前の投稿先と残高を表示しない', async () => {
    const view = render(<NewTopic />);
    await screen.findByText('公開ギルド');
    expect(screen.getByText('保有 1,000P')).toBeTruthy();
    mockList.mockRejectedValueOnce(new Error('offline'));
    mockParams = { forum: 'f2' };
    view.rerender(<NewTopic />);
    await screen.findByText(/データの取得に失敗/);
    expect(screen.queryByText('公開ギルド')).toBeNull();
    expect(screen.getByText('保有 —')).toBeTruthy();
    expect(screen.getByRole('button', { name: '投稿する' }).props.accessibilityState.disabled).toBe(true);
  });
  it('投稿先取得中にアカウントが変われば古い残高と投稿先を表示しない', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'player' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'other' } }, error: null });
    render(<NewTopic />);
    await screen.findByText(/データの取得に失敗/);
    expect(screen.queryByText('公開ギルド')).toBeNull();
    expect(screen.getByText('保有 —')).toBeTruthy();
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('不正な投稿先は選択させず投稿を止める', async () => {
    mockList.mockResolvedValue({ data: [{ id: 'f1', name: '', type: 'public' }], error: null });
    render(<NewTopic />);
    await screen.findByText(/データの取得に失敗/);
    expect(screen.getByRole('button', { name: '投稿する' }).props.accessibilityState.disabled).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('投稿直前にアカウントが変わればRPCを送らない', async () => {
    await ready(); fill();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other' } }, error: null });
    await act(async () => { fireEvent.press(screen.getByText('投稿する')); });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('投稿していません', expect.any(String));
  });
  it('投稿RPC後にアカウントが変われば旧トピックへ遷移しない', async () => {
    let finish!: (value: unknown) => void;
    mockRpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await ready(); fill();
    fireEvent.press(screen.getByText('投稿する'));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other' } }, error: null });
    await act(async () => { finish({ data: { ok: true, topic_id: TOPIC_ID }, error: null }); });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('投稿結果を確認してください', expect.stringContaining('重複投稿'));
  });
  it('送信例外後は入力を保持し再試行できる', async () => {
    mockRpc.mockRejectedValueOnce(new Error('offline'));
    await ready(); fill('10');
    await act(async () => { fireEvent.press(screen.getByText('投稿する')); });
    expect(Alert.alert).toHaveBeenCalledWith('投稿結果を確認できませんでした', expect.any(String));
    expect(screen.getByLabelText('投稿本文').props.value).toBe('  本文です  ');
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(screen.getByText('投稿する')); });
    expect(mockReplace).toHaveBeenCalledWith(`/topic/${TOPIC_ID}`);
  });
  it.each([
    { ok: false, topic_id: TOPIC_ID },
    { ok: true, topic_id: 'not-a-uuid' },
    { ok: true },
  ])('成功条件を満たさない投稿応答では遷移せず結果確認を案内する: %p', async (result) => {
    mockRpc.mockResolvedValue({ data: result, error: null });
    await ready(); fill();
    await act(async () => { fireEvent.press(screen.getByText('投稿する')); });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('投稿結果を確認してください', expect.stringContaining('重複投稿'));
  });
});
