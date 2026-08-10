-- ============================================================
-- 0031: コードレビューで検出した不具合の修正（0021〜0030）
--
-- 独立したレビューで9件の実問題が見つかった。既存テストはいずれも捕捉していない。
-- 深刻な順に:
--   1) claim_mission に凍結/BAN/退会ガードが無く、処分済みユーザーがポイントを鋳造できた
--   2) confirm_offer の FOUND 誤参照で reward が NULL になり付与が落ちる（0021/0026 が
--      moderation 行を自動作成するようになったことで**新たに到達可能**になった）
--   3) 0030 の revoke が game_hub_rows（anon 公開）を壊していた
--   4) wallet_expiry が authenticated から実行できない
--   5) my_streak が受け取り後に誤った「次の報酬」を返す
--   6) 退会確定後もセッションが生き続ける
--   7) デイリーミッション(UTC) と ストリーク(JST) で日付境界が9時間ずれる
--   8) retention_cohorts が全期間を走査する
--   9) record_events の params が無制限
-- ============================================================

-- ============================================================
-- 1) claim_mission に処分ガードを追加
--    他の付与経路（confirm_postback / confirm_offer / claim_daily_streak）には
--    あるのに、ここだけ抜けていた。退会済みユーザーが台帳を増やせる状態だった。
-- 7) 併せて日付境界を service_today()（JST）に揃える。
--    デイリーが UTC、ストリークが JST では 9 時間ずれた別々の「1日」ができてしまう。
--    ※ 適用日の 00:00–09:00 JST に既に受け取り済みのユーザーは、キーが変わるため
--      その日だけもう一度受け取れる。一度きりの軽微なコストとして許容する。
-- ============================================================
create or replace function public.claim_mission(p_mission_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_m missions; v_ledger uuid;
  v_period text; v_completion uuid; v_modstate text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- 処分済みユーザーには付与しない（他の付与経路と同じ扱い）
  select state into v_modstate from user_moderation_state where user_id = v_uid;
  if v_modstate in ('banned','frozen','deleted') then
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  select * into v_m from missions where id = p_mission_id and is_active;
  if not found then raise exception 'mission not found'; end if;
  if v_m.requires_verification then raise exception 'mission requires server verification (postback)'; end if;
  if v_m.starts_at is not null and v_m.starts_at > now() then raise exception 'mission not started'; end if;
  if v_m.ends_at   is not null and v_m.ends_at   < now() then raise exception 'mission ended'; end if;

  -- 日付境界はサービスのタイムゾーンで決める（ストリークと揃える）
  v_period := case v_m.type
    when 'daily'  then to_char(service_today(), 'YYYY-MM-DD')
    when 'weekly' then to_char(service_today(), 'IYYY-"W"IW')
    else 'once'
  end;

  insert into mission_completions(user_id, mission_id, status, progress, period_key)
    values (v_uid, p_mission_id, 'confirmed', v_m.max_progress, v_period)
    on conflict (user_id, mission_id, period_key) do nothing
    returning id into v_completion;
  if v_completion is null then raise exception 'mission already claimed'; end if;

  v_ledger := apply_points(v_uid, v_m.reward_points, 'mission', 'mission', v_m.id,
                           'mission:' || v_uid::text || ':' || p_mission_id::text || ':' || v_period);
  update mission_completions set ledger_id = v_ledger, completed_at = now() where id = v_completion;
  update profiles set xp = xp + v_m.xp_reward where id = v_uid;

  begin
    perform try_confirm_referral(v_uid);
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;
revoke all on function public.claim_mission(uuid) from public, anon;
grant execute on function public.claim_mission(uuid) to authenticated;

-- ============================================================
-- 2) confirm_offer: FOUND の誤参照を修正
--    `select state into v_modstate ...` の後に `if found then` を書いていたため、
--    直前の SELECT の結果を見てしまい、オファー未指定でも「見つかった」と判定して
--    v_reward が NULL のまま insert され not-null 違反で落ちていた。
--    0021/0026 が moderation 行を自動作成するようになり新たに到達可能になった。
--    FOUND に頼らず、取得できたかを明示的な変数で判定する。
-- ============================================================
create or replace function public.confirm_offer(
  p_network_code text,
  p_network_txn_id text,
  p_user uuid,
  p_offer_external_id text default null,
  p_reward_override integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_net ad_networks; v_offer offers; v_reward integer; v_ledger uuid;
  v_modstate text; v_cap integer; v_used integer; v_has_offer boolean := false;
begin
  select * into v_net from ad_networks where code = p_network_code;
  if not found then return jsonb_build_object('status','rejected','reason','unknown_network'); end if;
  if not v_net.enabled then return jsonb_build_object('status','rejected','reason','network_disabled'); end if;

  select state into v_modstate from user_moderation_state where user_id = p_user;
  if v_modstate in ('banned','frozen','deleted') then
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  if exists (select 1 from offer_completions where network_id = v_net.id and network_txn_id = p_network_txn_id) then
    return jsonb_build_object('status','duplicate','network_txn_id',p_network_txn_id);
  end if;

  if p_offer_external_id is not null then
    select * into v_offer from offers where network_id = v_net.id and external_id = p_offer_external_id;
    v_has_offer := found;   -- ここで確定させる（後続の FOUND は別の文で上書きされる）
  end if;

  if v_has_offer then
    v_reward := v_offer.reward_points;
    if p_reward_override is not null and p_reward_override > 0 and p_reward_override <= v_offer.reward_points then
      v_reward := p_reward_override;
    end if;
  elsif p_reward_override is not null and p_reward_override > 0 then
    v_reward := p_reward_override;
  else
    return jsonb_build_object('status','rejected','reason','unknown_reward');
  end if;

  v_cap  := coalesce((select (value #>> '{}')::int from app_config where key = 'daily_offer_cap'), 20);
  v_used := coalesce((select count from user_daily_offer_counts
                      where user_id = p_user and day = current_date and ad_type = 'offerwall'), 0);
  if v_used >= v_cap then
    return jsonb_build_object('status','rejected','reason','daily_cap_reached');
  end if;

  begin
    insert into offer_completions(user_id, offer_id, network_id, network_txn_id, status, reward_points)
      values (p_user, (case when v_has_offer then v_offer.id end), v_net.id, p_network_txn_id, 'pending', v_reward);
  exception when unique_violation then
    return jsonb_build_object('status','duplicate','network_txn_id',p_network_txn_id);
  end;

  v_ledger := apply_points(p_user, v_reward, 'offer', 'offer',
                           (case when v_has_offer then v_offer.id end),
                           'offer:' || v_net.id::text || ':' || p_network_txn_id);
  update offer_completions set status = 'confirmed', ledger_id = v_ledger, confirmed_at = now()
    where network_id = v_net.id and network_txn_id = p_network_txn_id;

  insert into user_daily_offer_counts(user_id, day, ad_type, count)
    values (p_user, current_date, 'offerwall', 1)
    on conflict (user_id, day, ad_type) do update set count = user_daily_offer_counts.count + 1;

  return jsonb_build_object('status','accepted','user_id',p_user,'reward',v_reward);
end $$;
revoke all on function public.confirm_offer(text, text, uuid, text, integer) from public, anon, authenticated;

-- ============================================================
-- 3) game_hub_rows: anon 公開のビューが 0030 の revoke で壊れていた
--    security_invoker のままだと、呼び出し元（anon）が forums / topics / user_games に
--    SELECT 権限を持っている必要がある。しかしフォロー情報を anon に開けたくはない。
--    このビューが返すのは「公開ゲーム情報＋集計値」だけなので、定義者権限で実行する。
--    可視トピックのみを数える条件はビュー側に明示してあるため、RLS を通さなくても
--    非表示トピックが混ざることはない。
-- ============================================================
alter view public.game_hub_rows set (security_invoker = off);
comment on view public.game_hub_rows is
  '公開ゲーム情報＋集計（フォロー数/投稿数）。個人を特定する行は返さないため定義者権限で実行する。';

-- ============================================================
-- 4) wallet_expiry: authenticated から実行できるようにする
--    security_invoker のビュー内でも関数の EXECUTE 権限は呼び出し元で判定される。
--    legal_config は service_role 専用（キーを自由に渡せるので運用値を読まれてしまう）。
--    「失効月数だけ」を返す専用関数を用意して公開する。
-- ============================================================
create or replace function public.point_expiry_months()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from app_config where key = 'point_expiry_months'), 12);
$$;
revoke all on function public.point_expiry_months() from public, anon;
grant execute on function public.point_expiry_months() to authenticated;

create or replace view public.wallet_expiry
with (security_invoker = on) as
select
  w.user_id,
  w.balance,
  w.updated_at as last_activity_at,
  (w.updated_at + make_interval(months => public.point_expiry_months()))::date as expires_on
from public.point_wallets w;
grant select on public.wallet_expiry to authenticated;

-- ============================================================
-- 5) my_streak: 受け取り後に「次の報酬」が誤っていた
--    受け取り済みの日は last_claim_on = 今日なので「昨日受け取った」条件に当たらず、
--    常に 1日目/1000P を返していた。受け取り済みなら **翌日の段** を返す。
-- ============================================================
create or replace function public.my_streak()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date; v_row user_streaks; v_next int; v_max int; v_claimed boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_today := service_today();
  select * into v_row from user_streaks where user_id = v_uid;
  select coalesce(max(day_index), 1) into v_max from streak_rewards;

  v_claimed := coalesce(v_row.last_claim_on = v_today, false);

  if v_claimed then
    -- 今日は受け取り済み。表示すべきは「明日もらえる段」
    v_next := coalesce(v_row.current_streak, 0) + 1;
    if v_next > v_max then v_next := 1; end if;
  elsif v_row.last_claim_on = v_today - 1 then
    v_next := coalesce(v_row.current_streak, 0) + 1;
    if v_next > v_max then v_next := 1; end if;
  else
    v_next := 1;
  end if;

  return jsonb_build_object(
    'current_streak', coalesce(v_row.current_streak, 0),
    'longest_streak', coalesce(v_row.longest_streak, 0),
    'claimed_today',  v_claimed,
    'next_day_index', v_next,
    'next_reward',    coalesce((select reward_points from streak_rewards where day_index = v_next), 0),
    'max_day_index',  v_max,
    'broken', v_row.last_claim_on is not null
              and v_row.last_claim_on < v_today - 1
              and coalesce(v_row.current_streak, 0) > 1
  );
end $$;
revoke all on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated;

-- ============================================================
-- 6) 退会確定時にセッションを失効させる
--    メールを無効化してもアクセストークンが切れるまでログイン状態が続き、
--    リフレッシュトークンがあれば延命できてしまう。
--    ※ auth.sessions / auth.refresh_tokens は Supabase 側のテーブル。
--      素の Postgres（テスト）には無いので存在チェックしてから消す。
-- ============================================================
create or replace function public.revoke_user_sessions(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if to_regclass('auth.refresh_tokens') is not null then
    execute 'delete from auth.refresh_tokens where user_id = $1::text' using p_user;
  end if;
  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user;
  end if;
exception when others then
  -- 列定義の差異でセッション失効に失敗しても、退会処理自体は完了させる
  null;
end $$;
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;

create or replace function public.process_account_deletions(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count int := 0; v_forfeited bigint := 0; r record; v_balance bigint;
begin
  for r in
    select d.user_id from account_deletions d
     where d.status = 'pending' and d.scheduled_at <= now()
     for update
  loop
    v_count := v_count + 1;
    select coalesce(balance, 0) into v_balance from point_wallets where user_id = r.user_id;
    v_forfeited := v_forfeited + coalesce(v_balance, 0);

    if p_dry_run then continue; end if;

    if coalesce(v_balance, 0) > 0 then
      perform apply_points(r.user_id, -v_balance, 'account_closed', 'account', null,
                           'account_closed:' || r.user_id::text);
    end if;

    update profiles set
      username        = '退会したユーザー',
      handle          = 'deleted_' || translate(r.user_id::text, '-', ''),
      avatar_url      = null,
      bio             = null,
      date_of_birth   = null,
      age_verified_at = null,
      referral_code   = null,
      updated_at      = now()
    where id = r.user_id;

    update auth.users set
      email = 'deleted+' || r.user_id::text || '@invalid',
      raw_user_meta_data = '{}'::jsonb
    where id = r.user_id;

    -- ログイン中の端末を即座に締め出す（メール無効化だけでは切れない）
    perform revoke_user_sessions(r.user_id);

    delete from push_tokens where user_id = r.user_id;
    delete from user_genres  where user_id = r.user_id;
    delete from user_games   where user_id = r.user_id;
    delete from notifications where user_id = r.user_id;

    insert into user_moderation_state(user_id, state, reason)
      values (r.user_id, 'deleted', 'account deleted')
    on conflict (user_id) do update
      set state = 'deleted', reason = 'account deleted', updated_at = now();

    update account_deletions set status = 'completed', completed_at = now()
     where user_id = r.user_id;
  end loop;

  return jsonb_build_object('dry_run', p_dry_run, 'accounts', v_count, 'forfeited_points', v_forfeited);
end $$;
revoke all on function public.process_account_deletions(boolean) from public, anon, authenticated;

-- ============================================================
-- 8) retention_cohorts: 活動側にも期間の上限を入れる
--    コホートは90日で切っているのに活動側が無制限で、イベント全期間の
--    distinct 走査になっていた。管理画面を開くたびに全表を舐める。
-- ============================================================
create or replace view public.retention_cohorts
with (security_invoker = on) as
with cohort as (
  select p.id as user_id, p.created_at::date as cohort_date
  from public.profiles p
  where p.created_at >= current_date - 90
),
activity as (
  select distinct user_id, created_at::date as day
  from public.app_events
  where created_at >= current_date - 121   -- 最古コホート(90日前)の D30 まで見れば足りる
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

-- ============================================================
-- 9) record_events: params のサイズを制限する
--    件数と文字列長は制限していたが params は無制限で、1件で数MBを投げ込めた。
-- ============================================================
insert into public.app_config (key, value) values ('event_params_max_bytes', '2048'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.record_events(p_events jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_max int; v_pmax int; v_count int := 0;
  e jsonb; v_name text; v_params jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_events) <> 'array' then raise exception 'events must be an array'; end if;

  v_max  := legal_config('event_batch_max', 50)::int;
  v_pmax := legal_config('event_params_max_bytes', 2048)::int;
  if jsonb_array_length(p_events) > v_max then
    return jsonb_build_object('status','rejected','reason','batch_too_large','max',v_max);
  end if;

  for e in select * from jsonb_array_elements(p_events) loop
    v_name := e->>'name';
    if v_name is null or v_name !~ '^[a-z][a-z0-9_]{2,49}$' then
      continue;
    end if;
    v_params := coalesce(e->'params', '{}'::jsonb);
    -- 大きすぎる params は捨てる（イベント自体は記録する）
    if octet_length(v_params::text) > v_pmax then
      v_params := jsonb_build_object('_truncated', true);
    end if;
    insert into app_events(user_id, name, params, session_id, platform)
      values (v_uid, v_name, v_params,
              left(coalesce(e->>'session_id',''), 64),
              left(coalesce(e->>'platform',''), 16));
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('status','ok','recorded', v_count);
end $$;
revoke all on function public.record_events(jsonb) from public, anon;
grant execute on function public.record_events(jsonb) to authenticated;
