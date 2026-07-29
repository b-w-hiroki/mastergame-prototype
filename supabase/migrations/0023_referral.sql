-- ============================================================
-- 0023: 招待・リファラル
--
-- 「招待」はポイ活の主要な成長エンジンだが、同時に**最も荒らされやすい導線**でもある。
-- 自己招待・捨てアカウント量産・端末を変えないままの多重取得が典型で、対策の無い
-- 招待機能は不正の入口そのものになる。そのため 0021 の不正検知（user_devices）と
-- 連動させ、以下の多層で守る:
--
--   1) 自己招待の禁止（自分のコードは使えない）
--   2) 1アカウント1回だけ被招待（referee_id を UNIQUE）
--   3) **同一端末の招待を拒否**（0021 の user_devices を突き合わせ、fraud_flags に起票）
--   4) 新規アカウントのみ被招待可（作成から N 日以内。既存アカウントの刈り取り防止）
--   5) 招待者の日次上限（大量ファーミングの抑制）
--   6) **招待者への報酬は被招待者が実際に遊んでから**（マイルストーン到達で確定）
--      → 捨てアカウントを作るだけでは招待者に報酬が入らない
--   7) BAN/凍結ユーザーは対象外
--
-- 報酬額・閾値は app_config で調整できる（マイグレーション不要）。
-- ============================================================

-- ---------- 設定 ----------
insert into public.app_config (key, value) values
  ('referral_reward_referee',   '30000'::jsonb),  -- 被招待者への報酬（額面30円相当）
  ('referral_reward_referrer',  '50000'::jsonb),  -- 招待者への報酬（マイルストーン到達後）
  ('referral_milestone_points', '10000'::jsonb),  -- 被招待者がこの累計獲得に達したら招待者に付与
  ('referral_max_age_days',     '7'::jsonb),      -- 被招待できるのは登録から何日以内か
  ('referral_referrer_daily_cap', '10'::jsonb)    -- 招待者が1日に確定できる招待数
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.referral_config(p_key text, p_default bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::bigint from app_config where key = p_key), p_default);
$$;
revoke all on function public.referral_config(text, bigint) from public, anon, authenticated;

-- ---------- 招待コード ----------
alter table public.profiles add column if not exists referral_code text;
create unique index if not exists idx_profiles_referral_code
  on public.profiles(referral_code) where referral_code is not null;

-- 紛らわしい文字(0/O/1/I)を除いた8桁。口頭・手入力で共有されることを想定。
create or replace function public.gen_referral_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text; i int;
begin
  for attempt in 1..20 loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    if not exists (select 1 from profiles where referral_code = v_code) then
      return v_code;
    end if;
  end loop;
  -- 20回引いても衝突する状況は異常。無言で重複させず落とす。
  raise exception 'could not generate a unique referral code';
end $$;
revoke all on function public.gen_referral_code() from public, anon, authenticated;

-- 既存ユーザーに付与
update public.profiles set referral_code = public.gen_referral_code() where referral_code is null;

-- 新規ユーザーにも自動付与
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, handle, referral_code)
    values (new.id, coalesce(new.raw_user_meta_data->>'username','Player'),
            'player_' || translate(new.id::text, '-', ''),
            public.gen_referral_code());
  insert into public.point_wallets (user_id) values (new.id);
  return new;
end $$;

-- ---------- 招待の記録 ----------
create table if not exists public.referrals (
  id                 uuid primary key default gen_random_uuid(),
  referrer_id        uuid not null references auth.users(id) on delete cascade,
  referee_id         uuid not null unique references auth.users(id) on delete cascade, -- 1人1回だけ被招待
  code               text not null,
  status             text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  referee_ledger_id  uuid references public.point_ledger(id),
  referrer_ledger_id uuid references public.point_ledger(id),
  created_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  constraint referral_no_self check (referrer_id <> referee_id)   -- 自己招待はDBレベルでも禁止
);
create index if not exists idx_referrals_referrer on public.referrals(referrer_id, created_at desc);

alter table public.referrals enable row level security;
drop policy if exists ref_self_read on public.referrals;
-- 自分が招待した/された行のみ参照可。書き込みは RPC 経由のみ。
create policy ref_self_read on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referee_id);

-- ---------- 自分の招待コードと実績 ----------
create or replace function public.my_referral_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text; v_pending int; v_confirmed int; v_earned bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select referral_code into v_code from profiles where id = v_uid;
  if v_code is null then
    v_code := gen_referral_code();
    update profiles set referral_code = v_code where id = v_uid;
  end if;

  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'confirmed')
    into v_pending, v_confirmed
    from referrals where referrer_id = v_uid;

  select coalesce(sum(l.delta), 0) into v_earned
    from referrals r join point_ledger l on l.id = r.referrer_ledger_id
   where r.referrer_id = v_uid;

  return jsonb_build_object(
    'code', v_code,
    'pending', coalesce(v_pending, 0),
    'confirmed', coalesce(v_confirmed, 0),
    'earned_points', coalesce(v_earned, 0),
    'reward_referee', referral_config('referral_reward_referee', 30000),
    'reward_referrer', referral_config('referral_reward_referrer', 50000)
  );
end $$;
revoke all on function public.my_referral_status() from public, anon;
grant execute on function public.my_referral_status() to authenticated;

-- ---------- 招待コードの利用 ----------
create or replace function public.redeem_referral_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid; v_created timestamptz; v_reward bigint; v_ledger uuid;
  v_shared int; v_today int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_code is null or length(btrim(p_code)) = 0 then raise exception 'code required'; end if;

  -- 既に被招待済み（1人1回）
  if exists (select 1 from referrals where referee_id = v_uid) then
    return jsonb_build_object('status','rejected','reason','already_referred');
  end if;

  select id into v_referrer from profiles where referral_code = upper(btrim(p_code));
  if v_referrer is null then
    return jsonb_build_object('status','rejected','reason','invalid_code');
  end if;

  -- 自己招待
  if v_referrer = v_uid then
    return jsonb_build_object('status','rejected','reason','self_referral');
  end if;

  -- 新規アカウントのみ（既存アカウントの刈り取りを防ぐ）
  select created_at into v_created from profiles where id = v_uid;
  if v_created < now() - make_interval(days => referral_config('referral_max_age_days', 7)::int) then
    return jsonb_build_object('status','rejected','reason','account_too_old');
  end if;

  -- BAN/凍結ユーザーは対象外（招待側・被招待側とも）
  if exists (select 1 from user_moderation_state
              where user_id in (v_uid, v_referrer) and state in ('banned','frozen')) then
    return jsonb_build_object('status','rejected','reason','moderated');
  end if;

  -- 同一端末からの招待は拒否（0021 の user_devices と突き合わせ）。
  -- 「同じ端末でアカウントを作り直して自分を招待する」典型パターンをここで止める。
  select count(*) into v_shared
    from user_devices a join user_devices b on a.device_id = b.device_id
   where a.user_id = v_uid and b.user_id = v_referrer;
  if v_shared > 0 then
    perform raise_fraud_flag(v_uid, 'referral_same_device', 'high',
      jsonb_build_object('referrer', v_referrer, 'code', upper(btrim(p_code))));
    return jsonb_build_object('status','rejected','reason','same_device');
  end if;

  -- 招待者の日次上限（大量ファーミングの抑制）
  select count(*) into v_today from referrals
   where referrer_id = v_referrer and created_at > now() - interval '1 day';
  if v_today >= referral_config('referral_referrer_daily_cap', 10) then
    return jsonb_build_object('status','rejected','reason','referrer_daily_cap');
  end if;

  -- 被招待者へは即時付与。招待者への報酬はマイルストーン到達まで保留（捨てアカ対策）。
  v_reward := referral_config('referral_reward_referee', 30000);
  v_ledger := apply_points(v_uid, v_reward, 'referral_referee', 'referral', null,
                           'referral_referee:' || v_uid::text);

  insert into referrals(referrer_id, referee_id, code, status, referee_ledger_id)
    values (v_referrer, v_uid, upper(btrim(p_code)), 'pending', v_ledger);

  return jsonb_build_object('status','ok','reward', v_reward,
                            'note','招待した人へのボーナスは、あなたがミッションを進めると確定します');
exception when unique_violation then
  -- 競合：同時に2回叩かれた場合も二重付与しない（idempotency_key + referee_id UNIQUE）
  return jsonb_build_object('status','rejected','reason','already_referred');
end $$;
revoke all on function public.redeem_referral_code(text) from public, anon;
grant execute on function public.redeem_referral_code(text) to authenticated;

-- ---------- 招待者への報酬確定 ----------
-- 被招待者が「実際に遊んだ」ことを累計獲得ポイントで判定する。
-- 捨てアカウントを作るだけでは招待者に報酬が入らない＝ファーミングの旨味を消す。
create or replace function public.try_confirm_referral(p_referee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ref referrals; v_earned bigint; v_reward bigint; v_ledger uuid; v_today int;
begin
  select * into v_ref from referrals where referee_id = p_referee and status = 'pending';
  if not found then return; end if;

  select lifetime_earned into v_earned from point_wallets where user_id = p_referee;
  -- 招待ボーナス自体はマイルストーンに数えない（それだけで達成してしまうため）
  v_earned := coalesce(v_earned, 0) - referral_config('referral_reward_referee', 30000);
  if v_earned < referral_config('referral_milestone_points', 10000) then return; end if;

  -- 確定時点でも招待者のBAN/凍結を再確認（保留中に処分された場合に払わない）
  if exists (select 1 from user_moderation_state
              where user_id = v_ref.referrer_id and state in ('banned','frozen')) then
    update referrals set status = 'rejected', confirmed_at = now() where id = v_ref.id;
    return;
  end if;

  select count(*) into v_today from referrals
   where referrer_id = v_ref.referrer_id and status = 'confirmed'
     and confirmed_at > now() - interval '1 day';
  if v_today >= referral_config('referral_referrer_daily_cap', 10) then return; end if;

  v_reward := referral_config('referral_reward_referrer', 50000);
  v_ledger := apply_points(v_ref.referrer_id, v_reward, 'referral_referrer', 'referral', v_ref.id,
                           'referral_referrer:' || v_ref.id::text);

  update referrals
     set status = 'confirmed', confirmed_at = now(), referrer_ledger_id = v_ledger
   where id = v_ref.id;
end $$;
revoke all on function public.try_confirm_referral(uuid) from public, anon, authenticated;

-- claim_mission の成功時にマイルストーン判定を挿す。
-- 「ミッションを達成した＝実際にアプリを使った」を確定条件にする（postback/offer は
-- 最も荒らされやすい経路なので、招待の確定トリガーにはあえて使わない）。
create or replace function public.claim_mission(p_mission_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_m missions; v_ledger uuid;
  v_period text; v_completion uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_m from missions where id = p_mission_id and is_active;
  if not found then raise exception 'mission not found'; end if;
  if v_m.requires_verification then raise exception 'mission requires server verification (postback)'; end if;
  if v_m.starts_at is not null and v_m.starts_at > now() then raise exception 'mission not started'; end if;
  if v_m.ends_at   is not null and v_m.ends_at   < now() then raise exception 'mission ended'; end if;

  v_period := case v_m.type
    when 'daily'  then to_char(now() at time zone 'utc', 'YYYY-MM-DD')
    when 'weekly' then to_char(now() at time zone 'utc', 'IYYY-"W"IW')
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

  -- 招待の確定判定。失敗してもミッション達成は成立させる。
  begin
    perform try_confirm_referral(v_uid);
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;
revoke all on function public.claim_mission(uuid) from public, anon;
grant execute on function public.claim_mission(uuid) to authenticated;

-- ---------- 運営レビュー用 ----------
create or replace view public.admin_referral_rows
with (security_invoker = on) as
select
  r.id, r.status, r.code, r.created_at, r.confirmed_at,
  r.referrer_id, pr.handle as referrer_handle,
  r.referee_id,  pe.handle as referee_handle,
  coalesce(mr.state, 'active') as referrer_state,
  coalesce(me.state, 'active') as referee_state,
  (select count(distinct b.user_id)
     from user_devices a join user_devices b on a.device_id = b.device_id
    where a.user_id = r.referrer_id) as referrer_linked_accounts
from public.referrals r
left join public.profiles pr on pr.id = r.referrer_id
left join public.profiles pe on pe.id = r.referee_id
left join public.user_moderation_state mr on mr.user_id = r.referrer_id
left join public.user_moderation_state me on me.user_id = r.referee_id;
revoke all on public.admin_referral_rows from public, anon, authenticated;
