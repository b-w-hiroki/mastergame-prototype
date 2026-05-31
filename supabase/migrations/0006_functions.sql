-- ============================================================
-- MasterGame — 0006 RPC functions (atomic point operations)
-- All wallet/ledger writes flow through these SECURITY DEFINER functions.
-- ============================================================

-- 内部: 確定ポイントを加減算（wallet と ledger を整合的に更新）
create or replace function public.apply_points(
  p_user uuid, p_delta bigint, p_reason text, p_ref_type text default null, p_ref_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_ledger uuid;
begin
  insert into point_ledger(user_id, delta, reason, ref_type, ref_id, status)
    values (p_user, p_delta, p_reason, p_ref_type, p_ref_id, 'confirmed')
    returning id into v_ledger;
  update point_wallets set
    balance         = balance + p_delta,
    lifetime_earned = lifetime_earned + greatest(p_delta, 0),
    lifetime_spent  = lifetime_spent  + greatest(-p_delta, 0),
    updated_at = now()
  where user_id = p_user;
  return v_ledger;
end $$;

-- ミッション達成 → ポイント付与（検証不要のもの）
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
  update profiles set xp = xp + v_m.reward_points where id = v_uid;  -- 活動でXP蓄積

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;

-- ポイント交換申請（残高チェック → 出金 → 申請作成）
create or replace function public.request_exchange(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item exchange_items; v_bal bigint; v_ledger uuid; v_req uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_item from exchange_items where id = p_item_id and is_active;
  if not found then raise exception 'item not found'; end if;
  select balance into v_bal from point_wallets where user_id = v_uid for update;
  if v_bal < v_item.cost_points then raise exception 'insufficient points'; end if;
  if v_item.stock is not null and v_item.stock <= 0 then raise exception 'out of stock'; end if;

  v_ledger := apply_points(v_uid, -v_item.cost_points, 'exchange', 'exchange_item', v_item.id);
  insert into exchange_requests(user_id, item_id, cost_points, status, ledger_id)
    values (v_uid, p_item_id, v_item.cost_points, 'processing', v_ledger) returning id into v_req;
  if v_item.stock is not null then
    update exchange_items set stock = stock - 1 where id = p_item_id;
  end if;
  return jsonb_build_object('ok', true, 'request_id', v_req, 'status', 'processing');
end $$;

-- スマートナッジの対象（最も近い未到達アイテム + 不足分）
create or replace function public.next_nudge_target()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bal bigint; v_item exchange_items;
begin
  if v_uid is null then return null; end if;
  select balance into v_bal from point_wallets where user_id = v_uid;
  select * into v_item from exchange_items
    where is_active and cost_points > v_bal order by cost_points asc limit 1;
  if not found then return jsonb_build_object('all_affordable', true); end if;
  return jsonb_build_object(
    'item_id', v_item.id, 'item_name', v_item.name,
    'gap', v_item.cost_points - v_bal, 'cost', v_item.cost_points);
end $$;

grant execute on function public.claim_mission(uuid)    to authenticated;
grant execute on function public.request_exchange(uuid) to authenticated;
grant execute on function public.next_nudge_target()    to authenticated;
