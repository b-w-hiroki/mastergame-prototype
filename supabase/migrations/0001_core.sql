-- ============================================================
-- MasterGame — 0001 core (profiles / games / points / missions / exchange / VIP)
-- Reflects docs/specs/* table definitions. Append-only ledger is the source of truth.
-- ============================================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------- profiles (1:1 auth.users) ----------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text,
  handle       text unique,
  avatar_url   text,
  bio          text,
  xp           integer not null default 0,            -- VIP経験値
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- games & genre preferences ----------
create table public.games (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  name       text not null,
  genre      text not null check (genre in
              ('rpg','action','puzzle','shooter','strategy','sports','sim','casual')),
  icon_url   text,
  partner_id uuid,                                     -- → ad_partners (0002)
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- 好きなジャンル（オンボーディングで選択）
create table public.user_genres (
  user_id    uuid not null references auth.users(id) on delete cascade,
  genre      text not null check (genre in
              ('rpg','action','puzzle','shooter','strategy','sports','sim','casual')),
  created_at timestamptz not null default now(),
  primary key (user_id, genre)
);

-- ---------- points: wallet (cache) + ledger (truth) ----------
create table public.point_wallets (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  balance         bigint not null default 0 check (balance >= 0),
  lifetime_earned bigint not null default 0,
  lifetime_spent  bigint not null default 0,
  updated_at      timestamptz not null default now()
);

create table public.point_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      bigint not null,                          -- +獲得 / -消費
  reason     text not null,                            -- mission/offer/exchange/staking/bounty...
  ref_type   text,
  ref_id     uuid,
  status     text not null default 'confirmed'
             check (status in ('pending','confirmed','rejected','reversed')),
  created_at timestamptz not null default now()
);
create index idx_ledger_user on public.point_ledger(user_id, created_at desc);

-- ---------- missions ----------
create table public.missions (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('daily','weekly','achievement','event','offer')),
  title        text not null,
  description  text,
  reward_points integer not null check (reward_points > 0),
  icon         text,
  max_progress integer not null default 1,
  partner_id   uuid,                                   -- → ad_partners
  event_type   text,                                   -- install / purchase / level_reach ...
  requires_verification boolean not null default false,-- true = postback確定後に付与 (0002)
  starts_at    timestamptz,
  ends_at      timestamptz,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.mission_completions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  mission_id  uuid not null references public.missions(id) on delete cascade,
  status      text not null default 'confirmed'
              check (status in ('pending','confirmed','rejected','reversed')),
  progress    integer not null default 0,
  ledger_id   uuid references public.point_ledger(id),
  completed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_completions_user on public.mission_completions(user_id, created_at desc);

-- ---------- exchange ----------
create table public.exchange_items (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid references public.games(id),
  name            text not null,
  description     text,
  image_url       text,
  cost_points     integer not null check (cost_points > 0),
  delivery_method text not null default 'code' check (delivery_method in ('csv','code','api')),
  stock           integer,                             -- NULL = 無制限
  is_active       boolean not null default true,
  sort            integer not null default 0,
  created_at      timestamptz not null default now()
);

-- exchange_history（交換申請）
create table public.exchange_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_id      uuid not null references public.exchange_items(id),
  cost_points  integer not null,
  status       text not null default 'processing'
               check (status in ('processing','fulfilled','cancelled')),
  code         text,                                   -- コード式の付与コード
  ledger_id    uuid references public.point_ledger(id),
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz
);
create index idx_exchange_user on public.exchange_requests(user_id, requested_at desc);

-- ---------- VIP rank + staking ----------
create table public.vip_tiers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  min_xp            integer not null,
  staking_rate_bps  integer not null,                  -- 月利(basis points): 100 = 1.0%
  point_boost_bps   integer not null default 0,        -- ポイント獲得ブースト
  sort              integer not null,
  unique (sort)
);

-- ステーキング（保有ボーナス）の月次付与記録
create table public.staking_accruals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  period        date not null,                         -- 対象月(初日)
  base_balance  bigint not null,
  rate_bps      integer not null,
  accrued_points integer not null,
  ledger_id     uuid references public.point_ledger(id),
  created_at    timestamptz not null default now(),
  unique (user_id, period)
);

-- 現在ランクを算出するビュー
create view public.user_vip as
select p.id as user_id, p.xp,
       (select t.name from public.vip_tiers t where p.xp >= t.min_xp order by t.min_xp desc limit 1) as tier_name,
       (select t.staking_rate_bps from public.vip_tiers t where p.xp >= t.min_xp order by t.min_xp desc limit 1) as staking_rate_bps
from public.profiles p;

-- ---------- updated_at trigger ----------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.tg_touch_updated_at();

-- ---------- new user bootstrap (profile + wallet) ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, handle)
    values (new.id, coalesce(new.raw_user_meta_data->>'username','Player'),
            'player_' || substr(new.id::text, 1, 8));
  insert into public.point_wallets (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- RLS ----------
alter table public.profiles            enable row level security;
alter table public.user_genres         enable row level security;
alter table public.point_wallets       enable row level security;
alter table public.point_ledger        enable row level security;
alter table public.mission_completions enable row level security;
alter table public.exchange_requests   enable row level security;
alter table public.staking_accruals    enable row level security;
-- public-read catalogs
alter table public.games               enable row level security;
alter table public.missions            enable row level security;
alter table public.exchange_items      enable row level security;
alter table public.vip_tiers           enable row level security;

-- own-row policies
create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);
create policy "own genres"   on public.user_genres for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own wallet"   on public.point_wallets for select using (auth.uid() = user_id);
create policy "own ledger"   on public.point_ledger for select using (auth.uid() = user_id);
create policy "own completions" on public.mission_completions for select using (auth.uid() = user_id);
create policy "own exchanges"   on public.exchange_requests for select using (auth.uid() = user_id);
create policy "own staking"     on public.staking_accruals for select using (auth.uid() = user_id);
-- catalogs are world-readable
create policy "games read"      on public.games          for select using (true);
create policy "missions read"   on public.missions       for select using (is_active);
create policy "items read"      on public.exchange_items for select using (is_active);
create policy "tiers read"      on public.vip_tiers      for select using (true);
-- NOTE: all writes to wallet/ledger/completions go through SECURITY DEFINER RPCs (0006).
