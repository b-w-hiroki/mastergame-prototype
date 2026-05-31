-- ============================================================
-- MasterGame — 0007 admin aggregate view (運営コンソール用)
-- service_role からの集計参照を想定（RLSをバイパス）。
-- ============================================================
create view public.admin_overview as
select
  (select count(*) from public.profiles)                                              as total_users,
  (select coalesce(sum(delta),0)  from public.point_ledger
     where delta > 0 and status = 'confirmed')                                         as distributed_points,
  (select coalesce(sum(-delta),0) from public.point_ledger
     where delta < 0 and reason = 'exchange' and status = 'confirmed')                 as exchanged_points,
  (select count(distinct user_id) from public.exchange_requests)                       as exchange_users,
  (select count(*) from public.reports where status = 'open')                          as open_reports,
  (select count(*) from public.postback_events where status = 'received')              as pending_postbacks;

-- ユーザー一覧（管理画面の表に対応：累計獲得 / 交換済み / 保有）
create view public.admin_user_rows as
select
  p.id, p.username, p.handle, p.xp,
  coalesce(w.lifetime_earned, 0) as earned,
  coalesce(w.lifetime_spent, 0)  as exchanged,
  coalesce(w.balance, 0)         as balance,
  coalesce(m.state, 'active')    as moderation_state,
  u.created_at
from public.profiles p
join auth.users u on u.id = p.id
left join public.point_wallets w on w.user_id = p.id
left join public.user_moderation_state m on m.user_id = p.id;
