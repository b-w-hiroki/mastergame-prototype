-- ============================================================
-- MasterGame — 0015 台帳の冪等キー ＋ postback 取消（reversal）
--   spec §5.5/§6.3/§6.4 に対応。
--   1) point_ledger.idempotency_key（unique）＝二重付与の最終防御
--   2) apply_points を冪等キー対応に置換（オーバーロードを作らず drop→create）
--   3) confirm_postback / claim_mission が冪等キーを付与
--   4) reverse_postback RPC（取消・reversed 遷移・打ち消しエントリ）
-- ============================================================

-- ---------- 1) 冪等キー列 ----------
alter table public.point_ledger add column if not exists idempotency_key text;
-- NULL は複数許容（従来の付与に影響なし）。非 NULL のみ一意。
create unique index if not exists uq_ledger_idempotency
  on public.point_ledger(idempotency_key) where idempotency_key is not null;

-- ---------- 2) apply_points（冪等キー対応版へ置換） ----------
-- 旧5引数版を drop してから6引数版を作る（default 付きなので既存の5引数呼び出しも解決される）。
-- オーバーロードを残すと新シグネチャに PUBLIC EXECUTE が付き 0013 の権限剥奪が無効化されるため。
drop function if exists public.apply_points(uuid, bigint, text, text, uuid);
create or replace function public.apply_points(
  p_user uuid, p_delta bigint, p_reason text,
  p_ref_type text default null, p_ref_id uuid default null, p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_ledger uuid;
begin
  -- 冪等キーがあれば既存エントリを返し、二重付与しない（wallet も触らない）
  if p_idempotency_key is not null then
    select id into v_ledger from point_ledger where idempotency_key = p_idempotency_key;
    if found then return v_ledger; end if;
  end if;

  begin
    insert into point_ledger(user_id, delta, reason, ref_type, ref_id, status, idempotency_key)
      values (p_user, p_delta, p_reason, p_ref_type, p_ref_id, 'confirmed', p_idempotency_key)
      returning id into v_ledger;
  exception when unique_violation then
    -- 競合：先行トランザクションが付与済み。wallet は更新せず既存 ledger を返す。
    select id into v_ledger from point_ledger where idempotency_key = p_idempotency_key;
    return v_ledger;
  end;

  -- 新規挿入時のみ wallet を更新（欠損時は ensure→update）
  insert into point_wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  update point_wallets set
    balance         = balance + p_delta,
    lifetime_earned = lifetime_earned + greatest(p_delta, 0),
    lifetime_spent  = lifetime_spent  + greatest(-p_delta, 0),
    updated_at = now()
  where user_id = p_user;
  return v_ledger;
end $$;
revoke all on function public.apply_points(uuid, bigint, text, text, uuid, text) from public, anon, authenticated;

-- ---------- 3) confirm_postback に冪等キーを付与 ----------
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
  if v_modstate in ('banned','frozen') then
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

  -- 冪等キー：partner:transaction_id。台帳レベルでも二重付与を防ぐ最終防御。
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

-- ---------- claim_mission に冪等キーを付与 ----------
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

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;
revoke all on function public.claim_mission(uuid) from public, anon;
grant execute on function public.claim_mission(uuid) to authenticated;

-- ---------- 4) reverse_postback（取消） ----------
-- 不正判明・チャージバック時に確定済み postback を打ち消す。service_role 専用。
-- ledger は不変なので負の打ち消しエントリを追加し、関連状態を reversed に遷移する。
create or replace function public.reverse_postback(
  p_partner_slug text, p_transaction_id text, p_reason text default 'chargeback'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_partner ad_partners; v_event postback_events; v_ledger uuid;
begin
  select * into v_partner from ad_partners where slug = p_partner_slug;
  if not found then return jsonb_build_object('status','rejected','reason','unknown_partner'); end if;

  select * into v_event from postback_events
    where partner_id = v_partner.id and transaction_id = p_transaction_id;
  if not found then return jsonb_build_object('status','rejected','reason','event_not_found'); end if;
  if v_event.status = 'reversed' then
    return jsonb_build_object('status','duplicate','reason','already_reversed');
  end if;
  if v_event.status <> 'accepted' or v_event.user_id is null or v_event.reward_points is null then
    return jsonb_build_object('status','rejected','reason','not_reversible');
  end if;

  -- 打ち消し（負）エントリ。冪等キーで二重取消を防止。
  v_ledger := apply_points(v_event.user_id, -v_event.reward_points, 'postback_reversal',
                           'mission', v_event.mission_id,
                           'reverse:' || v_event.id::text);
  update postback_events set status='reversed', processed_at=now() where id = v_event.id;
  update mission_completions set status='reversed' where ledger_id = v_event.ledger_id;
  insert into fraud_flags(user_id, flag_type, severity, detail)
    values (v_event.user_id, 'postback_reversed', 'high',
            jsonb_build_object('tx', p_transaction_id, 'reason', p_reason, 'reward', v_event.reward_points));

  return jsonb_build_object('status','reversed','user_id',v_event.user_id,'reversal_ledger',v_ledger);
end $$;
revoke all on function public.reverse_postback(text, text, text) from public, anon, authenticated;
