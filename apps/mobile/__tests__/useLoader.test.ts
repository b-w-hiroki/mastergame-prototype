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
});
