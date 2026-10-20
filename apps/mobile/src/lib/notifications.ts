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
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
};
const detailHref = (base: string, p: Payload, key: string, fallback: string | null = null): string | null => {
  const id = str(p, key);
  return id && /^[a-z0-9_-]+$/i.test(id) ? `${base}/${encodeURIComponent(id)}` : fallback;
};
// 通知由来の遷移は既知のアプリ内ルートのみ。外部URLや認証画面へは飛ばさない。
const internalHref = (href: string | null): string | null => {
  if (!href || /[\s\\\u0000-\u001f\u007f]/.test(href)) return null;
  const path = href.split(/[?#]/, 1)[0];
  return /^\/(?:|points|missions|mypage|community|notifications|games|invite|support|genres|onboarding|exchange|(?:topic|support|games)\/[a-z0-9_-]+|legal\/(?:terms|privacy|tokushoho))$/i.test(path) ? href : null;
};
const exchangeHistoryHref = (p: Payload): string => {
  const requestId = str(p, 'request_id');
  return '/points?section=history' + (requestId ? `&request_id=${encodeURIComponent(requestId)}` : '');
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
        href: detailHref('/support', p, 'inquiry_id', '/support'),
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
        href: '/points?section=exchange',   // 「使う」への最短導線
      };
    }
    case 'point_expired': {
      const points = num(p, 'points');
      return {
        icon: '⌛',
        title: 'ポイントが失効しました',
        body: points != null ? `${points.toLocaleString()} P が有効期限切れで失効しました。` : null,
        href: '/points?section=history',
      };
    }

    // ---- ポイント交換（0017）----
    case 'exchange_fulfilled':
      return {
        icon: '🎁',
        title: 'ポイント交換が完了しました',
        body: p.has_code === true
          ? '受取コードを交換履歴で確認できます。'
          : '交換申請が完了しました。詳細は交換履歴で確認できます。',
        href: exchangeHistoryHref(p),
      };
    case 'exchange_cancelled': {
      const refunded = num(p, 'refunded');
      return {
        icon: '↩️',
        title: 'ポイント交換が取り消されました',
        body: refunded != null
          ? `${refunded.toLocaleString()} P が返還されました。交換履歴をご確認ください。`
          : '交換履歴とポイント残高をご確認ください。',
        href: exchangeHistoryHref(p),
      };
    }

    // ---- コミュニティ（0004/0012）----
    case 'reply':
      return {
        icon: '↩️',
        title: 'あなたのトピックに返信がありました',
        body: str(p, 'topic_title'),
        href: detailHref('/topic', p, 'topic_id'),
      };
    case 'best_answer': {
      const amount = num(p, 'amount');
      return {
        icon: '🏆',
        title: 'ベストアンサーに選ばれました',
        body: amount != null ? `報酬 ${amount.toLocaleString()} P を獲得しました。` : null,
        href: detailHref('/topic', p, 'topic_id'),
      };
    }
    case 'reaction':
      return {
        icon: '👍',
        title: 'あなたの投稿にリアクションがつきました',
        body: null,
        href: detailHref('/topic', p, 'topic_id'),
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
        href: internalHref(str(p, 'href')),
      };
  }
}

export function formatDate(iso: string): string {
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (calendarDate) {
    const date = new Date(`${iso}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return iso;
    return `${Number(calendarDate[1])}年${Number(calendarDate[2])}月${Number(calendarDate[3])}日`;
  }
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
