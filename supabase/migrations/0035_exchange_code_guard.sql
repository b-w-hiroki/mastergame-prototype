-- コード配布を空コードで確定させない。管理画面以外からの service_role 呼出しにも適用する。
create or replace function public.fulfill_exchange(p_request_id uuid, p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_req exchange_requests;
  v_method text;
  v_code text := nullif(btrim(p_code, E' \t\n\r\f'), '');
begin
  -- 同じ申請への並行した確定/取消を直列化する。
  select * into v_req from exchange_requests
    where id = p_request_id and status = 'processing' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_processing'); end if;

  select delivery_method into v_method from exchange_items where id = v_req.item_id;
  if v_method is null then
    return jsonb_build_object('ok', false, 'reason', 'item_not_found');
  end if;
  if v_method = 'code' and v_code is null then
    return jsonb_build_object('ok', false, 'reason', 'code_required');
  end if;
  if length(v_code) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'code_too_long');
  end if;

  update exchange_requests
    set status = 'fulfilled', code = v_code, fulfilled_at = now()
    where id = p_request_id and status = 'processing';
  insert into notifications(user_id, type, payload)
    values (v_req.user_id, 'exchange_fulfilled',
      jsonb_build_object('request_id', p_request_id, 'has_code', v_code is not null));
  return jsonb_build_object('ok', true, 'request_id', p_request_id, 'status', 'fulfilled');
end $$;
revoke all on function public.fulfill_exchange(uuid, text) from public, anon, authenticated;
