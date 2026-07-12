-- ============================================================
-- MasterGame — 0008 point economy rate (1,000P = 1円)
-- レートを単一の設定に集約し、金額換算・XP分離を行う。
-- ============================================================

-- アプリ全体設定（key-value）
create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
-- 経済レート：value は「1円あたりのポイント数」。1000 = 1,000P = 1円
insert into public.app_config (key, value) values ('point_yen_rate', '1000'::jsonb);

alter table public.app_config enable row level security;
create policy "config read" on public.app_config for select using (true);

create or replace function public.point_yen_rate() returns int
  language sql stable as $$
  select (value #>> '{}')::int from public.app_config where key = 'point_yen_rate';
$$;

-- ポイント→円換算ヘルパー
create or replace function public.points_to_yen(p bigint) returns numeric
  language sql stable as $$ select round(p::numeric / public.point_yen_rate()); $$;

-- ---------- XP をポイントから分離（活動量ベース） ----------
alter table public.missions add column if not exists xp_reward integer not null default 50;

create or replace function public.claim_mission(p_mission_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m missions; v_ledger uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_m from missions where id = p_mission_id and is_active;
  if not found then raise exception 'mission not found'; end if;
  if v_m.requires_verification then raise exception 'mission requires server verification (postback)'; end if;

  v_ledger := apply_points(v_uid, v_m.reward_points, 'mission', 'mission', v_m.id);
  insert into mission_completions(user_id, mission_id, status, progress, ledger_id, completed_at)
    values (v_uid, p_mission_id, 'confirmed', v_m.max_progress, v_ledger, now());
  update profiles set xp = xp + v_m.xp_reward where id = v_uid;  -- XPはポイントと独立

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;

-- ---------- admin_overview に円換算を追加 ----------
create or replace view public.admin_overview as
select
  (select count(*) from public.profiles)                                              as total_users,
  (select coalesce(sum(delta),0)  from public.point_ledger
     where delta > 0 and status = 'confirmed')                                         as distributed_points,
  (select coalesce(sum(-delta),0) from public.point_ledger
     where delta < 0 and reason = 'exchange' and status = 'confirmed')                 as exchanged_points,
  (select count(distinct user_id) from public.exchange_requests)                       as exchange_users,
  (select count(*) from public.reports where status = 'open')                          as open_reports,
  (select count(*) from public.postback_events where status = 'received')              as pending_postbacks,
  public.points_to_yen((select coalesce(sum(delta),0) from public.point_ledger
     where delta > 0 and status = 'confirmed')::bigint)                                as distributed_yen,
  public.points_to_yen((select coalesce(sum(-delta),0) from public.point_ledger
     where delta < 0 and reason = 'exchange' and status = 'confirmed')::bigint)        as exchanged_yen;
