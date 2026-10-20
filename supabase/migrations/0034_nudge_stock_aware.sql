-- Do not nudge users toward sold-out rewards, and distinguish that from
-- the case where every currently available reward is affordable.
create or replace function public.next_nudge_target()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bal bigint; v_item exchange_items; v_last timestamptz;
begin
  if v_uid is null then return null; end if;
  select balance into v_bal from point_wallets where user_id = v_uid;
  select * into v_item from exchange_items
    where is_active and (stock is null or stock > 0)
      and cost_points > coalesce(v_bal,0)
    order by cost_points asc limit 1;
  if not found then
    if exists (select 1 from exchange_items where is_active and (stock is null or stock > 0)) then
      return jsonb_build_object('all_affordable', true);
    end if;
    return jsonb_build_object('none_available', true);
  end if;

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
