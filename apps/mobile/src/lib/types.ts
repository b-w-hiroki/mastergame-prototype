// MasterGame ドメイン型（supabase/migrations と対応）。
// 本番では `supabase gen types typescript` で自動生成に置換してください。

export type MissionType = 'daily' | 'weekly' | 'achievement' | 'event' | 'offer';
export type CompletionStatus = 'pending' | 'confirmed' | 'rejected' | 'reversed';

export type Genre =
  | 'rpg' | 'action' | 'puzzle' | 'shooter' | 'strategy' | 'sports' | 'sim' | 'casual';

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

export interface Profile {
  id: string;
  username: string | null;
  handle: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number;
}

export interface Wallet {
  user_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
}

export interface Mission {
  id: string;
  type: MissionType;
  title: string;
  description: string | null;
  reward_points: number;
  icon: string | null;
  max_progress: number;
  requires_verification: boolean;
  ends_at: string | null;
}

export interface MissionCompletion {
  id: string;
  mission_id: string;
  status: CompletionStatus;
  progress: number;
  completed_at: string | null;
  created_at: string;
}

export interface Offer {
  id: string;
  title: string;
  description: string | null;
  icon_url: string | null;
  reward_points: number;
  event_type: string | null;
  status: 'active' | 'paused' | 'expired';
}

export interface ExchangeItem {
  id: string;
  name: string;
  cost_points: number;
  delivery_method: 'csv' | 'code' | 'api';
  stock: number | null;
  game_id: string | null;
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  ref_type: string | null;
  status: CompletionStatus;
  created_at: string;
}

export interface VipInfo {
  user_id: string;
  xp: number;
  tier_name: string | null;
  staking_rate_bps: number | null;
}

export interface StakingAccrual {
  id: string;
  period: string;
  base_balance: number;
  rate_bps: number;
  accrued_points: number;
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NudgeTarget {
  item_id?: string;
  item_name?: string;
  gap?: number;
  cost?: number;
  all_affordable?: boolean;
}
