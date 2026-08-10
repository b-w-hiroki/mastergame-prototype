-- ============================================================
-- 0030: 権限の明示的な剥奪（Supabase の既定付与に対する多層防御）
--
-- ■ 背景（テストハーネスの欠陥から判明）
-- Supabase は public スキーマのテーブルに対し anon / authenticated へ
-- **既定で全権限を付与**する（だから RLS が必須になる）。
-- ところがテストハーネスがこれを再現していなかったため:
--   1) RLS ポリシーは「権限が無いから弾かれている」だけで、**実効性が一度も検証されていなかった**
--   2) マイグレーション中の `revoke ... from anon, authenticated` は
--      「元から権限が無い」ため素通りし、剥奪できているかも検証されていなかった
-- ハーネスを実環境に合わせた結果、以下が露見した。
--
-- ■ 監査結果
-- RLS が無効なテーブルはゼロ＝**実データの漏洩は無い**。
-- ただし「RLS で守れているから良い」ではなく、不要な権限は明示的に剥奪する。
-- 将来ポリシーを1つ足した瞬間、あるいは RLS を一時的に外した瞬間に露出するため。
--
-- ■ 特に問題だったもの
-- - `app_config` … ポリシーが `using (true)` で**誰でも読めた**。中身は
--   payout_ratio_bps / redemption_mix_*（**粗利構造**）、daily_offer_cap /
--   referral_referrer_daily_cap（**不正対策の閾値**）。
--   アプリからは一切読んでいない（参照はコメントのみ）ので完全に閉じる。
-- - `revenue_benchmarks` … アクション別の**収益単価（円）**。同上。
-- ============================================================

-- ---------- 1) service_role 専用のテーブル ----------
-- ポリシー0件＝RLS で全拒否だが、権限も落としておく。
revoke all on table
  public.ad_networks,
  public.ad_partners,          -- 署名鍵の参照（signing_secret_ref）を含む
  public.app_events,           -- 行動ログの生データ
  public.fraud_flags,
  public.fraud_settings,       -- 検知閾値。露出すると回避されうる
  public.moderation_actions,
  public.user_roles
from anon, authenticated;

-- ---------- 2) 運用設定・収益情報は公開しない ----------
drop policy if exists "config read" on public.app_config;
revoke all on table public.app_config from anon, authenticated;

drop policy if exists "benchmarks read" on public.revenue_benchmarks;
revoke all on table public.revenue_benchmarks from anon, authenticated;

-- ---------- 3) 登録前に見せる必要が無いものは anon から剥奪 ----------
-- 未ログインで見せるのは「どんなゲームがあるか」（games）と規約類（legal_documents）だけ。
revoke all on table
  public.profiles, public.point_wallets, public.point_ledger,
  public.missions, public.mission_completions, public.mission_clicks,
  public.exchange_items, public.exchange_requests,
  public.offers, public.offer_completions, public.ad_impressions,
  public.user_daily_offer_counts, public.postback_events,
  public.notifications, public.nudge_events, public.nudge_cooldowns,
  public.staking_accruals, public.vip_tiers,
  public.forums, public.forum_members, public.topics, public.posts,
  public.reactions, public.reports, public.bounty_questions,
  public.user_genres, public.user_moderation_state,
  public.user_devices, public.push_tokens,
  public.referrals, public.legal_acceptances, public.account_deletions,
  public.inquiries, public.inquiry_messages,
  public.user_streaks, public.streak_rewards, public.user_games
from anon;

-- ---------- 4) 本人参照のためのポリシーがあるのに権限が無かったもの ----------
-- ポリシーだけでは読めない（テーブルへの SELECT 権限も要る）。
-- 意図どおり「自分の行だけ」読めるようにする。書き込みは RPC 経由なので付与しない。
grant select on table
  public.user_devices,
  public.legal_acceptances,
  public.account_deletions,
  public.referrals,
  public.push_tokens,
  public.user_moderation_state
to authenticated;

-- ---------- 5) 確認用コメント ----------
comment on table public.app_config is
  '運用設定。クライアントには公開しない（粗利構造と不正対策の閾値を含むため）。service_role 専用。';
comment on table public.fraud_settings is
  '不正検知の閾値。露出すると回避されるため service_role 専用。';
comment on table public.app_events is
  '行動ログの生データ。書き込みは record_events RPC 経由のみ。読み取りは集計ビュー経由。';
