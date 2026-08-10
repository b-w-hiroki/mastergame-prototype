// 通知の表示と遷移先の解決（純粋ロジック・単体テスト対象）。
//
// 通知はサーバ側の各機能（コミュニティ 0004 / CS 0027 / 失効 0024 / 退会 0026）が
// type + payload(jsonb) で投げ込んでくる。表示文言と「タップでどこへ飛ぶか」を
// ここに一元化し、画面側は結果を描くだけにする。
// 未知の type が来てもアプリが壊れないこと（フォールバック）が最重要。

import type { AppNotification } from '@mastergame/shared';

export type NotificationView = {
  icon: string;
  title: string;
  body: string | null;
  /** expo-router の遷移先。null なら「開くだけ（既読化のみ）」 */
  href: string | null;
};

type Payload = Record<string, unknown>;

const str = (p: Payload, key: string): string | null => {
  const v = p[key];
  return typeof v === 'string' && v !== '' ? v : null;
};
const num = (p: Payload, key: string): number | null => {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** 通知1件を表示用に解決する。未知の type は汎用表示に落とす。 */
export function resolveNotification(n: AppNotification): NotificationView {
  const p = (n.payload ?? {}) as Payload;

  switch (n.type) {
    // ---- CS（0027）----
    case 'inquiry_answered':
      return {
        icon: '💬',
        title: 'お問い合わせに回答があります',
        body: str(p, 'subject'),
        href: str(p, 'inquiry_id') ? `/support/${str(p, 'inquiry_id')}` : '/support',
      };

    // ---- ポイント失効（0024）----
    case 'point_expiry_notice': {
      const balance = num(p, 'balance');
      const expiresOn = str(p, 'expires_on');
      return {
        icon: '⏳',
        title: 'ポイントの有効期限が近づいています',
        body:
          balance != null && expiresOn
            ? `${balance.toLocaleString()} P が ${formatDate(expiresOn)} に失効します。お早めにご利用ください。`
            : '保有ポイントの有効期限が近づいています。',
        href: '/exchange',   // 「使う」への最短導線
      };
    }
    case 'point_expired': {
      const points = num(p, 'points');
      return {
        icon: '⌛',
        title: 'ポイントが失効しました',
        body: points != null ? `${points.toLocaleString()} P が有効期限切れで失効しました。` : null,
        href: '/points',
      };
    }

    // ---- コミュニティ（0004/0012）----
    case 'reply':
      return {
        icon: '↩️',
        title: 'あなたのトピックに返信がありました',
        body: str(p, 'topic_title'),
        href: str(p, 'topic_id') ? `/topic/${str(p, 'topic_id')}` : null,
      };
    case 'best_answer': {
      const amount = num(p, 'amount');
      return {
        icon: '🏆',
        title: 'ベストアンサーに選ばれました',
        body: amount != null ? `報酬 ${amount.toLocaleString()} P を獲得しました。` : null,
        href: str(p, 'topic_id') ? `/topic/${str(p, 'topic_id')}` : null,
      };
    }
    case 'reaction':
      return {
        icon: '👍',
        title: 'あなたの投稿にリアクションがつきました',
        body: null,
        href: str(p, 'topic_id') ? `/topic/${str(p, 'topic_id')}` : null,
      };
    case 'report_result':
      return {
        icon: '🛡️',
        title: '通報の対応が完了しました',
        body: 'ご協力ありがとうございました。',
        href: null,
      };

    // ---- 未知の type（将来の追加や運営の手動通知）----
    default:
      return {
        icon: '🔔',
        title: str(p, 'title') ?? 'お知らせ',
        body: str(p, 'body'),
        href: str(p, 'href'),   // payload に href があれば従う
      };
  }
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 相対時刻（一覧の右肩用） */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return '';
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const dDays = Math.floor(h / 24);
  if (dDays < 30) return `${dDays}日前`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
