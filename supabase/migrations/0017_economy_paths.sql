-- ============================================================
-- MasterGame — 0017 経済パスの実装（スキーマのみ存在→動作させる）
--   1) accrue_staking(period): 月次の保有ボーナスを付与（冪等）
--   2) fulfill_exchange / cancel_exchange: 交換申請の確定・取消（返金＋在庫戻し）
--   3) confirm_offer: オファーウォール達成の確定（冪等＋日次レート制限）
--   4) mark_notification_read: 通知の既読化
--   5) next_nudge_target: ナッジ表示ログ（nudge_events）を記録
-- すべて apply_points(0015 の冪等キー対応版) を単一の付与口として使う。
-- ============================================================

-- 日次オファー上限（app_config。既定 20）
insert into public.app_config (key, value) values ('daily_offer_cap', '20'::jsonb)
  on conflict (key) do nothing;

-- ---------- 1) staking accrual（月次保有ボーナス） ----------
-- 対象月(period=月初日)の残高に VIP 月利を掛けて付与する。(user,period) で冪等。
-- pg_cron 等から `select accrue_staking(date_trunc('month', now())::date);` を月次実行する想定。
create or replace function public.accrue_staking(p_period date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row record; v_rate integer; v_accrued integer; v_ledger uuid; v_count integer := 0;
begin
  for v_row in
    select w.user_id, w.balance, p.xp
    from point_wallets w join profiles p on p.id = w.user_id
    where w.balance > 0
  loop
    -- 既に当月付与済みならスキップ（冪等）
    if exists (select 1 from staking_accruals where user_id = v_row.user_id and period = p_period) then
      continue;
    end if;
    select coalesce(
      (select staking_rate_bps from vip_tiers t where t.min_xp <= v_row.xp order by t.min_xp desc limit 1), 0)
      into v_rate;
    v_accrued := floor(v_row.balance::numeric * v_rate / 10000)::integer;
    if v_accrued <= 0 then continue; end if;

    v_ledger := apply_points(v_row.user_id, v_accrued, 'staking', 'staking', null,
                             'staking:' || v_row.user_id::text || ':' || p_period::text);
    insert into staking_accruals(user_id, period, base_balance, rate_bps, accrued_points, ledger_id)
      values (v_row.user_id, p_period, v_row.balance, v_rate, v_accrued, v_ledger)
      on conflict (user_id, period) do nothing;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'period', p_period, 'accrued_users', v_count);
end $$;
revoke all on function public.accrue_staking(date) from public, anon, authenticated;

-- ---------- 2) exchange fulfillment / cancel ----------
-- 交換申請を確定（コード付与）。processing のときのみ遷移。運営/自動フルフィルから呼ぶ。
create or replace function public.fulfill_exchange(p_request_id uuid, p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req exchange_requests;
begin
  update exchange_requests
    set status = 'fulfilled', code = p_code, fulfilled_at = now()
    where id = p_request_id and status = 'processing'
    returning * into v_req;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_processing'); end if;
  if v_req.user_id is not null then
    insert into notifications(user_id, type, payload)
      values (v_req.user_id, 'exchange_fulfilled',
        jsonb_build_object('request_id', p_request_id, 'has_code', p_code is not null));
  end if;
  return jsonb_build_object('ok', true, 'request_id', p_request_id, 'status', 'fulfilled');
end $$;
revoke all on function public.fulfill_exchange(uuid, text) from public, anon, authenticated;

-- 交換申請を取消。ポイントを返金し、在庫を戻す。processing のときのみ。
create or replace function public.cancel_exchange(p_request_id uuid, p_reason text default 'admin_cancel')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req exchange_requests; v_item exchange_items;
begin
  update exchange_requests set status = 'cancelled'
    where id = p_request_id and status = 'processing'
    returning * into v_req;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_processing'); end if;

  -- 返金（冪等キーで二重返金を防止）
  perform apply_points(v_req.user_id, v_req.cost_points, 'exchange_refund', 'exchange_request', v_req.id,
                       'exchange_refund:' || v_req.id::text);
  -- 在庫を戻す（有限在庫のみ）
  select * into v_item from exchange_items where id = v_req.item_id;
  if found and v_item.stock is not null then
    update exchange_items set stock = stock + 1 where id = v_req.item_id;
  end if;
  insert into notifications(user_id, type, payload)
    values (v_req.user_id, 'exchange_cancelled',
      jsonb_build_object('request_id', p_request_id, 'refunded', v_req.cost_points, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'request_id', p_request_id, 'refunded', v_req.cost_points);
end $$;
revoke all on function public.cancel_exchange(uuid, text) from public, anon, authenticated;

-- ---------- 3) offerwall 達成の確定 ----------
-- 署名/IP 検証は Edge Function 側（offer-postback）で済ませた前提で service_role から呼ぶ。
-- 冪等: unique(network_id, network_txn_id)。日次上限: user_daily_offer_counts。
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

  -- BAN/凍結ユーザーは付与しない
  select state into v_modstate from user_moderation_state where user_id = p_user;
  if v_modstate in ('banned','frozen') then
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  -- 冪等: 既に受信済みの txn は（レート上限より先に）duplicate を返す
  if exists (select 1 from offer_completions where network_id = v_net.id and network_txn_id = p_network_txn_id) then
    return jsonb_build_object('status','duplicate','network_txn_id',p_network_txn_id);
  end if;

  -- 報酬額はオファー設定を上限に採用（無ければ override / それも無ければ拒否）
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

  -- 日次上限チェック（offerwall）
  select coalesce((value #>> '{}')::int, 20) into v_cap from app_config where key = 'daily_offer_cap';
  select coalesce(count, 0) into v_used from user_daily_offer_counts
    where user_id = p_user and day = current_date and ad_type = 'offerwall';
  if v_cap is not null and v_used >= v_cap then
    return jsonb_build_object('status','rejected','reason','daily_cap_reached');
  end if;

  -- 冪等付与：offer_completions の unique が二重を弾く
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

  -- 日次カウンタを加算
  insert into user_daily_offer_counts(user_id, day, ad_type, count)
    values (p_user, current_date, 'offerwall', 1)
    on conflict (user_id, day, ad_type) do update set count = user_daily_offer_counts.count + 1;

  return jsonb_build_object('status','accepted','user_id',p_user,'reward',v_reward);
end $$;
revoke all on function public.confirm_offer(text, text, uuid, text, integer) from public, anon, authenticated;

-- ---------- 4) 通知の既読化 ----------
create or replace function public.mark_notification_read(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  update notifications set read_at = now()
    where id = p_id and user_id = v_uid and read_at is null;
  return jsonb_build_object('ok', found);
end $$;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- ---------- 5) next_nudge_target に表示ログ ----------
-- ギャップ対象を返すときに nudge_events を記録（表示→交換ファネル計測）。
-- 表示スパムを避けるため、同種ナッジは 1 時間クールダウン。
create or replace function public.next_nudge_target()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bal bigint; v_item exchange_items; v_last timestamptz;
begin
  if v_uid is null then return null; end if;
  select balance into v_bal from point_wallets where user_id = v_uid;
  select * into v_item from exchange_items
    where is_active and cost_points > coalesce(v_bal,0) order by cost_points asc limit 1;
  if not found then return jsonb_build_object('all_affordable', true); end if;

  -- クールダウン内でなければ表示ログを記録
  select last_shown_at into v_last from nudge_cooldowns
    where user_id = v_uid and nudge_type = 'home_banner';
  if v_last is null or v_last < now() - interval '1 hour' then
    insert into nudge_events(user_id, nudge_type, target_item_id, gap_points, variant)
      values (v_uid, 'home_banner', v_item.id, (v_item.cost_points - coalesce(v_bal,0))::int, 'A');
    insert into nudge_cooldowns(user_id, nudge_type, last_shown_at, count_today, day)
      values (v_uid, 'home_banner', now(), 1, current_date)
      on conflict (user_id, nudge_type) do update set
        last_shown_at = now(),
        count_today = case when nudge_cooldowns.day = current_date then nudge_cooldowns.count_today + 1 else 1 end,
        day = current_date;
  end if;

  return jsonb_build_object(
    'item_id', v_item.id, 'item_name', v_item.name,
    'gap', v_item.cost_points - coalesce(v_bal,0), 'cost', v_item.cost_points);
end $$;
revoke all on function public.next_nudge_target() from public, anon;
grant execute on function public.next_nudge_target() to authenticated;
