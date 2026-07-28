-- ============================================================
-- 0021: 不正検知（fraud detection）
--
-- fraud_flags テーブルは 0002 から存在し、flag_type のコメントに
-- multi_account / velocity / emulator / vpn と設計意図まで書かれていたが、
-- 実際に起票していたのは「すでに BAN 済みユーザーが postback を受けた時」
-- ＝事後記録のみで、検知ロジックは存在しなかった。
--
-- ポイ活の収益源は広告主の CPA 報酬であり、不正ユーザーの混入は
-- 「広告主に切られる＝事業が止まる」直接のリスクになる。
-- API の穴（無限鋳造・連打・在庫レース）は 0013 で塞いだので、
-- ここで塞ぐのは「正規 API を正しく叩く不正ユーザー」の側。
--
--   1) fraud_settings      … 閾値をマイグレーション無しで調整できるように
--   2) user_devices        … 端末とアカウントの紐付け（多重アカウント検知の土台）
--   3) raise_fraud_flag    … 重複起票を抑えつつ fraud_flags に起票する内部関数
--   4) register_device     … 端末登録 + multi_account / emulator 検知（アプリから呼ぶ）
--   5) check_velocity      … 短時間の異常獲得を検知（apply_points から自動で走る）
--   6) admin_fraud_rows    … 運営レビュー用ビュー
--   7) resolve_fraud_flag  … 運営の処理（却下 / 凍結 / BAN）
--
-- 注意: device_id はクライアント申告値なので「証拠」ではなく「シグナル」。
-- 端末の真正性を厳密に取るには DeviceCheck(iOS) / Play Integrity(Android) の
-- アテステーションが要る（本番強化の次段）。ここでは自己申告値でも十分に効く
-- 「同一端末でアカウントを作り直す」典型パターンの検知を目的とする。
-- ============================================================

-- ---------- 1) 閾値設定 ----------
create table if not exists public.fraud_settings (
  key        text primary key,
  value      bigint not null,
  note       text,
  updated_at timestamptz not null default now()
);

insert into public.fraud_settings(key, value, note) values
  ('multi_account_warn',      3,     '同一端末でこの数以上のアカウント → multi_account 起票'),
  ('multi_account_mark',      5,     '同一端末でこの数以上 → さらに moderation_state を marked に'),
  ('velocity_count_1h',      40,     '1時間あたりの獲得回数がこの数以上 → velocity 起票(medium)'),
  ('velocity_points_1h',  20000,     '1時間あたりの獲得ポイントがこの値以上 → velocity 起票(high)'),
  ('flag_cooldown_minutes', 1440,    '同一ユーザー/同一種別の再起票を抑制する時間（分）')
on conflict (key) do nothing;

alter table public.fraud_settings enable row level security; -- ポリシー無し＝service_role 専用

create or replace function public.fraud_setting(p_key text, p_default bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select value from fraud_settings where key = p_key), p_default);
$$;
revoke all on function public.fraud_setting(text, bigint) from public, anon, authenticated;

-- ---------- 2) 端末とアカウントの紐付け ----------
create table if not exists public.user_devices (
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   text not null,
  platform    text,
  model       text,
  os_version  text,
  is_emulator boolean not null default false,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (user_id, device_id)
);
-- 「この端末を使っている全アカウント」を引くための索引（多重アカウント検知の主経路）
create index if not exists idx_user_devices_device on public.user_devices(device_id);

alter table public.user_devices enable row level security;
drop policy if exists ud_self_read on public.user_devices;
create policy ud_self_read on public.user_devices
  for select using (auth.uid() = user_id);
-- 書き込みは register_device（SECURITY DEFINER）経由のみ。直接 INSERT はポリシー不在＝拒否。

-- ---------- 3) 起票の共通処理（重複抑制つき） ----------
-- 同じユーザー・同じ種別の未解決フラグが cooldown 内にあれば起票しない。
-- 運営のレビューキューが同一事象で溢れるのを防ぐ。
create or replace function public.raise_fraud_flag(
  p_user uuid, p_type text, p_severity text, p_detail jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cooldown bigint;
begin
  if p_user is null then return null; end if;
  v_cooldown := fraud_setting('flag_cooldown_minutes', 1440);

  if exists (
    select 1 from fraud_flags
     where user_id = p_user and flag_type = p_type and resolved_at is null
       and created_at > now() - make_interval(mins => v_cooldown::int)
  ) then
    return null;
  end if;

  insert into fraud_flags(user_id, flag_type, severity, detail)
    values (p_user, p_type, p_severity, p_detail)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.raise_fraud_flag(uuid, text, text, jsonb) from public, anon, authenticated;

-- ---------- 4) 端末登録 + 多重アカウント / エミュレータ検知 ----------
create or replace function public.register_device(
  p_device_id   text,
  p_platform    text default null,
  p_model       text default null,
  p_os_version  text default null,
  p_is_emulator boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_accounts bigint; v_warn bigint; v_mark bigint; v_flag uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_device_id is null or length(btrim(p_device_id)) = 0 then
    raise exception 'device_id required';
  end if;
  if length(p_device_id) > 200 then raise exception 'device_id too long'; end if;

  insert into user_devices(user_id, device_id, platform, model, os_version, is_emulator)
    values (v_uid, btrim(p_device_id), p_platform, p_model, p_os_version, coalesce(p_is_emulator,false))
  on conflict (user_id, device_id) do update
    set last_seen   = now(),
        platform    = coalesce(excluded.platform,   user_devices.platform),
        model       = coalesce(excluded.model,      user_devices.model),
        os_version  = coalesce(excluded.os_version, user_devices.os_version),
        is_emulator = excluded.is_emulator;

  -- この端末に紐づくアカウント数（＝作り直しの痕跡）
  select count(distinct user_id) into v_accounts
    from user_devices where device_id = btrim(p_device_id);

  v_warn := fraud_setting('multi_account_warn', 3);
  v_mark := fraud_setting('multi_account_mark', 5);

  if v_accounts >= v_warn then
    v_flag := raise_fraud_flag(
      v_uid, 'multi_account',
      case when v_accounts >= v_mark then 'high' else 'medium' end,
      jsonb_build_object('device_id', btrim(p_device_id), 'accounts', v_accounts)
    );
  end if;

  -- 閾値超えは自動で marked に（BAN/凍結は誤検知の影響が大きいので運営判断に残す）。
  -- marked は獲得をブロックしない＝レビュー対象の目印。既に banned/frozen なら触らない。
  if v_accounts >= v_mark then
    insert into user_moderation_state(user_id, state, reason)
      values (v_uid, 'marked', 'auto: multi_account')
    on conflict (user_id) do update
      set state = case when user_moderation_state.state = 'active' then 'marked'
                       else user_moderation_state.state end,
          reason = case when user_moderation_state.state = 'active' then 'auto: multi_account'
                        else user_moderation_state.reason end,
          updated_at = now();
  end if;

  if coalesce(p_is_emulator, false) then
    perform raise_fraud_flag(v_uid, 'emulator', 'medium',
      jsonb_build_object('device_id', btrim(p_device_id), 'model', p_model, 'platform', p_platform));
  end if;

  return jsonb_build_object('ok', true, 'accounts_on_device', v_accounts, 'flagged', v_flag is not null);
end $$;
revoke all on function public.register_device(text, text, text, text, boolean) from public, anon;
grant execute on function public.register_device(text, text, text, text, boolean) to authenticated;

-- ---------- 5) 獲得速度の異常検知 ----------
-- 直近1時間の「獲得回数」と「獲得ポイント」を見る。人力では到達しない速度＝自動化の疑い。
create or replace function public.check_velocity(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_count bigint; v_sum bigint;
begin
  select count(*), coalesce(sum(delta), 0) into v_count, v_sum
    from point_ledger
   where user_id = p_user and delta > 0 and status = 'confirmed'
     and created_at > now() - interval '1 hour';

  if v_sum >= fraud_setting('velocity_points_1h', 20000) then
    perform raise_fraud_flag(p_user, 'velocity', 'high',
      jsonb_build_object('window', '1h', 'points', v_sum, 'count', v_count));
  elsif v_count >= fraud_setting('velocity_count_1h', 40) then
    perform raise_fraud_flag(p_user, 'velocity', 'medium',
      jsonb_build_object('window', '1h', 'points', v_sum, 'count', v_count));
  end if;
end $$;
revoke all on function public.check_velocity(uuid) from public, anon, authenticated;

-- apply_points に検知を挿す。全ての付与が通る唯一の隘路なので、ここに置けば
-- mission / offer / postback / staking すべてを一箇所でカバーできる。
-- 検知は「絶対に付与を壊さない」— 例外は握りつぶす（監視が落ちても経済は回る）。
create or replace function public.apply_points(
  p_user uuid, p_delta bigint, p_reason text,
  p_ref_type text default null, p_ref_id uuid default null, p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_ledger uuid;
begin
  if p_idempotency_key is not null then
    select id into v_ledger from point_ledger where idempotency_key = p_idempotency_key;
    if found then return v_ledger; end if;
  end if;

  begin
    insert into point_ledger(user_id, delta, reason, ref_type, ref_id, status, idempotency_key)
      values (p_user, p_delta, p_reason, p_ref_type, p_ref_id, 'confirmed', p_idempotency_key)
      returning id into v_ledger;
  exception when unique_violation then
    select id into v_ledger from point_ledger where idempotency_key = p_idempotency_key;
    return v_ledger;
  end;

  insert into point_wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  update point_wallets set
    balance         = balance + p_delta,
    lifetime_earned = lifetime_earned + greatest(p_delta, 0),
    lifetime_spent  = lifetime_spent  + greatest(-p_delta, 0),
    updated_at = now()
  where user_id = p_user;

  -- 付与時のみ速度検知。失敗しても付与は成立させる。
  if p_delta > 0 then
    begin
      perform check_velocity(p_user);
    exception when others then null;
    end;
  end if;

  return v_ledger;
end $$;
revoke all on function public.apply_points(uuid, bigint, text, text, uuid, text) from public, anon, authenticated;

-- ---------- 6) 運営レビュー用ビュー ----------
create or replace view public.admin_fraud_rows
with (security_invoker = on) as
select
  f.id, f.user_id, f.flag_type, f.severity, f.detail,
  f.created_at, f.resolved_at,
  p.handle, p.username,
  coalesce(m.state, 'active') as moderation_state,
  coalesce(w.balance, 0)      as balance,
  (select count(distinct d2.user_id)
     from user_devices d1
     join user_devices d2 on d2.device_id = d1.device_id
    where d1.user_id = f.user_id) as linked_accounts
from fraud_flags f
left join profiles p              on p.id      = f.user_id
left join user_moderation_state m on m.user_id = f.user_id
left join point_wallets w         on w.user_id = f.user_id;
revoke all on public.admin_fraud_rows from public, anon, authenticated;

-- ---------- 7) 運営の処理 ----------
-- dismiss=誤検知として解決 / freeze=一時凍結 / ban=永久停止。
-- 凍結・BAN は confirm_postback・confirm_offer 側で獲得がブロックされる。
create or replace function public.resolve_fraud_flag(
  p_flag_id uuid, p_action text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_flag fraud_flags; v_state text;
begin
  if p_action not in ('dismiss','freeze','ban') then
    raise exception 'invalid action: %', p_action;
  end if;

  select * into v_flag from fraud_flags where id = p_flag_id;
  if not found then raise exception 'flag not found'; end if;

  if v_flag.resolved_at is not null then
    return jsonb_build_object('status','duplicate','reason','already_resolved');
  end if;

  update fraud_flags
     set resolved_at = now(),
         detail = coalesce(detail,'{}'::jsonb)
                  || jsonb_build_object('resolution', p_action, 'note', p_note)
   where id = p_flag_id;

  if p_action <> 'dismiss' and v_flag.user_id is not null then
    v_state := case p_action when 'freeze' then 'frozen' else 'banned' end;
    insert into user_moderation_state(user_id, state, reason)
      values (v_flag.user_id, v_state, coalesce(p_note, 'fraud: ' || v_flag.flag_type))
    on conflict (user_id) do update
      set state = excluded.state, reason = excluded.reason, updated_at = now();
  end if;

  return jsonb_build_object('status','resolved','action',p_action,'user_id',v_flag.user_id);
end $$;
revoke all on function public.resolve_fraud_flag(uuid, text, text) from public, anon, authenticated;
