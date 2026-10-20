import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useLoader } from '@/lib/useLoader';

describe('useLoader', () => {
  it('runs load on mount and clears loading', async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLoader(load));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('captures errors into error state instead of throwing', async () => {
    const load = jest.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useLoader(load));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.loading).toBe(false);
  });

  it('does NOT auto-run when auto:false', async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLoader(load, { auto: false }));
    // 自動実行しないので load は呼ばれない（focus 駆動画面向け）
    await act(async () => { await Promise.resolve(); });
    expect(load).not.toHaveBeenCalled();
    // reload で明示実行できる
    await act(async () => { await result.current.reload(); });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reload clears a prior error on success', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useLoader(load));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(async () => { await result.current.reload(); });
    expect(result.current.error).toBeNull();
  });

  it('新しい読込の後に古い読込が失敗してもエラーを上書きしない', async () => {
    let rejectOld!: (error: Error) => void;
    const load = jest.fn().mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useLoader(load, { auto: false }));
    let old!: Promise<void>;
    await act(async () => { old = result.current.reload(); });
    await act(async () => { await result.current.reload(); });
    await act(async () => { rejectOld(new Error('old offline')); await old; });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('新しい読込や画面離脱後は古い結果を反映しない', async () => {
    const checks: Array<() => boolean> = [];
    const load = jest.fn(async (isCurrent: () => boolean) => { checks.push(isCurrent); });
    const { result } = renderHook(() => useLoader(load, { auto: false }));
    await act(async () => { await result.current.reload(); });
    expect(checks[0]()).toBe(true);
    await act(async () => { await result.current.reload(); });
    expect(checks[0]()).toBe(false);
    expect(checks[1]()).toBe(true);
    act(() => { result.current.cancel(); });
    expect(checks[1]()).toBe(false);
  });

  it('古い更新が完了しても新しい更新中表示を解除しない', async () => {
    const resolve: Array<() => void> = [];
    const load = jest.fn(() => new Promise<void>((done) => { resolve.push(done); }));
    const { result } = renderHook(() => useLoader(load, { auto: false }));
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => { first = result.current.onRefresh(); });
    await act(async () => { second = result.current.onRefresh(); });
    expect(result.current.refreshing).toBe(true);
    await act(async () => { resolve[0](); await first; });
    expect(result.current.refreshing).toBe(true);
    await act(async () => { resolve[1](); await second; });
    expect(result.current.refreshing).toBe(false);
  });
});
