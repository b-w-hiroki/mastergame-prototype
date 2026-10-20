-- Admin authorization and atomic exchange-request processing.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('admin', 'superuser')
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.process_exchange_request(
  p_request_id uuid,
  p_action text,
  p_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request exchange_requests;
  v_item exchange_items;
  v_refund_ledger uuid;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'admin required';
  end if;
  if p_action not in ('fulfilled', 'cancelled') then
    raise exception 'invalid action';
  end if;

  select * into v_request
  from exchange_requests
  where id = p_request_id
  for update;

  if not found then raise exception 'exchange request not found'; end if;
  if v_request.status <> 'processing' then
    return jsonb_build_object('ok', true, 'status', v_request.status, 'idempotent', true);
  end if;

  if p_action = 'fulfilled' then
    update exchange_requests
    set status = 'fulfilled', code = nullif(trim(p_code), ''), fulfilled_at = now()
    where id = p_request_id;
  else
    v_refund_ledger := apply_points(
      v_request.user_id,
      v_request.cost_points,
      'exchange_refund',
      'exchange_item',
      v_request.item_id
    );

    select * into v_item from exchange_items where id = v_request.item_id for update;
    if v_item.stock is not null then
      update exchange_items set stock = stock + 1 where id = v_request.item_id;
    end if;

    update exchange_requests
    set status = 'cancelled', fulfilled_at = now()
    where id = p_request_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'status', p_action,
    'refund_ledger_id', v_refund_ledger
  );
end;
$$;

revoke all on function public.process_exchange_request(uuid, text, text) from public;
grant execute on function public.process_exchange_request(uuid, text, text) to authenticated, service_role;
