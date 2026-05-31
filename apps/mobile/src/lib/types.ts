// MasterGame ドメイン型（supabase/migrations と対応）。
// 本番では `supabase gen types typescript` で自動生成に置換してください。

export type MissionType = 'daily' | 'weekly' | 'achievement' | 'event' | 'offer';
export type CompletionStatus = 'pending' | 'confirmed' | 'rejected' | 'reversed';

export interface Profile {
  id: string;
  username: string | null;
  handle: string | null;
  avatar_url: string | null;
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
  reward_points: number;
  icon: string | null;
  max_progress: number;
  requires_verification: boolean;
}

export interface ExchangeItem {
  id: string;
  name: string;
  cost_points: number;
  delivery_method: 'csv' | 'code' | 'api';
  stock: number | null;
  game_id: string | null;
}

export interface NudgeTarget {
  item_id?: string;
  item_name?: string;
  gap?: number;
  cost?: number;
  all_affordable?: boolean;
}
