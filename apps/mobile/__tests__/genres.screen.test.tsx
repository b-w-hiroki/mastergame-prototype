import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { OnboardingCompletedContext } from '@/lib/onboarding';
const mockSelect = jest.fn();
const mockUpsert = jest.fn();
const mockRemove = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getUser: () => Promise.resolve({ data: { user: { id: 'player' } } }) },
  from: () => ({
    select: () => ({ eq: () => mockSelect() }),
    upsert: (...a: unknown[]) => mockUpsert(...a),
    delete: () => ({ eq: () => ({ not: () => mockRemove() }) }),
  }),
} }));
import Genres from '../app/genres';
describe('genre settings', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSelect.mockResolvedValue({ data: [{ genre: 'rpg' }], error: null });
    mockUpsert.mockResolvedValue({ error: null });
    mockRemove.mockResolvedValue({ error: null });
  });
  afterEach(() => jest.restoreAllMocks());
  it('保存完了をルートへ通知してからホームへ進む', async () => {
    const completed = jest.fn();
    render(<OnboardingCompletedContext.Provider value={completed}><Genres /></OnboardingCompletedContext.Provider>);
    await screen.findByText('決定（1）');
    await act(async () => { fireEvent.press(screen.getByText('決定（1）')); });
    expect(mockUpsert).toHaveBeenCalledWith([{ user_id: 'player', genre: 'rpg' }], expect.anything());
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
  it('通信例外後も選択を保持し再試行できる', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('offline'));
    render(<Genres />);
    await screen.findByText('決定（1）');
    await act(async () => { fireEvent.press(screen.getByText('決定（1）')); });
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('ジャンルを保存できませんでした', expect.any(String));
    await act(async () => { fireEvent.press(screen.getByText('決定（1）')); });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
  it('取得失敗時は保存を防ぎ、再読み込みで回復する', async () => {
    mockSelect.mockRejectedValueOnce(new Error('offline'));
    render(<Genres />);
    await screen.findByRole('alert');
    fireEvent.press(screen.getByText('決定（0）'));
    expect(mockUpsert).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('再読み込み'));
    await screen.findByText('決定（1）');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it.each([null, [{ genre: 'unknown' }]])('空・不正な設定は未選択として保存せず再読込を促す: %p', async (rows) => {
    mockSelect.mockResolvedValue({ data: rows, error: null });
    render(<Genres />);
    await screen.findByRole('alert');
    expect(screen.queryByText('決定（0）')).toBeTruthy();
    expect(screen.getByRole('button', { name: '決定（0）' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('checkbox', { name: /RPG/ }).props.accessibilityState.disabled).toBe(true);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
  it('再読込失敗時に古い選択を破棄し、回復後は取得値を表示する', async () => {
    render(<Genres />);
    await screen.findByText('決定（1）');
    mockSelect.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(screen.getByText('設定を再読み込み'));
    await screen.findByRole('alert');
    expect(screen.getByText('決定（0）')).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('再読み込み'));
    await screen.findByText('決定（1）');
  });
});
