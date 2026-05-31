-- ============================================================
-- MasterGame — 0011 postback RPCs (track_click / confirm_postback)
-- Edge Function `postback` から service_role 経由で呼ばれる、冪等な付与処理。
-- docs/specs/mission-verification-postback.md に対応。
-- ============================================================

-- クリック登録：アプリがオファー遷移前に呼び、click_id を発行（attribution起点）
create or replace function public.track_click(
  p_mission_id uuid, p_device_fp text default null, p_ip inet default null, p_ua text default null
) returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m missions; v_click text; v_win interval;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_m from missions where id = p_mission_id and is_active;
  if not found then raise exception 'mission not found'; end if;

  v_click := encode(gen_random_bytes(16), 'hex');
  select coalesce(attribution_window, interval '24 hours') into v_win
    from ad_partners where id = v_m.partner_id;

  insert into mission_clicks(click_id, user_id, mission_id, partner_id, expires_at, ip, device_fp, user_agent)
    values (v_click, v_uid, p_mission_id, v_m.partner_id, now() + coalesce(v_win, interval '24 hours'),
            p_ip, p_device_fp, p_ua);
  return v_click;
end $$;

-- postback確定：冪等・attribution検証・付与・状態遷移をまとめて実行
-- 署名/IP検証は Edge Function 側で済ませた前提で呼ぶ（service_role）。
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

  -- 冪等性：transaction_id 重複は二重付与しない
  begin
    insert into postback_events(partner_id, transaction_id, click_id, status, raw, received_at)
      values (v_partner.id, p_transaction_id, p_click_id, 'received', p_raw, now())
      returning id into v_event;
  exception when unique_violation then
    return jsonb_build_object('status','duplicate','transaction_id',p_transaction_id);
  end;

  -- attribution：click_id から対象ユーザー/ミッションを特定
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

  -- BAN/凍結ユーザーは付与しない（保留→マーキング相当）
  select state into v_modstate from user_moderation_state where user_id = v_uid;
  if v_modstate in ('banned','frozen') then
    update postback_events set status='rejected', user_id=v_uid, mission_id=v_m.id, processed_at=now() where id=v_event;
    insert into fraud_flags(user_id, flag_type, severity, detail)
      values (v_uid, 'postback_blocked_state', 'medium', jsonb_build_object('state',v_modstate,'tx',p_transaction_id));
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  -- 付与（冪等：clickは1回のみconverted）
  if v_click.is_converted then
    update postback_events set status='duplicate', processed_at=now() where id=v_event;
    return jsonb_build_object('status','duplicate','reason','click_already_converted');
  end if;

  v_reward := coalesce(p_reward_override, v_m.reward_points);
  v_ledger := apply_points(v_uid, v_reward, 'postback', 'mission', v_m.id);
  update mission_clicks set is_converted = true where id = v_click.id;
  update profiles set xp = xp + coalesce(v_m.xp_reward, 0) where id = v_uid;
  insert into mission_completions(user_id, mission_id, status, progress, ledger_id, completed_at)
    values (v_uid, v_m.id, 'confirmed', v_m.max_progress, v_ledger, now());
  update postback_events
    set status='accepted', user_id=v_uid, mission_id=v_m.id,
        reward_points=v_reward, ledger_id=v_ledger, processed_at=now()
    where id=v_event;

  return jsonb_build_object('status','accepted','user_id',v_uid,'reward',v_reward);
end $$;

grant execute on function public.track_click(uuid, text, inet, text) to authenticated;
-- confirm_postback は service_role（Edge Function）からのみ。authenticated には付与しない。
revoke all on function public.confirm_postback(text, text, text, integer, jsonb) from public, authenticated;
