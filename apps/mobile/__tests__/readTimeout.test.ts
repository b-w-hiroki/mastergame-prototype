import { withReadTimeout } from '@/lib/readTimeout';

describe('read deadline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('正常応答を返してタイマーを破棄する', async () => {
    await expect(withReadTimeout(Promise.resolve('value'))).resolves.toBe('value');
    expect(jest.getTimerCount()).toBe(0);
  });
  it('エラー応答を伝播してタイマーを破棄する', async () => {
    await expect(withReadTimeout(Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(jest.getTimerCount()).toBe(0);
  });
  it('15秒間応答しない読取は失敗として返す', async () => {
    const pending = withReadTimeout(new Promise<void>(() => {}));
    const assertion = expect(pending).rejects.toThrow('read timed out');
    jest.advanceTimersByTime(15_000);
    await assertion;
  });
  it('期限後に元の読取が成功しても失敗結果を上書きしない', async () => {
    let resolve!: (value: string) => void;
    const late = new Promise<string>((done) => { resolve = done; });
    const pending = withReadTimeout(late, 10);
    const assertion = expect(pending).rejects.toThrow('read timed out');
    jest.advanceTimersByTime(10);
    await assertion;
    resolve('old-data');
    await expect(pending).rejects.toThrow('read timed out');
  });
});
