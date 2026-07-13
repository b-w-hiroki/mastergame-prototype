// MasterGame 共通型のエントリポイント。
// Database 型（自動生成相当）と、アプリ横断のドメイン型・定数を単一ソース化する。
export type { Database, Json, Tables, Views } from './database.types';
import type { Tables, Views } from './database.types';

// ---- ドメイン enum（DB の check 制約に対応） ----
export type MissionType = 'daily' | 'weekly' | 'achievement' | 'event' | 'offer';
export type CompletionStatus = 'pending' | 'confirmed' | 'rejected' | 'reversed';
export type DeliveryMethod = 'csv' | 'code' | 'api';
export type OfferStatus = 'active' | 'paused' | 'expired';

export type Genre =
  | 'rpg' | 'action' | 'puzzle' | 'shooter' | 'strategy' | 'sports' | 'sim' | 'casual';

// ---- テーブル/ビュー Row から派生するドメイン型（単一ソース） ----
export type Profile = Tables<'profiles'>;
export type Wallet = Tables<'point_wallets'>;
export type Mission = Tables<'missions'>;
export type MissionCompletion = Tables<'mission_completions'>;
export type Offer = Tables<'offers'>;
export type ExchangeItem = Tables<'exchange_items'>;
export type LedgerEntry = Tables<'point_ledger'>;
export type StakingAccrual = Tables<'staking_accruals'>;
export type VipInfo = Views<'user_vip'>;
export type AdminUserRow = Views<'admin_user_rows'>;
export type AdminOverview = Views<'admin_overview'>;

export interface AppNotification {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// next_nudge_target RPC の戻り値（jsonb）
export interface NudgeTarget {
  item_id?: string;
  item_name?: string;
  gap?: number;
  cost?: number;
  all_affordable?: boolean;
}
