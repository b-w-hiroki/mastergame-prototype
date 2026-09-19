-- Supabase installs pgcrypto in the extensions schema. The function uses a
-- restricted search_path, so qualify gen_random_bytes explicitly.
create or replace function public.track_click(
  p_mission_id uuid, p_device_fp text default null, p_ip inet default null, p_ua text default null
) returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m missions; v_click text; v_win interval;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_m from missions where id = p_mission_id and is_active;
  if not found then raise exception 'mission not found'; end if;

  v_click := encode(extensions.gen_random_bytes(16), 'hex');
  select coalesce(attribution_window, interval '24 hours') into v_win
    from ad_partners where id = v_m.partner_id;

  insert into mission_clicks(click_id, user_id, mission_id, partner_id, expires_at, ip, device_fp, user_agent)
    values (v_click, v_uid, p_mission_id, v_m.partner_id, now() + coalesce(v_win, interval '24 hours'),
            p_ip, p_device_fp, p_ua);
  return v_click;
end $$;

grant execute on function public.track_click(uuid, text, inet, text) to authenticated;
