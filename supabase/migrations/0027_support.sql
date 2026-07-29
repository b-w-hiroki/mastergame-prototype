-- ============================================================
-- 0027: 問い合わせ・カスタマーサポート
--
-- 0024 のプライバシーポリシーには「お問い合わせ窓口」を明記したのに、
-- アプリからの導線も運営側の受け皿も存在しなかった。
--
-- ポイ活の CS は **「ポイントが反映されない」が大半**を占める。この種の
-- 問い合わせは、運営が該当ユーザーの台帳・postback・オファー確定状況を
-- 見られれば即答できる。逆にそれが無いと、1件ごとに DB を手で漁ることになり
-- 運用が破綻する。そこで:
--
--   1) inquiries / inquiry_messages … 問い合わせとやり取り（スレッド形式）
--   2) create_inquiry / reply_to_inquiry / my_inquiries … ユーザー側 RPC
--   3) admin_inquiry_rows            … 運営の一覧
--   4) support_user_context          … **問い合わせ対応に必要な情報を1発で引く**
--      （残高・直近の獲得履歴・保留中の postback / オファー・不正フラグ・退会状況）
-- ============================================================

-- ---------- 1) 問い合わせ ----------
create table if not exists public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in
                ('points','exchange','account','bug','other')),
  subject     text not null check (char_length(subject) between 1 and 120),
  status      text not null default 'open' check (status in ('open','answered','resolved','closed')),
  -- 運営が見た時点。未読件数の算出に使う
  last_message_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_inquiries_user   on public.inquiries(user_id, created_at desc);
create index if not exists idx_inquiries_status on public.inquiries(status, last_message_at desc);

create table if not exists public.inquiry_messages (
  id          uuid primary key default gen_random_uuid(),
  inquiry_id  uuid not null references public.inquiries(id) on delete cascade,
  -- 運営の返信は author_id が null（個々の担当者を露出させない）
  author_id   uuid references auth.users(id) on delete set null,
  is_staff    boolean not null default false,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index if not exists idx_inquiry_messages on public.inquiry_messages(inquiry_id, created_at);

alter table public.inquiries         enable row level security;
alter table public.inquiry_messages  enable row level security;

drop policy if exists inq_self_read on public.inquiries;
create policy inq_self_read on public.inquiries
  for select using (auth.uid() = user_id);

drop policy if exists inqmsg_self_read on public.inquiry_messages;
create policy inqmsg_self_read on public.inquiry_messages
  for select using (
    exists (select 1 from public.inquiries i
             where i.id = inquiry_messages.inquiry_id and i.user_id = auth.uid())
  );
-- 書き込みは RPC 経由のみ（is_staff を偽装させない）
grant select on public.inquiries, public.inquiry_messages to authenticated;

-- ---------- 2) ユーザー側 RPC ----------
-- 連投対策の上限（1日あたり）
insert into public.app_config (key, value) values
  ('inquiry_daily_cap', '5'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.create_inquiry(
  p_category text, p_subject text, p_body text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_today int; v_cap int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_category not in ('points','exchange','account','bug','other') then
    raise exception 'invalid category';
  end if;
  if p_subject is null or btrim(p_subject) = '' then raise exception 'subject required'; end if;
  if p_body    is null or btrim(p_body)    = '' then raise exception 'body required'; end if;

  v_cap := legal_config('inquiry_daily_cap', 5)::int;
  select count(*) into v_today from inquiries
   where user_id = v_uid and created_at > now() - interval '1 day';
  if v_today >= v_cap then
    return jsonb_build_object('status','rejected','reason','daily_cap');
  end if;

  insert into inquiries(user_id, category, subject)
    values (v_uid, p_category, left(btrim(p_subject), 120))
    returning id into v_id;

  insert into inquiry_messages(inquiry_id, author_id, is_staff, body)
    values (v_id, v_uid, false, left(btrim(p_body), 4000));

  return jsonb_build_object('status','ok','inquiry_id', v_id);
end $$;
revoke all on function public.create_inquiry(text, text, text) from public, anon;
grant execute on function public.create_inquiry(text, text, text) to authenticated;

create or replace function public.reply_to_inquiry(p_inquiry_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_inq inquiries;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_body is null or btrim(p_body) = '' then raise exception 'body required'; end if;

  select * into v_inq from inquiries where id = p_inquiry_id;
  if not found or v_inq.user_id <> v_uid then
    return jsonb_build_object('status','rejected','reason','not_found');
  end if;
  if v_inq.status = 'closed' then
    return jsonb_build_object('status','rejected','reason','closed');
  end if;

  insert into inquiry_messages(inquiry_id, author_id, is_staff, body)
    values (p_inquiry_id, v_uid, false, left(btrim(p_body), 4000));

  -- ユーザーが返信したら「対応中」に戻す（回答済みのまま埋もれさせない）
  update inquiries set status = 'open', last_message_at = now() where id = p_inquiry_id;
  return jsonb_build_object('status','ok');
end $$;
revoke all on function public.reply_to_inquiry(uuid, text) from public, anon;
grant execute on function public.reply_to_inquiry(uuid, text) to authenticated;

-- ---------- 3) 運営側 ----------
create or replace view public.admin_inquiry_rows
with (security_invoker = on) as
select
  i.id, i.user_id, i.category, i.subject, i.status,
  i.created_at, i.last_message_at, i.resolved_at,
  p.handle, p.username,
  coalesce(w.balance, 0) as balance,
  (select count(*) from inquiry_messages m where m.inquiry_id = i.id) as message_count,
  (select m.body from inquiry_messages m where m.inquiry_id = i.id
    order by m.created_at desc limit 1) as last_message,
  (select m.is_staff from inquiry_messages m where m.inquiry_id = i.id
    order by m.created_at desc limit 1) as last_from_staff
from public.inquiries i
left join public.profiles p      on p.id = i.user_id
left join public.point_wallets w on w.user_id = i.user_id;
revoke all on public.admin_inquiry_rows from public, anon, authenticated;

create or replace function public.answer_inquiry(
  p_inquiry_id uuid, p_body text, p_resolve boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_inq inquiries;
begin
  if p_body is null or btrim(p_body) = '' then raise exception 'body required'; end if;
  select * into v_inq from inquiries where id = p_inquiry_id;
  if not found then raise exception 'inquiry not found'; end if;

  -- 運営の返信は author_id を残さない（担当者個人を露出させない）
  insert into inquiry_messages(inquiry_id, author_id, is_staff, body)
    values (p_inquiry_id, null, true, left(btrim(p_body), 4000));

  update inquiries
     set status = case when p_resolve then 'resolved' else 'answered' end,
         last_message_at = now(),
         resolved_at = case when p_resolve then now() else resolved_at end
   where id = p_inquiry_id;

  -- ユーザーに通知（アプリ内通知。プッシュは send-push から別途）
  insert into notifications(user_id, type, payload)
    values (v_inq.user_id, 'inquiry_answered',
            jsonb_build_object('inquiry_id', p_inquiry_id, 'subject', v_inq.subject));

  return jsonb_build_object('status','ok','resolved', p_resolve);
end $$;
revoke all on function public.answer_inquiry(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.close_inquiry(p_inquiry_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update inquiries set status = 'closed', resolved_at = coalesce(resolved_at, now())
   where id = p_inquiry_id;
  if not found then raise exception 'inquiry not found'; end if;
  return jsonb_build_object('status','ok');
end $$;
revoke all on function public.close_inquiry(uuid) from public, anon, authenticated;

-- ---------- 4) 対応に必要な情報を1発で引く ----------
-- 「ポイントが反映されない」への回答に必要な材料をまとめて返す。
-- これが無いと1件ごとに DB を手で漁ることになり、CS が運用として破綻する。
create or replace function public.support_user_context(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'user_id', p_user,
    'handle',  (select handle from profiles where id = p_user),
    'balance', coalesce((select balance from point_wallets where user_id = p_user), 0),
    'lifetime_earned', coalesce((select lifetime_earned from point_wallets where user_id = p_user), 0),
    'moderation_state', coalesce((select state from user_moderation_state where user_id = p_user), 'active'),
    'deletion_status',  (select status from account_deletions where user_id = p_user),
    -- 直近の増減。「いつ何が入ったか」を見せる
    'recent_ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
        'delta', l.delta, 'reason', l.reason, 'status', l.status, 'at', l.created_at)
        order by l.created_at desc)
      from (select * from point_ledger where user_id = p_user
             order by created_at desc limit 20) l), '[]'::jsonb),
    -- 未確定のオファー（「反映されない」の最頻の原因）
    'pending_offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'network_txn_id', o.network_txn_id, 'status', o.status,
        'reward', o.reward_points, 'at', o.created_at))
      from offer_completions o
      where o.user_id = p_user and o.status <> 'confirmed'), '[]'::jsonb),
    -- 却下された postback（理由がここに出る）
    -- 並び順は jsonb_agg の内側で指定する（外側の ORDER BY は集約と併用できない）
    'rejected_postbacks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'transaction_id', e.transaction_id, 'status', e.status, 'at', e.received_at)
        order by e.received_at desc)
      from postback_events e
      where e.user_id = p_user and e.status in ('rejected','duplicate')), '[]'::jsonb),
    -- 未解決の不正フラグ（付与が止まっている理由になりうる）
    'open_fraud_flags', coalesce((
      select jsonb_agg(jsonb_build_object('type', f.flag_type, 'severity', f.severity, 'at', f.created_at))
      from fraud_flags f where f.user_id = p_user and f.resolved_at is null), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;
revoke all on function public.support_user_context(uuid) from public, anon, authenticated;
