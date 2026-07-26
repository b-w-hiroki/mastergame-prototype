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
