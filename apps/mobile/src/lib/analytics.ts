import { Platform } from 'react-native';
import { supabase } from './supabase';

export type TrackedEvent = {
  name: string;
  params?: Record<string, unknown>;
  session_id?: string;
  platform?: string;
};

type Sender = (events: TrackedEvent[]) => Promise<void>;

export type Tracker = {
  track: (name: string, params?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  size: () => number;
};

/**
 * イベントのバッファリング。1件ごとに通信すると電池と通信量を無駄にするので、
 * 一定件数たまったら / 明示的な flush でまとめて送る。
 *
 * 送信失敗時はイベントを捨てずにバッファへ戻す（オフラインでも復帰後に届く）。
 * ただし無制限に持つとメモリを圧迫するので上限を設け、**古い方から捨てる**
 * （直近の行動のほうが分析価値が高い）。
 *
 * 計測はアプリの機能ではないので、**何があってもアプリを壊さない**のが最優先。
 * 送信の例外は握りつぶす。
 */
export function createTracker(opts: {
  send: Sender;
  flushSize?: number;
  maxBuffer?: number;
  sessionId?: string;
}): Tracker {
  const flushSize = opts.flushSize ?? 10;
  const maxBuffer = opts.maxBuffer ?? 100;
  let buffer: TrackedEvent[] = [];
  let sending = false;

  function track(name: string, params?: Record<string, unknown>) {
    buffer.push({
      name,
      params: params ?? {},
      session_id: opts.sessionId,
      platform: Platform.OS,
    });
    // 上限超過分は古い方から捨てる
    if (buffer.length > maxBuffer) buffer = buffer.slice(buffer.length - maxBuffer);
    if (buffer.length >= flushSize) void flush();
  }

  async function flush() {
    // 多重送信で同じイベントが二重に届かないようにする
    if (sending || buffer.length === 0) return;
    sending = true;
    const batch = buffer;
    buffer = [];
    try {
      await opts.send(batch);
    } catch {
      // 送れなかった分は戻して次の機会に再送（新しいものを優先して残す）
      buffer = [...batch, ...buffer].slice(-maxBuffer);
    } finally {
      sending = false;
    }
  }

  return { track, flush, size: () => buffer.length };
}

// ---- アプリで使うシングルトン ----

const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const tracker = createTracker({
  sessionId,
  send: async (events) => {
    const { error } = await supabase.rpc('record_events', {
      p_events: events as unknown as never,
    });
    if (error) throw error;
  },
});

/** イベントを記録する。計測失敗でアプリを止めないため、例外は投げない。 */
export function track(name: string, params?: Record<string, unknown>): void {
  try {
    tracker.track(name, params);
  } catch {
    // no-op
  }
}

/** 画面遷移やバックグラウンド移行のタイミングで呼ぶ。 */
export function flushEvents(): Promise<void> {
  return tracker.flush().catch(() => {});
}

/** 計測しているイベント名（サーバ側の形式検証と揃える: 英小文字・数字・_） */
export const EVENTS = {
  appOpen: 'app_open',
  missionListView: 'mission_list_view',
  missionClaimTap: 'mission_claim_tap',
  missionClaimed: 'mission_claimed',
  offerTap: 'offer_tap',
  exchangeRequested: 'exchange_requested',
  inviteShared: 'invite_shared',
  streakClaimTap: 'streak_claim_tap',
  streakClaimed: 'streak_claimed',
} as const;
