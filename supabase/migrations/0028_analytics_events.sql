-- ============================================================
-- 0028: 行動イベント計測（ファネル / リテンション）
--
-- 0022 で「配りすぎ」は見えるようになったが、**「効いているか」が見えない**。
-- いま持っている数字は台帳だけで、
--   - ミッション表示 → タップ → 達成 のどこで落ちているか
--   - D1 / D7 リテンションがどうか
-- が一切測れず、改善のループが回らない状態だった。
--
--   1) app_events        … 行動イベント（大量に入るのでインデックスと保持期間を設計する）
--   2) record_events     … アプリからのバッチ送信（1回の往復で複数件）
--   3) analytics_daily   … DAU / イベント数の日次
--   4) event_funnel      … 名前別の日次集計（任意のファネルを組める素材）
--   5) mission_funnel    … 表示→タップ→達成 の転換率
--   6) retention_cohorts … 登録日コホートの D1 / D7 / D30 復帰率
--   7) purge_app_events  … 保持期間を過ぎた生ログの削除（集計は別途残す前提）
-- ============================================================

insert into public.app_config (key, value) values
  ('event_retention_days', '90'::jsonb),  -- 生ログの保持期間
  ('event_batch_max',      '50'::jsonb)   -- 1リクエストで受け付ける最大件数
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------- 1) イベント ----------
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  name       text not null,
  params     jsonb not null default '{}'::jsonb,
  session_id text,
  platform   text,
  created_at timestamptz not null default now()
);
-- 集計は「名前×日付」と「ユーザー×日付」で引くので、その2軸に索引を張る
create index if not exists idx_app_events_name_time on public.app_events(name, created_at desc);
create index if not exists idx_app_events_user_time on public.app_events(user_id, created_at desc);

alter table public.app_events enable row level security; -- ポリシー無し＝直接の読み書き不可

-- ---------- 2) 送信 ----------
-- アプリは複数イベントをまとめて送る（1件ごとに往復すると電池と通信を無駄にする）。
-- イベント名は形式を固定し、未知の名前でテーブルが汚れるのを防ぐ。
create or replace function public.record_events(p_events jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_max int; v_count int := 0; e jsonb; v_name text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_events) <> 'array' then raise exception 'events must be an array'; end if;

  v_max := legal_config('event_batch_max', 50)::int;
  if jsonb_array_length(p_events) > v_max then
    return jsonb_build_object('status','rejected','reason','batch_too_large','max',v_max);
  end if;

  for e in select * from jsonb_array_elements(p_events) loop
    v_name := e->>'name';
    -- 英小文字・数字・アンダースコアの 3〜50 文字。想定外の名前は黙って捨てず件数から除く。
    if v_name is null or v_name !~ '^[a-z][a-z0-9_]{2,49}$' then
      continue;
    end if;
    insert into app_events(user_id, name, params, session_id, platform)
      values (v_uid, v_name,
              coalesce(e->'params', '{}'::jsonb),
              left(coalesce(e->>'session_id',''), 64),
              left(coalesce(e->>'platform',''), 16));
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('status','ok','recorded', v_count);
end $$;
revoke all on function public.record_events(jsonb) from public, anon;
grant execute on function public.record_events(jsonb) to authenticated;

-- ---------- 3) 日次のアクティブ ----------
create or replace view public.analytics_daily
with (security_invoker = on) as
select
  d::date                                            as day,
  count(distinct e.user_id)                          as active_users,
  count(e.id)                                        as events,
  count(distinct e.session_id) filter (where e.session_id <> '') as sessions
from generate_series(current_date - 59, current_date, interval '1 day') d
left join public.app_events e
       on e.created_at >= d and e.created_at < d + interval '1 day'
group by d;
revoke all on public.analytics_daily from public, anon, authenticated;

-- ---------- 4) 名前別の日次集計 ----------
create or replace view public.event_funnel
with (security_invoker = on) as
select
  e.name,
  count(*)                    as events,
  count(distinct e.user_id)   as users,
  max(e.created_at)           as last_seen
from public.app_events e
where e.created_at > now() - interval '30 days'
group by e.name;
revoke all on public.event_funnel from public, anon, authenticated;

-- ---------- 5) ミッションのファネル ----------
-- 表示 → タップ → 達成。どこで落ちているかが分かる最小のファネル。
-- 転換率は「ユーザー数ベース」で見る（イベント数ベースだと連打で歪む）。
create or replace view public.mission_funnel
with (security_invoker = on) as
with f as (
  select
    count(distinct user_id) filter (where name = 'mission_list_view')  as viewed,
    count(distinct user_id) filter (where name = 'mission_claim_tap')  as tapped,
    count(distinct user_id) filter (where name = 'mission_claimed')    as claimed
  from public.app_events
  where created_at > now() - interval '30 days'
)
select
  viewed, tapped, claimed,
  case when viewed > 0 then round(tapped::numeric  / viewed * 100, 1) else 0 end as view_to_tap_pct,
  case when tapped > 0 then round(claimed::numeric / tapped * 100, 1) else 0 end as tap_to_claim_pct,
  case when viewed > 0 then round(claimed::numeric / viewed * 100, 1) else 0 end as overall_pct
from f;
revoke all on public.mission_funnel from public, anon, authenticated;

-- ---------- 6) リテンション ----------
-- 登録日コホートごとに、D1 / D7 / D30 に戻ってきた割合。
-- 「ちょうどその日に活動したか」を見る古典的リテンション（範囲ではなく点で見る定義）。
create or replace view public.retention_cohorts
with (security_invoker = on) as
with cohort as (
  select p.id as user_id, p.created_at::date as cohort_date
  from public.profiles p
  where p.created_at >= current_date - 90
),
activity as (
  select distinct user_id, created_at::date as day from public.app_events
)
select
  c.cohort_date,
  count(distinct c.user_id)                                                          as cohort_size,
  count(distinct a.user_id) filter (where a.day = c.cohort_date + 1)                 as d1,
  count(distinct a.user_id) filter (where a.day = c.cohort_date + 7)                 as d7,
  count(distinct a.user_id) filter (where a.day = c.cohort_date + 30)                as d30,
  case when count(distinct c.user_id) > 0
       then round(count(distinct a.user_id) filter (where a.day = c.cohort_date + 1)::numeric
                  / count(distinct c.user_id) * 100, 1) else 0 end                   as d1_pct,
  case when count(distinct c.user_id) > 0
       then round(count(distinct a.user_id) filter (where a.day = c.cohort_date + 7)::numeric
                  / count(distinct c.user_id) * 100, 1) else 0 end                   as d7_pct
from cohort c
left join activity a on a.user_id = c.user_id
group by c.cohort_date;
revoke all on public.retention_cohorts from public, anon, authenticated;

-- ---------- 7) 生ログの掃除 ----------
-- 行動ログは放置すると際限なく膨らむ。保持期間を過ぎた生ログは消す
-- （日次集計が必要なら、事前に別テーブルへ集計しておくこと）。
create or replace function public.purge_app_events(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_days int; v_count bigint;
begin
  v_days := legal_config('event_retention_days', 90)::int;
  select count(*) into v_count from app_events
   where created_at < now() - make_interval(days => v_days);

  if not p_dry_run then
    delete from app_events where created_at < now() - make_interval(days => v_days);
  end if;

  return jsonb_build_object('dry_run', p_dry_run, 'deleted', v_count, 'retention_days', v_days);
end $$;
revoke all on function public.purge_app_events(boolean) from public, anon, authenticated;
