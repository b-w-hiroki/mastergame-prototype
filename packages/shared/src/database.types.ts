// ============================================================
// MasterGame — Supabase Database types
//
// 適用済みスキーマ（supabase/migrations/0001〜0014）から起こした型。
// Docker が使える環境では以下で再生成できる（列変更時は再生成推奨）:
//   supabase gen types typescript --local > packages/shared/src/database.types.ts
// アプリは createClient<Database>() でこの型を注入し、`as` キャストを排除する。
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamptz = string;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          handle: string | null;
          avatar_url: string | null;
          bio: string | null;
          xp: number;
          referral_code: string | null;   // 0023
          date_of_birth: string | null;   // 0024（年齢確認。1度だけ設定可）
          age_verified_at: Timestamptz | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id: string;
          username?: string | null;
          handle?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          xp?: number;
          referral_code?: string | null;
          date_of_birth?: string | null;
          age_verified_at?: Timestamptz | null;
          created_at?: Timestamptz;
          updated_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          slug: string;
          name: string;
          genre: string;
          icon_url: string | null;
          partner_id: string | null;
          is_active: boolean;
          created_at: Timestamptz;
          // 0025 ゲームハブ
          description: string | null;
          cover_url: string | null;
          publisher: string | null;
          platforms: string[];
          released_on: string | null;
          is_featured: boolean;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          genre: string;
          icon_url?: string | null;
          partner_id?: string | null;
          is_active?: boolean;
          created_at?: Timestamptz;
          description?: string | null;
          cover_url?: string | null;
          publisher?: string | null;
          platforms?: string[];
          released_on?: string | null;
          is_featured?: boolean;
        };
        Update: Partial<Database['public']['Tables']['games']['Insert']>;
        Relationships: [];
      };
      user_genres: {
        Row: { user_id: string; genre: string; created_at: Timestamptz };
        Insert: { user_id: string; genre: string; created_at?: Timestamptz };
        Update: Partial<Database['public']['Tables']['user_genres']['Insert']>;
        Relationships: [];
      };
      point_wallets: {
        Row: {
          user_id: string;
          balance: number;
          lifetime_earned: number;
          lifetime_spent: number;
          updated_at: Timestamptz;
        };
        Insert: {
          user_id: string;
          balance?: number;
          lifetime_earned?: number;
          lifetime_spent?: number;
          updated_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['point_wallets']['Insert']>;
        Relationships: [];
      };
      point_ledger: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          reason: string;
          ref_type: string | null;
          ref_id: string | null;
          status: string;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          delta: number;
          reason: string;
          ref_type?: string | null;
          ref_id?: string | null;
          status?: string;
          created_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['point_ledger']['Insert']>;
        Relationships: [];
      };
      missions: {
        Row: {
          id: string;
          type: string;
          title: string;
          description: string | null;
          reward_points: number;
          icon: string | null;
          max_progress: number;
          partner_id: string | null;
          event_type: string | null;
          requires_verification: boolean;
          starts_at: Timestamptz | null;
          ends_at: Timestamptz | null;
          is_active: boolean;
          created_at: Timestamptz;
          xp_reward: number;
        };
        Insert: {
          id?: string;
          type: string;
          title: string;
          description?: string | null;
          reward_points: number;
          icon?: string | null;
          max_progress?: number;
          partner_id?: string | null;
          event_type?: string | null;
          requires_verification?: boolean;
          starts_at?: Timestamptz | null;
          ends_at?: Timestamptz | null;
          is_active?: boolean;
          created_at?: Timestamptz;
          xp_reward?: number;
        };
        Update: Partial<Database['public']['Tables']['missions']['Insert']>;
        Relationships: [];
      };
      mission_completions: {
        Row: {
          id: string;
          user_id: string;
          mission_id: string;
          status: string;
          progress: number;
          ledger_id: string | null;
          completed_at: Timestamptz | null;
          created_at: Timestamptz;
          period_key: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          mission_id: string;
          status?: string;
          progress?: number;
          ledger_id?: string | null;
          completed_at?: Timestamptz | null;
          created_at?: Timestamptz;
          period_key?: string;
        };
        Update: Partial<Database['public']['Tables']['mission_completions']['Insert']>;
        Relationships: [];
      };
      exchange_items: {
        Row: {
          id: string;
          game_id: string | null;
          name: string;
          description: string | null;
          image_url: string | null;
          cost_points: number;
          delivery_method: string;
          stock: number | null;
          is_active: boolean;
          sort: number;
          created_at: Timestamptz;
          cost_rate_bps: number;
        };
        Insert: {
          id?: string;
          game_id?: string | null;
          name: string;
          description?: string | null;
          image_url?: string | null;
          cost_points: number;
          delivery_method?: string;
          stock?: number | null;
          is_active?: boolean;
          sort?: number;
          created_at?: Timestamptz;
          cost_rate_bps?: number;
        };
        Update: Partial<Database['public']['Tables']['exchange_items']['Insert']>;
        Relationships: [];
      };
      vip_tiers: {
        Row: {
          id: string;
          name: string;
          min_xp: number;
          staking_rate_bps: number;
          point_boost_bps: number;
          sort: number;
        };
        Insert: {
          id?: string;
          name: string;
          min_xp: number;
          staking_rate_bps: number;
          point_boost_bps?: number;
          sort: number;
        };
        Update: Partial<Database['public']['Tables']['vip_tiers']['Insert']>;
        Relationships: [];
      };
      staking_accruals: {
        Row: {
          id: string;
          user_id: string;
          period: string;
          base_balance: number;
          rate_bps: number;
          accrued_points: number;
          ledger_id: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          period: string;
          base_balance: number;
          rate_bps: number;
          accrued_points: number;
          ledger_id?: string | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['staking_accruals']['Insert']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          payload: Json;
          read_at: Timestamptz | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          payload?: Json;
          read_at?: Timestamptz | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
      offers: {
        Row: {
          id: string;
          network_id: string;
          external_id: string;
          title: string;
          description: string | null;
          icon_url: string | null;
          reward_points: number;
          event_type: string | null;
          countries: string[] | null;
          min_os: string | null;
          status: string;
          created_at: Timestamptz;
          offer_url: string | null;
        };
        Insert: {
          id?: string;
          network_id: string;
          external_id: string;
          title: string;
          description?: string | null;
          icon_url?: string | null;
          offer_url?: string | null;
          reward_points: number;
          event_type?: string | null;
          countries?: string[] | null;
          min_os?: string | null;
          status?: string;
          created_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['offers']['Insert']>;
        Relationships: [];
      };
      forums: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          type: string;
          game_id: string | null;
          visibility: string;
          is_open: boolean;
          opens_at: Timestamptz | null;
          closes_at: Timestamptz | null;
          created_by: string | null;
          created_at: Timestamptz;
          deleted_at: Timestamptz | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          type: string;
          game_id?: string | null;
          visibility?: string;
          is_open?: boolean;
          opens_at?: Timestamptz | null;
          closes_at?: Timestamptz | null;
          created_by?: string | null;
          created_at?: Timestamptz;
          deleted_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['forums']['Insert']>;
        Relationships: [];
      };
      topics: {
        Row: {
          id: string;
          forum_id: string;
          author_id: string;
          kind: string;
          title: string;
          status: string;
          best_answer_post_id: string | null;
          has_bounty: boolean;
          reply_count: number;
          last_activity_at: Timestamptz;
          moderation_state: string;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          forum_id: string;
          author_id: string;
          kind: string;
          title: string;
          status?: string;
          best_answer_post_id?: string | null;
          has_bounty?: boolean;
          reply_count?: number;
          last_activity_at?: Timestamptz;
          moderation_state?: string;
          created_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['topics']['Insert']>;
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          topic_id: string;
          author_id: string;
          body: string;
          media_url: string | null;
          is_op: boolean;
          moderation_state: string;
          created_at: Timestamptz;
          edited_at: Timestamptz | null;
          deleted_at: Timestamptz | null;
        };
        Insert: {
          id?: string;
          topic_id: string;
          author_id: string;
          body: string;
          media_url?: string | null;
          is_op?: boolean;
          moderation_state?: string;
          created_at?: Timestamptz;
          edited_at?: Timestamptz | null;
          deleted_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['posts']['Insert']>;
        Relationships: [];
      };
      reactions: {
        Row: {
          id: string;
          post_id: string;
          user_id: string;
          kind: string;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          post_id: string;
          user_id: string;
          kind?: string;
          created_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['reactions']['Insert']>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          target_type: string;
          target_id: string;
          reason: string;
          detail: string | null;
          status: string;
          created_at: Timestamptz;
          resolved_at: Timestamptz | null;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          target_type: string;
          target_id: string;
          reason: string;
          detail?: string | null;
          status?: string;
          created_at?: Timestamptz;
          resolved_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['reports']['Insert']>;
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          id: string;
          report_id: string | null;
          moderator_id: string | null;
          action: string;
          target_type: string;
          target_id: string;
          note: string | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          report_id?: string | null;
          moderator_id?: string | null;
          action: string;
          target_type: string;
          target_id: string;
          note?: string | null;
          created_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['moderation_actions']['Insert']>;
        Relationships: [];
      };
      offer_completions: {
        Row: {
          id: string;
          user_id: string;
          offer_id: string | null;
          network_id: string;
          network_txn_id: string;
          status: string;
          reward_points: number;
          ledger_id: string | null;
          created_at: Timestamptz;
          confirmed_at: Timestamptz | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          offer_id?: string | null;
          network_id: string;
          network_txn_id: string;
          status?: string;
          reward_points: number;
          ledger_id?: string | null;
          created_at?: Timestamptz;
          confirmed_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['offer_completions']['Insert']>;
        Relationships: [];
      };
      exchange_requests: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          cost_points: number;
          status: string;
          code: string | null;
          ledger_id: string | null;
          requested_at: Timestamptz;
          fulfilled_at: Timestamptz | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          cost_points: number;
          status?: string;
          code?: string | null;
          ledger_id?: string | null;
          requested_at?: Timestamptz;
          fulfilled_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['exchange_requests']['Insert']>;
        Relationships: [];
      };
      postback_events: {
        Row: {
          id: string;
          partner_id: string;
          transaction_id: string;
          click_id: string | null;
          user_id: string | null;
          mission_id: string | null;
          status: string;
          signature_valid: boolean | null;
          reward_points: number | null;
          ledger_id: string | null;
          raw: Json | null;
          received_at: Timestamptz;
          processed_at: Timestamptz | null;
        };
        Insert: {
          id?: string;
          partner_id: string;
          transaction_id: string;
          click_id?: string | null;
          user_id?: string | null;
          mission_id?: string | null;
          status?: string;
          signature_valid?: boolean | null;
          reward_points?: number | null;
          ledger_id?: string | null;
          raw?: Json | null;
          received_at?: Timestamptz;
          processed_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['postback_events']['Insert']>;
        Relationships: [];
      };
      fraud_flags: {
        Row: {
          id: string;
          user_id: string | null;
          flag_type: string;
          severity: string;
          detail: Json | null;
          created_at: Timestamptz;
          resolved_at: Timestamptz | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          flag_type: string;
          severity?: string;
          detail?: Json | null;
          created_at?: Timestamptz;
          resolved_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['fraud_flags']['Insert']>;
        Relationships: [];
      };
      user_moderation_state: {
        Row: {
          user_id: string;
          state: string;
          reason: string | null;
          expires_at: Timestamptz | null;
          set_by: string | null;
          updated_at: Timestamptz;
        };
        Insert: {
          user_id: string;
          state?: string;
          reason?: string | null;
          expires_at?: Timestamptz | null;
          set_by?: string | null;
          updated_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['user_moderation_state']['Insert']>;
        Relationships: [];
      };
      // 0029 連続ログイン（ストリーク）
      user_streaks: {
        Row: {
          user_id: string; current_streak: number; longest_streak: number;
          last_claim_on: string | null; total_claims: number; updated_at: Timestamptz;
        };
        Insert: {
          user_id: string; current_streak?: number; longest_streak?: number;
          last_claim_on?: string | null; total_claims?: number; updated_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['user_streaks']['Insert']>;
        Relationships: [];
      };
      streak_rewards: {
        Row: { day_index: number; reward_points: number; label: string | null };
        Insert: { day_index: number; reward_points: number; label?: string | null };
        Update: Partial<Database['public']['Tables']['streak_rewards']['Insert']>;
        Relationships: [];
      };
      // 0027 問い合わせ・CS
      inquiries: {
        Row: {
          id: string;
          user_id: string;
          category: string;
          subject: string;
          status: string;
          last_message_at: Timestamptz;
          created_at: Timestamptz;
          resolved_at: Timestamptz | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          category: string;
          subject: string;
          status?: string;
          last_message_at?: Timestamptz;
          created_at?: Timestamptz;
          resolved_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['inquiries']['Insert']>;
        Relationships: [];
      };
      inquiry_messages: {
        Row: {
          id: string;
          inquiry_id: string;
          author_id: string | null;
          is_staff: boolean;
          body: string;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          inquiry_id: string;
          author_id?: string | null;
          is_staff?: boolean;
          body: string;
          created_at?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['inquiry_messages']['Insert']>;
        Relationships: [];
      };
      // 0026 アカウント削除（退会）
      account_deletions: {
        Row: {
          user_id: string;
          status: string;
          reason: string | null;
          requested_at: Timestamptz;
          scheduled_at: Timestamptz;
          completed_at: Timestamptz | null;
        };
        Insert: {
          user_id: string;
          status?: string;
          reason?: string | null;
          requested_at?: Timestamptz;
          scheduled_at: Timestamptz;
          completed_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['account_deletions']['Insert']>;
        Relationships: [];
      };
      // 0025 タイトルのフォロー
      user_games: {
        Row: { user_id: string; game_id: string; followed_at: Timestamptz };
        Insert: { user_id: string; game_id: string; followed_at?: Timestamptz };
        Update: Partial<Database['public']['Tables']['user_games']['Insert']>;
        Relationships: [];
      };
      // 0023 招待・リファラル
      referrals: {
        Row: {
          id: string;
          referrer_id: string;
          referee_id: string;
          code: string;
          status: string;
          referee_ledger_id: string | null;
          referrer_ledger_id: string | null;
          created_at: Timestamptz;
          confirmed_at: Timestamptz | null;
        };
        Insert: {
          id?: string;
          referrer_id: string;
          referee_id: string;
          code: string;
          status?: string;
          referee_ledger_id?: string | null;
          referrer_ledger_id?: string | null;
          created_at?: Timestamptz;
          confirmed_at?: Timestamptz | null;
        };
        Update: Partial<Database['public']['Tables']['referrals']['Insert']>;
        Relationships: [];
      };
      // 0021 不正検知
      user_devices: {
        Row: {
          user_id: string;
          device_id: string;
          platform: string | null;
          model: string | null;
          os_version: string | null;
          is_emulator: boolean;
          first_seen: Timestamptz;
          last_seen: Timestamptz;
        };
        Insert: {
          user_id: string;
          device_id: string;
          platform?: string | null;
          model?: string | null;
          os_version?: string | null;
          is_emulator?: boolean;
          first_seen?: Timestamptz;
          last_seen?: Timestamptz;
        };
        Update: Partial<Database['public']['Tables']['user_devices']['Insert']>;
        Relationships: [];
      };
      fraud_settings: {
        Row: { key: string; value: number; note: string | null; updated_at: Timestamptz };
        Insert: { key: string; value: number; note?: string | null; updated_at?: Timestamptz };
        Update: Partial<Database['public']['Tables']['fraud_settings']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      user_vip: {
        Row: {
          user_id: string | null;
          xp: number | null;
          tier_name: string | null;
          staking_rate_bps: number | null;
        };
        Relationships: [];
      };
      admin_overview: {
        Row: {
          total_users: number | null;
          distributed_points: number | null;
          exchanged_points: number | null;
          exchange_users: number | null;
          open_reports: number | null;
          pending_postbacks: number | null;
          distributed_yen: number | null;
          exchanged_yen: number | null;
        };
        Relationships: [];
      };
      admin_user_rows: {
        Row: {
          id: string | null;
          username: string | null;
          handle: string | null;
          xp: number | null;
          earned: number | null;
          exchanged: number | null;
          balance: number | null;
          moderation_state: string | null;
          created_at: Timestamptz | null;
        };
        Relationships: [];
      };
      // 0022 ポイント経済の可視化
      economy_daily: {
        Row: {
          day: string | null;
          issued_points: number | null;
          spent_points: number | null;
          exchanged_points: number | null;
          earning_users: number | null;
          earn_events: number | null;
        };
        Relationships: [];
      };
      economy_by_reason: {
        Row: {
          reason: string | null;
          issued_points: number | null;
          spent_points: number | null;
          events: number | null;
          users: number | null;
        };
        Relationships: [];
      };
      economy_liability: {
        Row: {
          outstanding_points: number | null;
          outstanding_yen: number | null;
          outstanding_real_cost_yen: number | null;
          holders: number | null;
          max_balance: number | null;
        };
        Relationships: [];
      };
      admin_economy_summary: {
        Row: {
          issued_30d: number | null;
          spent_30d: number | null;
          exchanged_30d: number | null;
          earning_users_30d: number | null;
          issued_7d: number | null;
          issued_yen_30d: number | null;
          exchanged_yen_30d: number | null;
          real_cost_yen_30d: number | null;
          redemption_rate_pct: number | null;
          issued_yen_per_user_30d: number | null;
          outstanding_points: number | null;
          outstanding_yen: number | null;
          outstanding_real_cost_yen: number | null;
          holders: number | null;
          effective_cost_rate_pct: number | null;
          payout_ratio_pct: number | null;
        };
        Relationships: [];
      };
      // 0029 ストリークの集計
      admin_streak_summary: {
        Row: {
          users_with_streak: number | null; streak_3plus: number | null; streak_7plus: number | null;
          claimed_today: number | null; claimed_yesterday: number | null;
          avg_current_streak: number | null; best_streak: number | null;
        };
        Relationships: [];
      };
      // 0028 計測の集計
      analytics_daily: {
        Row: { day: string | null; active_users: number | null; events: number | null; sessions: number | null };
        Relationships: [];
      };
      event_funnel: {
        Row: { name: string | null; events: number | null; users: number | null; last_seen: Timestamptz | null };
        Relationships: [];
      };
      mission_funnel: {
        Row: {
          viewed: number | null; tapped: number | null; claimed: number | null;
          view_to_tap_pct: number | null; tap_to_claim_pct: number | null; overall_pct: number | null;
        };
        Relationships: [];
      };
      retention_cohorts: {
        Row: {
          cohort_date: string | null; cohort_size: number | null;
          d1: number | null; d7: number | null; d30: number | null;
          d1_pct: number | null; d7_pct: number | null;
        };
        Relationships: [];
      };
      // 0027 問い合わせのレビュー用
      admin_inquiry_rows: {
        Row: {
          id: string | null;
          user_id: string | null;
          category: string | null;
          subject: string | null;
          status: string | null;
          created_at: Timestamptz | null;
          last_message_at: Timestamptz | null;
          resolved_at: Timestamptz | null;
          handle: string | null;
          username: string | null;
          balance: number | null;
          message_count: number | null;
          last_message: string | null;
          last_from_staff: boolean | null;
        };
        Relationships: [];
      };
      // 0026 退会のレビュー用
      admin_deletion_rows: {
        Row: {
          user_id: string | null;
          status: string | null;
          reason: string | null;
          requested_at: Timestamptz | null;
          scheduled_at: Timestamptz | null;
          completed_at: Timestamptz | null;
          handle: string | null;
          username: string | null;
          balance: number | null;
        };
        Relationships: [];
      };
      // 0025 ゲームハブ一覧
      game_hub_rows: {
        Row: {
          id: string | null;
          slug: string | null;
          name: string | null;
          genre: string | null;
          description: string | null;
          icon_url: string | null;
          cover_url: string | null;
          publisher: string | null;
          platforms: string[] | null;
          released_on: string | null;
          is_featured: boolean | null;
          forum_id: string | null;
          followers: number | null;
          topic_count: number | null;
          last_activity_at: Timestamptz | null;
        };
        Relationships: [];
      };
      // 0024 法務文書の最新版（未ログインでも参照可）
      current_legal_documents: {
        Row: {
          slug: string | null;
          id: string | null;
          version: string | null;
          title: string | null;
          body: string | null;
          requires_consent: boolean | null;
          published_at: Timestamptz | null;
        };
        Relationships: [];
      };
      wallet_expiry: {
        Row: {
          user_id: string | null;
          balance: number | null;
          last_activity_at: Timestamptz | null;
          expires_on: string | null;
        };
        Relationships: [];
      };
      // 0023 招待のレビュー用
      admin_referral_rows: {
        Row: {
          id: string | null;
          status: string | null;
          code: string | null;
          created_at: Timestamptz | null;
          confirmed_at: Timestamptz | null;
          referrer_id: string | null;
          referrer_handle: string | null;
          referee_id: string | null;
          referee_handle: string | null;
          referrer_state: string | null;
          referee_state: string | null;
          referrer_linked_accounts: number | null;
        };
        Relationships: [];
      };
      // 0021 不正検知のレビュー用
      admin_fraud_rows: {
        Row: {
          id: string | null;
          user_id: string | null;
          flag_type: string | null;
          severity: string | null;
          detail: Json | null;
          created_at: Timestamptz | null;
          resolved_at: Timestamptz | null;
          handle: string | null;
          username: string | null;
          moderation_state: string | null;
          balance: number | null;
          linked_accounts: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      claim_mission: { Args: { p_mission_id: string }; Returns: Json };
      request_exchange: { Args: { p_item_id: string }; Returns: Json };
      next_nudge_target: { Args: Record<string, never>; Returns: Json };
      create_topic: {
        Args: { p_forum_id: string; p_kind: string; p_title: string; p_body: string; p_bounty_amount?: number };
        Returns: Json;
      };
      add_reply: { Args: { p_topic_id: string; p_body: string }; Returns: Json };
      toggle_reaction: { Args: { p_post_id: string; p_kind?: string }; Returns: Json };
      set_best_answer: { Args: { p_topic_id: string; p_post_id: string }; Returns: Json };
      // 0017 economy paths
      fulfill_exchange: { Args: { p_request_id: string; p_code?: string | null }; Returns: Json };
      cancel_exchange: { Args: { p_request_id: string; p_reason?: string }; Returns: Json };
      mark_notification_read: { Args: { p_id: string }; Returns: Json };
      record_ad_impression: { Args: { p_placement: string; p_ad_type: string; p_network_id?: string | null }; Returns: Json };
      // 0029 連続ログイン（ストリーク）
      claim_daily_streak: { Args: Record<string, never>; Returns: Json };
      my_streak: { Args: Record<string, never>; Returns: Json };
      service_today: { Args: Record<string, never>; Returns: string };
      // 0028 行動イベント計測
      record_events: { Args: { p_events: Json }; Returns: Json };
      purge_app_events: { Args: { p_dry_run?: boolean }; Returns: Json };
      // 0027 問い合わせ・CS
      create_inquiry: { Args: { p_category: string; p_subject: string; p_body: string }; Returns: Json };
      reply_to_inquiry: { Args: { p_inquiry_id: string; p_body: string }; Returns: Json };
      answer_inquiry: { Args: { p_inquiry_id: string; p_body: string; p_resolve?: boolean }; Returns: Json };
      close_inquiry: { Args: { p_inquiry_id: string }; Returns: Json };
      support_user_context: { Args: { p_user: string }; Returns: Json };
      // 0026 アカウント削除（退会）
      request_account_deletion: { Args: { p_reason?: string | null }; Returns: Json };
      cancel_account_deletion: { Args: Record<string, never>; Returns: Json };
      my_account_deletion: { Args: Record<string, never>; Returns: Json };
      // 0025 ゲームハブ
      my_game_feed: {
        Args: { p_limit?: number };
        Returns: {
          topic_id: string;
          forum_id: string;
          game_id: string;
          game_name: string;
          kind: string;
          title: string;
          reply_count: number;
          has_bounty: boolean;
          last_activity_at: Timestamptz;
        }[];
      };
      // 0024 法務・年齢確認・有効期限
      accept_legal: { Args: { p_slug: string; p_version: string }; Returns: Json };
      pending_legal_consents: { Args: Record<string, never>; Returns: Json };
      set_date_of_birth: { Args: { p_dob: string }; Returns: Json };
      // 0023 招待・リファラル
      my_referral_status: { Args: Record<string, never>; Returns: Json };
      redeem_referral_code: { Args: { p_code: string }; Returns: Json };
      register_push_token: { Args: { p_token: string; p_platform: string }; Returns: undefined };
      remove_push_token: { Args: { p_token: string }; Returns: undefined };
      // 0021 不正検知
      register_device: {
        Args: {
          p_device_id: string;
          p_platform?: string | null;
          p_model?: string | null;
          p_os_version?: string | null;
          p_is_emulator?: boolean;
        };
        Returns: Json;
      };
      resolve_fraud_flag: { Args: { p_flag_id: string; p_action: string; p_note?: string | null }; Returns: Json };
      track_click: { Args: { p_mission_id: string; p_device_fp?: string | null; p_ip?: string | null; p_ua?: string | null }; Returns: string };
      accrue_staking: { Args: { p_period: string }; Returns: Json };
      confirm_offer: {
        Args: { p_network_code: string; p_network_txn_id: string; p_user: string; p_offer_external_id?: string | null; p_reward_override?: number | null };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// 便利エイリアス
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];
