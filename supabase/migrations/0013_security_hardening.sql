-- ============================================================
-- MasterGame — 0013 security hardening
--   1) RPC の EXECUTE 権限を最小化（PUBLIC デフォルト付与の剥奪）
--   2) claim_mission の冪等化（期間キー付き unique）＋期間チェック
--   3) request_exchange の在庫レース解消（アトミック減算 + check 制約）
--   4) apply_points の wallet upsert 化（ledger と残高の乖離防止）
--   5) point_ledger の不変性（UPDATE/DELETE 禁止）
--   6) ビューの security_invoker 化 + 管理ビューの権限剥奪
--   7) confirm_postback の partner status チェック + reward 上限
-- ============================================================

-- ---------- 1) 関数権限の最小化 ----------
-- Postgres は関数作成時に PUBLIC へ EXECUTE を付与する。SECURITY DEFINER の
-- 内部関数 apply_points は PostgREST /rpc/ 経由で誰でも呼べてしまうため剥奪する。
revoke all on function public.apply_points(uuid, bigint, text, text, uuid) from public, anon, authenticated;

-- auth.uid() でガードされている RPC も anon/public からは剥奪しておく
revoke all on function public.claim_mission(uuid)                          from public, anon;
revoke all on function public.request_exchange(uuid)                       from public, anon;
revoke all on function public.next_nudge_target()                          from public, anon;
revoke all on function public.track_click(uuid, text, inet, text)          from public, anon;
revoke all on function public.create_topic(uuid, text, text, text, integer) from public, anon;
revoke all on function public.add_reply(uuid, text)                        from public, anon;
revoke all on function public.toggle_reaction(uuid, text)                  from public, anon;
revoke all on function public.set_best_answer(uuid, uuid)                  from public, anon;

-- ---------- 2) claim_mission の冪等化 ----------
-- daily は日単位、weekly は ISO 週単位、それ以外は 1 回のみ。
alter table public.mission_completions
  add column if not exists period_key text not null default 'once';
-- 既存行は全て default 'once' になるため、claim_mission と同じ規則で created_at から
-- period_key を復元してから dedup する。これをしないと過去の日次/週次達成が
-- (user,mission) ごとに1行へ潰れ、正当な履歴と point_ledger が乖離する。
update public.mission_completions mc set period_key = case m.type
    when 'daily'  then to_char(mc.created_at at time zone 'utc', 'YYYY-MM-DD')
    when 'weekly' then to_char(mc.created_at at time zone 'utc', 'IYYY-"W"IW')
    else 'once'
  end
  from public.missions m
  where m.id = mc.mission_id and mc.period_key = 'once';
-- 同一 period 内の真の重複（連打バグ由来）のみ、最初の1件を残して整理する
delete from public.mission_completions mc using public.mission_completions dup
  where mc.user_id = dup.user_id and mc.mission_id = dup.mission_id
    and mc.period_key = dup.period_key and mc.created_at > dup.created_at;
create unique index if not exists uq_completions_user_mission_period
  on public.mission_completions(user_id, mission_id, period_key);

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

  -- 先に completion を挿入して unique 制約で二重取得をブロック（付与はその後）
  insert into mission_completions(user_id, mission_id, status, progress, period_key)
    values (v_uid, p_mission_id, 'confirmed', v_m.max_progress, v_period)
    on conflict (user_id, mission_id, period_key) do nothing
    returning id into v_completion;
  if v_completion is null then raise exception 'mission already claimed'; end if;

  v_ledger := apply_points(v_uid, v_m.reward_points, 'mission', 'mission', v_m.id);
  update mission_completions set ledger_id = v_ledger, completed_at = now() where id = v_completion;
  update profiles set xp = xp + v_m.xp_reward where id = v_uid;  -- XPはポイントと独立

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;
revoke all on function public.claim_mission(uuid) from public, anon;
grant execute on function public.claim_mission(uuid) to authenticated;

-- ---------- 3) 交換の在庫レース解消 ----------
alter table public.exchange_items
  add constraint exchange_items_stock_nonneg check (stock is null or stock >= 0);

create or replace function public.request_exchange(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item exchange_items; v_bal bigint; v_ledger uuid; v_req uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_item from exchange_items where id = p_item_id and is_active;
  if not found then raise exception 'item not found'; end if;
  select balance into v_bal from point_wallets where user_id = v_uid for update;
  if v_bal is null or v_bal < v_item.cost_points then raise exception 'insufficient points'; end if;

  -- 在庫はガード付き UPDATE でアトミックに確保（並行申請の oversell を防ぐ）
  if v_item.stock is not null then
    update exchange_items set stock = stock - 1 where id = p_item_id and stock > 0;
    if not found then raise exception 'out of stock'; end if;
  end if;

  v_ledger := apply_points(v_uid, -v_item.cost_points, 'exchange', 'exchange_item', v_item.id);
  insert into exchange_requests(user_id, item_id, cost_points, status, ledger_id)
    values (v_uid, p_item_id, v_item.cost_points, 'processing', v_ledger) returning id into v_req;
  return jsonb_build_object('ok', true, 'request_id', v_req, 'status', 'processing');
end $$;
revoke all on function public.request_exchange(uuid) from public, anon;
grant execute on function public.request_exchange(uuid) to authenticated;

-- ---------- 4) apply_points: wallet 行欠損時に ledger と乖離しないよう upsert ----------
create or replace function public.apply_points(
  p_user uuid, p_delta bigint, p_reason text, p_ref_type text default null, p_ref_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_ledger uuid;
begin
  insert into point_ledger(user_id, delta, reason, ref_type, ref_id, status)
    values (p_user, p_delta, p_reason, p_ref_type, p_ref_id, 'confirmed')
    returning id into v_ledger;
  -- wallet 行を確実に用意してから UPDATE する（欠損時の ledger/残高乖離を防ぐ）。
  -- upsert に delta を直接入れると balance>=0 の CHECK が conflict 前に評価され
  -- 消費(負delta)で誤って失敗するため、ensure→update の2段構えにする。
  insert into point_wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  update point_wallets set
    balance         = balance + p_delta,
    lifetime_earned = lifetime_earned + greatest(p_delta, 0),
    lifetime_spent  = lifetime_spent  + greatest(-p_delta, 0),
    updated_at = now()
  where user_id = p_user;
  return v_ledger;
end $$;
revoke all on function public.apply_points(uuid, bigint, text, text, uuid) from public, anon, authenticated;

-- ---------- 5) point_ledger は append-only（truth を書き換えさせない） ----------
-- 訂正は打ち消しエントリ（reversal）を追加する。UPDATE/DELETE は禁止。
create or replace function public.tg_ledger_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'point_ledger is append-only; insert a reversal entry instead';
end $$;
drop trigger if exists ledger_immutable on public.point_ledger;
create trigger ledger_immutable
  before update or delete on public.point_ledger
  for each row execute function public.tg_ledger_immutable();

-- ---------- 6) ビュー: 所有者権限での RLS バイパスを止める ----------
-- ビューはデフォルトで owner 権限で実行され基表の RLS を素通しする。
alter view public.user_vip                    set (security_invoker = on);
alter view public.admin_overview              set (security_invoker = on);
alter view public.admin_user_rows             set (security_invoker = on);
alter view public.recommended_action_pricing  set (security_invoker = on);
-- 管理ビューはクライアントロールから参照不可に（service_role 専用）
revoke all on public.admin_overview  from public, anon, authenticated;
revoke all on public.admin_user_rows from public, anon, authenticated;

-- ---------- 7) confirm_postback: partner 状態チェック + reward 上限 ----------
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

  -- reward_override はミッション設定額を上限とする（改竄・過大請求を防ぐ）
  v_reward := v_m.reward_points;
  if p_reward_override is not null and p_reward_override > 0 and p_reward_override <= v_m.reward_points then
    v_reward := p_reward_override;
  end if;

  v_ledger := apply_points(v_uid, v_reward, 'postback', 'mission', v_m.id);
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
