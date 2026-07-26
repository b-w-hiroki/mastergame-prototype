-- ============================================================
-- MasterGame — 0019 オファーウォールのアプリ内導線
--   - offers.offer_url: 遷移先（ネットワーク/ストアの URL）
--   - record_ad_impression: クリック計測（ad_impressions への唯一の書き込み口）
--     日次上限（app_config.daily_offer_cap）に達している場合は false を返す。
-- ============================================================
alter table public.offers add column if not exists offer_url text;

-- クリック/表示の記録。SECURITY DEFINER（ad_impressions は insert ポリシー無し）。
-- 付与はしない（付与は confirm_offer 経由）。ここは計測とプレフライトのみ。
create or replace function public.record_ad_impression(
  p_placement text, p_ad_type text, p_network_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cap integer; v_used integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_ad_type not in ('rewarded_video','offerwall','banner') then raise exception 'invalid ad_type'; end if;

  insert into ad_impressions(user_id, placement, network_id, ad_type)
    values (v_uid, p_placement, p_network_id, p_ad_type);

  -- offerwall/動画は日次上限を返す（クライアントが遷移前に「本日はここまで」を出せるように）
  if p_ad_type in ('offerwall','rewarded_video') then
    -- 行が無いときも 0 になるようスカラー副問い合わせで coalesce する（SELECT INTO の NULL 罠回避）
    v_cap  := coalesce((select (value #>> '{}')::int from app_config where key = 'daily_offer_cap'), 20);
    v_used := coalesce((select count from user_daily_offer_counts
                        where user_id = v_uid and day = current_date and ad_type = 'offerwall'), 0);
    return jsonb_build_object('ok', true, 'cap', v_cap, 'used', v_used, 'remaining', greatest(0, v_cap - v_used));
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.record_ad_impression(text, text, uuid) from public, anon;
grant execute on function public.record_ad_impression(text, text, uuid) to authenticated;

-- confirm_offer の日次上限読取も同じ NULL 罠を避けるよう堅牢化（0017 の置換）。
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
  if v_modstate in ('banned','frozen') then
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
