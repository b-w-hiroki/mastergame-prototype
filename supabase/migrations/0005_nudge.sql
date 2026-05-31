-- ============================================================
-- MasterGame — 0005 smart nudge
-- Reflects docs/specs/smart-nudge.md
-- ============================================================

-- ナッジ表示ログ（計測：表示→クリック→交換のファネル）
create table public.nudge_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nudge_type    text not null,                           -- home_banner / exchange_card / post_claim / push
  target_item_id uuid references public.exchange_items(id),
  gap_points    integer,                                 -- 「あと◯P」
  recommended_mission_id uuid references public.missions(id),
  shown_at      timestamptz not null default now(),
  clicked       boolean not null default false,
  converted     boolean not null default false,          -- 後続で交換に至ったか
  variant       text                                     -- A/Bテスト枠
);
create index idx_nudge_user on public.nudge_events(user_id, shown_at desc);

-- 表示頻度のクールダウン
create table public.nudge_cooldowns (
  user_id       uuid not null references auth.users(id) on delete cascade,
  nudge_type    text not null,
  last_shown_at timestamptz not null default now(),
  count_today   integer not null default 0,
  day           date not null default current_date,
  primary key (user_id, nudge_type)
);

alter table public.nudge_events    enable row level security;
alter table public.nudge_cooldowns enable row level security;
create policy "own nudge events" on public.nudge_events for select using (auth.uid() = user_id);
create policy "own cooldowns"    on public.nudge_cooldowns for select using (auth.uid() = user_id);
