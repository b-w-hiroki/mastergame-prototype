-- ============================================================
-- 0022: ポイント経済の可視化（運営ダッシュボード用の集計ビュー）
--
-- admin_overview は「累計」しか持たず、日次の推移も、発行に対する交換の比率も、
-- 未交換残高（＝将来の支払債務）も見えなかった。ポイ活は「配りすぎ」が一瞬で
-- 赤字になる商売なのに、赤字化に気づく手段が無い状態だった。
--
-- 特に重要なのが **未交換残高**。発行済みで未だ交換されていないポイントは
-- 会計上の負債であり、資金決済法の前払式支払手段に該当する場合は未使用残高に
-- 応じた供託義務も生じうる。KPI として常時見えている必要がある。
--
--   1) economy_daily         … 日次の発行/消費/参加者（直近60日、欠測日も0で埋める）
--   2) economy_by_reason     … 経路別の内訳（どこからポイントが出ているか）
--   3) economy_liability     … 未交換残高＝将来債務（額面/円/実コスト）
--   4) admin_economy_summary … ダッシュボードのKPIを1行で
--
-- 全て security_invoker + クライアントロールから revoke（service_role 専用）。
-- ============================================================

-- ---------- 1) 日次推移 ----------
-- generate_series で日付を作ってから left join することで、取引ゼロの日も
-- 行として残す（グラフが日付をスキップして歪むのを防ぐ）。
create or replace view public.economy_daily
with (security_invoker = on) as
select
  d::date                                                          as day,
  coalesce(sum(l.delta) filter (where l.delta > 0), 0)::bigint     as issued_points,
  coalesce(-sum(l.delta) filter (where l.delta < 0), 0)::bigint    as spent_points,
  coalesce(-sum(l.delta) filter (where l.reason = 'exchange'), 0)::bigint as exchanged_points,
  count(distinct l.user_id) filter (where l.delta > 0)             as earning_users,
  count(l.id) filter (where l.delta > 0)                           as earn_events
from generate_series(current_date - 59, current_date, interval '1 day') d
left join public.point_ledger l
       on l.created_at >= d
      and l.created_at <  d + interval '1 day'
      and l.status = 'confirmed'
group by d;
revoke all on public.economy_daily from public, anon, authenticated;

-- ---------- 2) 経路別の内訳（直近30日） ----------
-- 「どのミッション種別/オファーからポイントが出ているか」を掴む。
-- 想定外の経路が急伸していたら不正か設定ミスを疑う入口になる。
create or replace view public.economy_by_reason
with (security_invoker = on) as
select
  l.reason,
  coalesce(sum(l.delta) filter (where l.delta > 0), 0)::bigint  as issued_points,
  coalesce(-sum(l.delta) filter (where l.delta < 0), 0)::bigint as spent_points,
  count(*)                                                      as events,
  count(distinct l.user_id)                                     as users
from public.point_ledger l
where l.status = 'confirmed'
  and l.created_at > now() - interval '30 days'
group by l.reason;
revoke all on public.economy_by_reason from public, anon, authenticated;

-- ---------- 3) 未交換残高＝将来債務 ----------
-- outstanding_real_cost_yen は交換先ミックス（0010）を通した実コスト見込み。
-- 額面そのままではなく「実際に出ていく金額」で債務を見るための列。
create or replace view public.economy_liability
with (security_invoker = on) as
select
  coalesce(sum(w.balance), 0)::bigint                                as outstanding_points,
  public.points_to_yen(coalesce(sum(w.balance), 0)::bigint)          as outstanding_yen,
  public.face_to_real_cost(
    public.points_to_yen(coalesce(sum(w.balance), 0)::bigint))       as outstanding_real_cost_yen,
  count(*) filter (where w.balance > 0)                              as holders,
  coalesce(max(w.balance), 0)::bigint                                as max_balance
from public.point_wallets w;
revoke all on public.economy_liability from public, anon, authenticated;

-- ---------- 4) ダッシュボード用サマリ ----------
create or replace view public.admin_economy_summary
with (security_invoker = on) as
with w30 as (
  select
    coalesce(sum(delta) filter (where delta > 0), 0)::bigint            as issued_30d,
    coalesce(-sum(delta) filter (where delta < 0), 0)::bigint           as spent_30d,
    coalesce(-sum(delta) filter (where reason = 'exchange'), 0)::bigint as exchanged_30d,
    count(distinct user_id) filter (where delta > 0)                    as earning_users_30d
  from public.point_ledger
  where status = 'confirmed' and created_at > now() - interval '30 days'
),
w7 as (
  select coalesce(sum(delta) filter (where delta > 0), 0)::bigint as issued_7d
  from public.point_ledger
  where status = 'confirmed' and created_at > now() - interval '7 days'
)
select
  w30.issued_30d,
  w30.spent_30d,
  w30.exchanged_30d,
  w30.earning_users_30d,
  w7.issued_7d,
  public.points_to_yen(w30.issued_30d)                                   as issued_yen_30d,
  public.points_to_yen(w30.exchanged_30d)                                as exchanged_yen_30d,
  -- 実際に出ていく金額（交換先ミックス経由の実コスト）
  public.face_to_real_cost(public.points_to_yen(w30.exchanged_30d))      as real_cost_yen_30d,
  -- 発行に対して実際に交換された割合。低いほど breakage（未交換）が大きい
  case when w30.issued_30d > 0
       then round(w30.exchanged_30d::numeric / w30.issued_30d * 100, 1)
       else 0 end                                                        as redemption_rate_pct,
  -- 1人あたり発行額面（円）。獲得ユーザー基準の配布強度
  case when w30.earning_users_30d > 0
       then round(public.points_to_yen(w30.issued_30d) / w30.earning_users_30d, 1)
       else 0 end                                                        as issued_yen_per_user_30d,
  l.outstanding_points,
  l.outstanding_yen,
  l.outstanding_real_cost_yen,
  l.holders,
  round(public.effective_cost_rate() * 100, 1)                           as effective_cost_rate_pct,
  round(public.payout_ratio() * 100, 1)                                  as payout_ratio_pct
from w30, w7, public.economy_liability l;
revoke all on public.admin_economy_summary from public, anon, authenticated;
