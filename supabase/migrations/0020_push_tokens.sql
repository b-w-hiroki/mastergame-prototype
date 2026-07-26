-- ============================================================
-- MasterGame — 0020 プッシュ通知トークン
--   - push_tokens: 端末の Expo push token を保持（token を PK に、端末単位で一意）
--   - register_push_token / remove_push_token: ユーザー本人が自端末を登録/解除
-- 実配信は Edge Function `send-push`（service_role）が push_tokens を引いて Expo push API を叩く。
-- ============================================================
create table public.push_tokens (
  token      text primary key,                     -- Expo push token（端末一意）
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null check (platform in ('ios','android','web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_push_tokens_user on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;
create policy "own push tokens" on public.push_tokens for select using (auth.uid() = user_id);

-- 自端末の登録（アプリ起動時）。同じ token が別アカウントで再登録されたら付け替える。
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_token),'') = '' then raise exception 'token required'; end if;
  if p_platform not in ('ios','android','web') then raise exception 'invalid platform'; end if;
  insert into push_tokens(token, user_id, platform)
    values (p_token, v_uid, p_platform)
    on conflict (token) do update set user_id = v_uid, platform = excluded.platform, updated_at = now();
end $$;
revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- 自端末の解除（ログアウト時）
create or replace function public.remove_push_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  delete from push_tokens where token = p_token and user_id = v_uid;
end $$;
revoke all on function public.remove_push_token(text) from public, anon;
grant execute on function public.remove_push_token(text) to authenticated;
