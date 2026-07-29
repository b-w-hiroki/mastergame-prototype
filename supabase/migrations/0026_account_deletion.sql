-- ============================================================
-- 0026: アカウント削除（退会）
--
-- **App Store は 2022 年から「アカウントを作成できるアプリは、アプリ内でアカウント削除も
-- 提供すること」を必須要件にしている。** 実装が無いと審査で落ちる。加えて 0024 で入れた
-- プライバシーポリシーには「退会後は速やかに削除します」と書いてあるのに実装が無く、
-- 文書と実態が矛盾していた（それ自体が法務リスク）。
--
-- ■ なぜ「物理削除」ではなく「匿名化」なのか
-- point_ledger をはじめ多くのテーブルが auth.users を `on delete cascade` で参照している。
-- 素朴に auth.users を削除すると **台帳ごと消えて会計が壊れる**（発行済みポイントの記録が
-- 消え、経済KPIも監査証跡も失われる）。台帳は追記専用として設計してあるので、
-- ここで消してはいけない。したがって:
--   - PII（メール・生年月日・プロフィール）は消す/無効化する
--   - 会計記録（point_ledger）は残す
--   - 不正防止に必要な最小限（端末の紐付け）は残す
--     → 「退会 → 再登録」で初回ボーナスを取り直す荒稼ぎを防ぐため。
--       これは 0024 のプライバシーポリシー「不正防止および法令遵守に必要な範囲を除き削除」
--       の範囲内。
--   - 同意記録（legal_acceptances）は残す（いつどの版に同意したかは法的な証跡）
--
-- ■ 猶予期間
-- 誤操作と「勢いでの退会」を救うため、既定7日の猶予後に確定する。
-- ストア要件は「アプリ内で削除を開始できること」なので猶予付きで問題ない。
-- 猶予中はログインでき、いつでも取り消せる。
-- ============================================================

insert into public.app_config (key, value) values
  ('account_deletion_grace_days', '7'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------- moderation_state に 'deleted' を追加 ----------
alter table public.user_moderation_state drop constraint if exists user_moderation_state_state_check;
alter table public.user_moderation_state add constraint user_moderation_state_state_check
  check (state in ('active','frozen','banned','marked','deleted'));

-- ---------- 削除申請 ----------
create table if not exists public.account_deletions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','cancelled','completed')),
  reason       text,
  requested_at timestamptz not null default now(),
  scheduled_at timestamptz not null,
  completed_at timestamptz
);
create index if not exists idx_account_deletions_due
  on public.account_deletions(scheduled_at) where status = 'pending';

alter table public.account_deletions enable row level security;
drop policy if exists ad_self_read on public.account_deletions;
create policy ad_self_read on public.account_deletions
  for select using (auth.uid() = user_id);

-- ---------- 申請 ----------
create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_days int; v_sched timestamptz; v_balance bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if exists (select 1 from account_deletions where user_id = v_uid and status = 'completed') then
    return jsonb_build_object('status','rejected','reason','already_deleted');
  end if;

  v_days  := legal_config('account_deletion_grace_days', 7)::int;
  v_sched := now() + make_interval(days => v_days);
  select coalesce(balance, 0) into v_balance from point_wallets where user_id = v_uid;

  insert into account_deletions(user_id, status, reason, requested_at, scheduled_at)
    values (v_uid, 'pending', p_reason, now(), v_sched)
  on conflict (user_id) do update
    set status = 'pending', reason = excluded.reason,
        requested_at = now(), scheduled_at = excluded.scheduled_at, completed_at = null;

  -- 残高は退会確定で失効する。交換の機会を明示的に知らせる（黙って消さない）。
  return jsonb_build_object(
    'status','ok',
    'scheduled_at', v_sched,
    'grace_days', v_days,
    'balance', coalesce(v_balance, 0),
    'notice', case when coalesce(v_balance,0) > 0
                   then '保有ポイントは退会の完了時に失効します。交換がお済みでない場合はキャンセルしてご交換ください。'
                   else '退会をキャンセルする場合は完了日までにお手続きください。' end
  );
end $$;
revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

-- ---------- 取消 ----------
create or replace function public.cancel_account_deletion()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_rows int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  update account_deletions set status = 'cancelled'
   where user_id = v_uid and status = 'pending';
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('status','rejected','reason','no_pending_request');
  end if;
  return jsonb_build_object('status','ok');
end $$;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------- 自分の状態 ----------
create or replace function public.my_account_deletion()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row account_deletions;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_row from account_deletions where user_id = v_uid;
  if not found or v_row.status <> 'pending' then
    return jsonb_build_object('pending', false);
  end if;
  return jsonb_build_object('pending', true, 'scheduled_at', v_row.scheduled_at);
end $$;
revoke all on function public.my_account_deletion() from public, anon;
grant execute on function public.my_account_deletion() to authenticated;

-- ---------- 確定処理（匿名化） ----------
-- service_role 専用。pg_cron 等で日次実行する。p_dry_run=true なら対象を数えるだけ。
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

    -- 1) 残高の失効。台帳は追記専用なので負の確定エントリとして残す（監査可能にする）
    if coalesce(v_balance, 0) > 0 then
      perform apply_points(r.user_id, -v_balance, 'account_closed', 'account', null,
                           'account_closed:' || r.user_id::text);
    end if;

    -- 2) PII の削除／匿名化。投稿は消さない（スレッドが壊れるため）が、
    --    表示名は profiles 由来なのでここを匿名化すれば投稿者は特定できなくなる。
    update profiles set
      username        = '退会したユーザー',
      handle          = 'deleted_' || translate(r.user_id::text, '-', ''),
      avatar_url      = null,
      bio             = null,
      date_of_birth   = null,
      age_verified_at = null,
      referral_code   = null,   -- 招待コードを無効化（退会後に使われないように）
      updated_at      = now()
    where id = r.user_id;

    -- 3) ログインできないようにする（auth のメールを無効ドメインへ退避）
    update auth.users set
      email = 'deleted+' || r.user_id::text || '@invalid',
      raw_user_meta_data = '{}'::jsonb
    where id = r.user_id;

    -- 4) 不要な個人データの物理削除
    delete from push_tokens where user_id = r.user_id;
    delete from user_genres  where user_id = r.user_id;
    delete from user_games   where user_id = r.user_id;
    delete from notifications where user_id = r.user_id;

    -- 5) 状態を deleted に（付与ガードで弾くため）
    insert into user_moderation_state(user_id, state, reason)
      values (r.user_id, 'deleted', 'account deleted')
    on conflict (user_id) do update
      set state = 'deleted', reason = 'account deleted', updated_at = now();

    -- 6) 意図的に残すもの:
    --    point_ledger      … 会計記録（追記専用・cascade で消さない）
    --    legal_acceptances … いつどの版に同意したかの証跡
    --    user_devices      … 「退会→再登録」での初回ボーナス荒稼ぎ検知に必要
    update account_deletions set status = 'completed', completed_at = now()
     where user_id = r.user_id;
  end loop;

  return jsonb_build_object('dry_run', p_dry_run, 'accounts', v_count, 'forfeited_points', v_forfeited);
end $$;
revoke all on function public.process_account_deletions(boolean) from public, anon, authenticated;

-- ---------- 退会済み端末からの再登録を検知 ----------
-- 端末に退会済みアカウントが紐づいていれば起票する。ブロックはしない
-- （家族の共有端末など正当なケースがあるため、運営がレビューする材料として残す）。
create or replace function public.register_device(
  p_device_id   text,
  p_platform    text default null,
  p_model       text default null,
  p_os_version  text default null,
  p_is_emulator boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_accounts bigint; v_warn bigint; v_mark bigint; v_flag uuid; v_deleted bigint;
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

  -- 退会済みアカウントが同じ端末にある＝初回ボーナスの取り直しを疑う材料
  select count(*) into v_deleted
    from user_devices d
    join user_moderation_state m on m.user_id = d.user_id and m.state = 'deleted'
   where d.device_id = btrim(p_device_id) and d.user_id <> v_uid;
  if v_deleted > 0 then
    perform raise_fraud_flag(v_uid, 'rejoin_after_deletion', 'medium',
      jsonb_build_object('device_id', btrim(p_device_id), 'deleted_accounts', v_deleted));
  end if;

  return jsonb_build_object('ok', true, 'accounts_on_device', v_accounts, 'flagged', v_flag is not null);
end $$;
revoke all on function public.register_device(text, text, text, text, boolean) from public, anon;
grant execute on function public.register_device(text, text, text, text, boolean) to authenticated;

-- ---------- 付与ガードに 'deleted' を追加 ----------
-- 退会後に遅れて到着した postback / オファー確定で、匿名化済みアカウントに
-- 付与してしまうのを防ぐ（残高は失効済みなので、付与すると復活してしまう）。
create or replace function public.confirm_postback(
  p_partner_slug text,
  p_transaction_id text,
  p_click_id text default null,
  p_reward_override integer default null,
  p_raw jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_partner ad_partners; v_click mission_clicks; v_m missions;
  v_event uuid; v_uid uuid; v_reward integer; v_ledger uuid; v_modstate text;
begin
  select * into v_partner from ad_partners where slug = p_partner_slug;
  if not found then return jsonb_build_object('status','rejected','reason','unknown_partner'); end if;
  if v_partner.status <> 'active' then
    return jsonb_build_object('status','rejected','reason','partner_suspended');
  end if;

  begin
    insert into postback_events(partner_id, transaction_id, click_id, status, raw, received_at)
      values (v_partner.id, p_transaction_id, p_click_id, 'received', p_raw, now())
      returning id into v_event;
  exception when unique_violation then
    return jsonb_build_object('status','duplicate','transaction_id',p_transaction_id);
  end;

  if p_click_id is not null then
    select * into v_click from mission_clicks
      where click_id = p_click_id and partner_id = v_partner.id;
  end if;
  if v_click.user_id is null then
    update postback_events set status='rejected', processed_at=now() where id=v_event;
    return jsonb_build_object('status','rejected','reason','no_attribution');
  end if;
  if v_click.expires_at < now() then
    update postback_events set status='rejected', processed_at=now() where id=v_event;
    return jsonb_build_object('status','rejected','reason','attribution_expired');
  end if;

  v_uid := v_click.user_id;
  select * into v_m from missions where id = v_click.mission_id;

  select state into v_modstate from user_moderation_state where user_id = v_uid;
  if v_modstate in ('banned','frozen','deleted') then
    update postback_events set status='rejected', user_id=v_uid, mission_id=v_m.id, processed_at=now() where id=v_event;
    insert into fraud_flags(user_id, flag_type, severity, detail)
      values (v_uid, 'postback_blocked_state', 'medium', jsonb_build_object('state',v_modstate,'tx',p_transaction_id));
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  if v_click.is_converted then
    update postback_events set status='duplicate', processed_at=now() where id=v_event;
    return jsonb_build_object('status','duplicate','reason','click_already_converted');
  end if;

  v_reward := v_m.reward_points;
  if p_reward_override is not null and p_reward_override > 0 and p_reward_override <= v_m.reward_points then
    v_reward := p_reward_override;
  end if;

  v_ledger := apply_points(v_uid, v_reward, 'postback', 'mission', v_m.id,
                           'postback:' || v_partner.id::text || ':' || p_transaction_id);
  update mission_clicks set is_converted = true where id = v_click.id;
  update profiles set xp = xp + coalesce(v_m.xp_reward, 0) where id = v_uid;
  insert into mission_completions(user_id, mission_id, status, progress, ledger_id, completed_at, period_key)
    values (v_uid, v_m.id, 'confirmed', v_m.max_progress, v_ledger, now(), p_transaction_id)
    on conflict (user_id, mission_id, period_key) do nothing;
  update postback_events
    set status='accepted', user_id=v_uid, mission_id=v_m.id,
        reward_points=v_reward, ledger_id=v_ledger, processed_at=now()
    where id=v_event;

  return jsonb_build_object('status','accepted','user_id',v_uid,'reward',v_reward);
end $$;
revoke all on function public.confirm_postback(text, text, text, integer, jsonb) from public, anon, authenticated;

create or replace function public.confirm_offer(
  p_network_code text,
  p_network_txn_id text,
  p_user uuid,
  p_offer_external_id text default null,
  p_reward_override integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_net ad_networks; v_offer offers; v_reward integer; v_ledger uuid;
  v_modstate text; v_cap integer; v_used integer;
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
  end if;
  if found then
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
      values (p_user, (case when v_offer.id is not null then v_offer.id end), v_net.id, p_network_txn_id, 'pending', v_reward);
  exception when unique_violation then
    return jsonb_build_object('status','duplicate','network_txn_id',p_network_txn_id);
  end;

  v_ledger := apply_points(p_user, v_reward, 'offer', 'offer', v_offer.id,
                           'offer:' || v_net.id::text || ':' || p_network_txn_id);
  update offer_completions set status = 'confirmed', ledger_id = v_ledger, confirmed_at = now()
    where network_id = v_net.id and network_txn_id = p_network_txn_id;

  insert into user_daily_offer_counts(user_id, day, ad_type, count)
    values (p_user, current_date, 'offerwall', 1)
    on conflict (user_id, day, ad_type) do update set count = user_daily_offer_counts.count + 1;

  return jsonb_build_object('status','accepted','user_id',p_user,'reward',v_reward);
end $$;
revoke all on function public.confirm_offer(text, text, uuid, text, integer) from public, anon, authenticated;

-- ---------- 運営レビュー用 ----------
create or replace view public.admin_deletion_rows
with (security_invoker = on) as
select
  d.user_id, d.status, d.reason, d.requested_at, d.scheduled_at, d.completed_at,
  p.handle, p.username,
  coalesce(w.balance, 0) as balance
from public.account_deletions d
left join public.profiles p      on p.id = d.user_id
left join public.point_wallets w on w.user_id = d.user_id;
revoke all on public.admin_deletion_rows from public, anon, authenticated;
