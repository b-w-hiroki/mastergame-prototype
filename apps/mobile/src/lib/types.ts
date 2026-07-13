// MasterGame ドメイン型。単一ソース（@mastergame/shared）から re-export する。
// 列定義は packages/shared/src/database.types.ts（供給元は supabase/migrations）。
export type {
  Database,
  MissionType,
  CompletionStatus,
  DeliveryMethod,
  OfferStatus,
  Genre,
  Profile,
  Wallet,
  Mission,
  MissionCompletion,
  Offer,
  ExchangeItem,
  LedgerEntry,
  StakingAccrual,
  VipInfo,
  AppNotification,
  NudgeTarget,
} from '@mastergame/shared';

import type { Genre } from '@mastergame/shared';

export const GENRES: { key: Genre; label: string; emoji: string }[] = [
  { key: 'rpg', label: 'RPG', emoji: '⚔️' },
  { key: 'action', label: 'アクション', emoji: '💥' },
  { key: 'puzzle', label: 'パズル', emoji: '🧩' },
  { key: 'shooter', label: 'シューター', emoji: '🔫' },
  { key: 'strategy', label: 'ストラテジー', emoji: '♟️' },
  { key: 'sports', label: 'スポーツ', emoji: '⚽' },
  { key: 'sim', label: 'シミュレーション', emoji: '🏙️' },
  { key: 'casual', label: 'カジュアル', emoji: '🎲' },
];
