-- ============================================================
-- 0029: 連続ログイン（ストリーク）
--
-- ポイ活のリテンション施策の定番だが実装がゼロだった。0028 で計測基盤が入ったので、
-- 導入後に D1/D7 が動いたかを検証できる状態で入れる。
--
-- ■ 設計上の注意
-- 1) 「日付」の境界をサーバ側で決める（クライアントの時計を信用すると、端末の
--    日付を進めて連続ボーナスを取り放題になる）。JST 基準で判定する。
-- 2) 報酬は claim_mission と同じく **冪等キー付き apply_points** を通す。
--    連打しても1日1回しか付与されない。
-- 3) 途切れたら1日目に戻す。ただし「同じ日に2回目」は途切れでもなく加算でもない
--    （既に受け取り済みとして拒否する）。
-- 4) 段階報酬は設定テーブルに持ち、マイグレーション無しで調整できるようにする。
-- ============================================================

-- ---------- 日付境界 ----------
-- サービスのタイムゾーン。日付の切り替わりをここで決める。
insert into public.app_config (key, value) values
  ('service_timezone', '"Asia/Tokyo"'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.service_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone
          coalesce((select value #>> '{}' from app_config where key = 'service_timezone'), 'Asia/Tokyo'))::date;
$$;
revoke all on function public.service_today() from public, anon;
grant execute on function public.service_today() to authenticated;

-- ---------- 段階報酬 ----------
create table if not exists public.streak_rewards (
  day_index     integer primary key check (day_index >= 1),  -- 連続 n 日目
  reward_points integer not null check (reward_points >= 0),
  label         text
);

insert into public.streak_rewards(day_index, reward_points, label) values
  (1, 1000,  '1日目'),
  (2, 1500,  '2日目'),
  (3, 2000,  '3日目'),
  (4, 2500,  '4日目'),
  (5, 3000,  '5日目'),
  (6, 4000,  '6日目'),
  (7, 10000, '7日目 コンプリート！')
on conflict (day_index) do nothing;

alter table public.streak_rewards enable row level security;
-- 「続けると何がもらえるか」はユーザーに見せる（継続の動機になる）
drop policy if exists streak_rewards_read on public.streak_rewards;
create policy streak_rewards_read on public.streak_rewards for select using (true);
grant select on public.streak_rewards to authenticated;

-- ---------- ストリークの状態 ----------
create table if not exists public.user_streaks (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_claim_on  date,
  total_claims   integer not null default 0,
  updated_at     timestamptz not null default now()
);

alter table public.user_streaks enable row level security;
drop policy if exists streak_self_read on public.user_streaks;
create policy streak_self_read on public.user_streaks
  for select using (auth.uid() = user_id);
grant select on public.user_streaks to authenticated;

-- ---------- 受け取り ----------
-- 連続日数は 1..(最大段階) を循環する。7日で一巡し、翌日は再び1日目から。
create or replace function public.claim_daily_streak()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date; v_row user_streaks; v_next int; v_max int;
  v_reward int; v_ledger uuid; v_modstate text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_today := service_today();

  -- BAN/凍結/退会は付与しない（他の付与経路と同じ扱い）
  select state into v_modstate from user_moderation_state where user_id = v_uid;
  if v_modstate in ('banned','frozen','deleted') then
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  -- 行を確保してからロックする（同時実行で二重に進めないため）
  insert into user_streaks(user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_row from user_streaks where user_id = v_uid for update;

  if v_row.last_claim_on = v_today then
    return jsonb_build_object('status','duplicate','reason','already_claimed_today',
                              'current_streak', v_row.current_streak);
  end if;

  select coalesce(max(day_index), 1) into v_max from streak_rewards;

  -- 昨日受け取っていれば継続、それ以外（初回・途切れ）は1日目から
  if v_row.last_claim_on = v_today - 1 then
    v_next := v_row.current_streak + 1;
    if v_next > v_max then v_next := 1; end if;   -- 一巡したら最初に戻る
  else
    v_next := 1;
  end if;

  select reward_points into v_reward from streak_rewards where day_index = v_next;
  if v_reward is null then v_reward := 0; end if;

  -- 冪等キーに「ユーザー＋日付」を含める。連打しても1日1回だけ付与される。
  if v_reward > 0 then
    v_ledger := apply_points(v_uid, v_reward, 'streak', 'streak', null,
                             'streak:' || v_uid::text || ':' || v_today::text);
  end if;

  update user_streaks set
    current_streak = v_next,
    longest_streak = greatest(longest_streak, v_next),
    last_claim_on  = v_today,
    total_claims   = total_claims + 1,
    updated_at     = now()
  where user_id = v_uid;

  return jsonb_build_object(
    'status','ok',
    'streak', v_next,
    'reward', v_reward,
    'completed', v_next = v_max,     -- 一巡した（次回は1日目に戻る）
    'ledger_id', v_ledger
  );
end $$;
revoke all on function public.claim_daily_streak() from public, anon;
grant execute on function public.claim_daily_streak() to authenticated;

-- ---------- 状態照会 ----------
-- 「今日受け取れるか」「次にいくらもらえるか」をアプリに返す。
create or replace function public.my_streak()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date; v_row user_streaks; v_next int; v_max int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_today := service_today();
  select * into v_row from user_streaks where user_id = v_uid;
  select coalesce(max(day_index), 1) into v_max from streak_rewards;

  -- 次に受け取る段階（今日まだ受け取っていない場合の見込み）
  if v_row.last_claim_on = v_today - 1 then
    v_next := v_row.current_streak + 1;
    if v_next > v_max then v_next := 1; end if;
  else
    v_next := 1;
  end if;

  return jsonb_build_object(
    'current_streak', coalesce(v_row.current_streak, 0),
    'longest_streak', coalesce(v_row.longest_streak, 0),
    'claimed_today',  coalesce(v_row.last_claim_on = v_today, false),
    'next_day_index', v_next,
    'next_reward',    coalesce((select reward_points from streak_rewards where day_index = v_next), 0),
    'max_day_index',  v_max,
    -- 直前まで続いていた連続が途切れているか（UIで「リセットされました」を出すため）
    'broken', v_row.last_claim_on is not null
              and v_row.last_claim_on < v_today - 1
              and coalesce(v_row.current_streak, 0) > 1
  );
end $$;
revoke all on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated;

-- ---------- 運営の可視化 ----------
-- ストリークが実際にリテンションへ効いているかを見る（0028 の計測と併せて判断する）。
create or replace view public.admin_streak_summary
with (security_invoker = on) as
select
  count(*)                                                as users_with_streak,
  count(*) filter (where current_streak >= 3)              as streak_3plus,
  count(*) filter (where current_streak >= 7)              as streak_7plus,
  count(*) filter (where last_claim_on = public.service_today())     as claimed_today,
  count(*) filter (where last_claim_on = public.service_today() - 1) as claimed_yesterday,
  coalesce(round(avg(current_streak), 2), 0)               as avg_current_streak,
  coalesce(max(longest_streak), 0)                         as best_streak
from public.user_streaks;
revoke all on public.admin_streak_summary from public, anon, authenticated;
