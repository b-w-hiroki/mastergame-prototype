jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

import { createTracker, setAnalyticsUser, track, flushEvents } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';

describe('createTracker', () => {
  it('flushSize に達するまで送らない（1件ずつ通信しない）', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const t = createTracker({ send, flushSize: 3 });
    t.track('a_event');
    t.track('b_event');
    expect(send).not.toHaveBeenCalled();
    expect(t.size()).toBe(2);
  });

  it('flushSize に達したらまとめて送る', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const t = createTracker({ send, flushSize: 3 });
    t.track('a_event'); t.track('b_event'); t.track('c_event');
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(3);
  });

  it('params と session_id / platform を添えて送る', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const t = createTracker({ send, flushSize: 1, sessionId: 'sess-1' });
    t.track('mission_claim_tap', { mission_id: 'm1' });
    await Promise.resolve();
    const [event] = send.mock.calls[0][0];
    expect(event).toMatchObject({
      name: 'mission_claim_tap',
      params: { mission_id: 'm1' },
      session_id: 'sess-1',
    });
    expect(typeof event.platform).toBe('string');
  });

  it('明示的な flush で残りを送り、バッファを空にする', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const t = createTracker({ send, flushSize: 10 });
    t.track('a_event');
    await t.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(t.size()).toBe(0);
  });

  it('空のバッファでは送信しない', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const t = createTracker({ send, flushSize: 10 });
    await t.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('送信に失敗したらイベントを捨てず、次の機会に再送する', async () => {
    const send = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const t = createTracker({ send, flushSize: 10 });
    t.track('a_event');
    await t.flush();
    expect(t.size()).toBe(1); // 捨てずに戻っている

    await t.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toHaveLength(1);
    expect(t.size()).toBe(0);
  });

  it('バッファ上限を超えたら古い方から捨てる（新しい行動を優先）', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const t = createTracker({ send, flushSize: 1000, maxBuffer: 3 });
    t.track('e1_event'); t.track('e2_event'); t.track('e3_event'); t.track('e4_event');
    expect(t.size()).toBe(3);
    await t.flush();
    expect(send.mock.calls[0][0].map((e: { name: string }) => e.name))
      .toEqual(['e2_event', 'e3_event', 'e4_event']);
  });

  it('送信中の再入で同じイベントを二重送信しない', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const send = jest.fn().mockImplementation(() => gate);
    const t = createTracker({ send, flushSize: 1000 });
    t.track('a_event');

    const first = t.flush();
    await Promise.resolve();
    await t.flush();           // 送信中なので何もしない
    expect(send).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(t.size()).toBe(0);
  });

  it('計測が失敗してもエラーを外に投げない', async () => {
    const send = jest.fn().mockRejectedValue(new Error('boom'));
    const t = createTracker({ send, flushSize: 1 });
    t.track('a_event');
    await expect(t.flush()).resolves.toBeUndefined();
  });
  it('アカウントの切替で未送信分を消去し、新しいセッションIDを使う', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const t = createTracker({ send, sessionId: 'first' });
    t.track('old_event');
    t.reset('second');
    t.track('new_event');
    await t.flush();
    expect(send.mock.calls[0][0]).toEqual([expect.objectContaining({ name: 'new_event', session_id: 'second' })]);
  });
  it('切替前の送信が遅れて失敗しても、古いイベントを新しいバッファへ戻さない', async () => {
    let reject!: (error: Error) => void;
    const send = jest.fn().mockReturnValueOnce(new Promise((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
    const t = createTracker({ send });
    t.track('old_event');
    const pending = t.flush();
    t.reset('second');
    t.track('new_event');
    reject(new Error('offline'));
    await pending;
    await t.flush();
    expect(send.mock.calls[1][0].map((e: { name: string }) => e.name)).toEqual(['new_event']);
  });
});

describe('analytics account binding', () => {
  beforeEach(() => {
    setAnalyticsUser(null);
    (supabase.rpc as jest.Mock).mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => setAnalyticsUser(null));
  it('未認証中の行動を次のログインへ持ち越さない', async () => {
    track('anonymous_event');
    setAnalyticsUser('player');
    track('signed_in_event');
    await flushEvents();
    const events = (supabase.rpc as jest.Mock).mock.calls[0][1].p_events;
    expect(events.map((event: { name: string }) => event.name)).toEqual(['signed_in_event']);
  });
  it('同じユーザーのトークン更新では未送信イベントを消さない', async () => {
    setAnalyticsUser('player');
    track('one_event');
    expect(setAnalyticsUser('player')).toBe(false);
    await flushEvents();
    expect((supabase.rpc as jest.Mock).mock.calls[0][1].p_events).toHaveLength(1);
  });
});
