-- ============================================================
-- MasterGame — 0003 offerwall & rewarded video
-- Reflects docs/specs/offerwall.md
-- ============================================================

create table public.ad_networks (
  id        uuid primary key default gen_random_uuid(),
  code      text unique not null,                       -- tapjoy / applovin / ironsource / pollfish
  name      text not null,
  enabled   boolean not null default true,
  priority  integer not null default 100,               -- メディエーション優先度
  config    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  network_id    uuid not null references public.ad_networks(id),
  external_id   text not null,                           -- ネットワーク側オファーID
  title         text not null,
  description   text,
  icon_url      text,
  reward_points integer not null check (reward_points > 0),
  event_type    text,                                    -- install / signup / purchase / survey
  countries     text[],                                  -- 配信地域
  min_os        text,
  status        text not null default 'active' check (status in ('active','paused','expired')),
  created_at    timestamptz not null default now(),
  unique (network_id, external_id)
);

create table public.offer_completions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  offer_id       uuid references public.offers(id),
  network_id     uuid not null references public.ad_networks(id),
  network_txn_id text not null,                          -- 冪等キー
  status         text not null default 'pending'
                 check (status in ('pending','confirmed','rejected','reversed')),
  reward_points  integer not null,
  ledger_id      uuid references public.point_ledger(id),
  created_at     timestamptz not null default now(),
  confirmed_at   timestamptz,
  unique (network_id, network_txn_id)                    -- べき等性
);
create index idx_offercomp_user on public.offer_completions(user_id, created_at desc);

create table public.ad_impressions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  placement  text not null,                              -- home / mission / offerwall_main ...
  network_id uuid references public.ad_networks(id),
  ad_type    text not null check (ad_type in ('rewarded_video','offerwall','banner')),
  reward_points integer not null default 0,
  created_at timestamptz not null default now()
);

-- 1日あたりの動画/オファー回数制限
create table public.user_daily_offer_counts (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  ad_type text not null,
  count   integer not null default 0,
  primary key (user_id, day, ad_type)
);

-- ---------- RLS ----------
alter table public.ad_networks             enable row level security;
alter table public.offers                  enable row level security;
alter table public.offer_completions       enable row level security;
alter table public.ad_impressions          enable row level security;
alter table public.user_daily_offer_counts enable row level security;

create policy "offers read" on public.offers for select using (status = 'active');
create policy "own offercomp" on public.offer_completions for select using (auth.uid() = user_id);
create policy "own impressions" on public.ad_impressions for select using (auth.uid() = user_id);
create policy "own offercounts" on public.user_daily_offer_counts for select using (auth.uid() = user_id);
