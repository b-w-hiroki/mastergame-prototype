import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useAction } from '@/lib/useAction';

describe('useAction', () => {
  afterEach(() => jest.restoreAllMocks());
  it('処理中の同時実行を防ぎ、完了後は次の操作を許可する', async () => {
    const { result } = renderHook(() => useAction());
    let finish!: () => void;
    const first = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const second = jest.fn(async () => {});
    let pending!: Promise<void>;
    act(() => { pending = result.current.run(first); });
    expect(result.current.busy).toBe(true);
    await act(async () => { await result.current.run(second); });
    expect(second).not.toHaveBeenCalled();
    await act(async () => { finish(); await pending; });
    expect(result.current.busy).toBe(false);
    await act(async () => { await result.current.run(second); });
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('例外後にロックを解除するが、自動で変更を再送しない', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result } = renderHook(() => useAction());
    const task = jest.fn(async () => { throw new Error('offline'); });
    await act(async () => { await result.current.run(task, '送信失敗'); });
    expect(task).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(false);
    expect(alert).toHaveBeenCalledWith('送信失敗', expect.stringContaining('反映されているか確認'));
  });
  it('画面を離れた後の遅い例外で、別の画面にエラーを出さない', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useAction());
    let reject!: (error: Error) => void;
    let pending!: Promise<void>;
    act(() => { pending = result.current.run(() => new Promise((_, fail) => { reject = fail; })); });
    unmount();
    await act(async () => { reject(new Error('late failure')); await pending; });
    expect(alert).not.toHaveBeenCalled();
  });
});
