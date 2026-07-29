-- ============================================================
-- MasterGame — 一括セットアップSQL（自動生成）
-- Supabase Studio の SQL Editor にこの内容を全て貼り付けて Run。
-- 内容 = migrations 全て ＋ seed.sql（この順で実行）。
-- 新規プロジェクトで1回だけ実行してください。
-- 再生成: scripts/build-setup-sql.sh
-- ============================================================


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0001_core.sql
-- └────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0002_postback.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0002 postback verification & moderation state
-- Reflects docs/specs/mission-verification-postback.md
-- ============================================================

-- ---------- ad_partners (広告主 / ゲーム会社 / ネットワーク) ----------
create table public.ad_partners (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text unique not null,             -- postbackパスに使用
  signing_secret_ref text not null,                    -- Vault参照（生のsecretは保存しない）
  signing_algo       text not null default 'hmac-sha256'
                     check (signing_algo in ('hmac-sha256','hmac-sha512')),
  allowed_ips        inet[],                            -- IP許可リスト
  attribution_window interval not null default '24 hours',
  postback_mode      text not null default 'sandbox' check (postback_mode in ('sandbox','live')),
  status             text not null default 'active' check (status in ('active','suspended')),
  created_at         timestamptz not null default now(),
  rotated_at         timestamptz
);

alter table public.games    add constraint games_partner_fk
  foreign key (partner_id) references public.ad_partners(id);
alter table public.missions add constraint missions_partner_fk
  foreign key (partner_id) references public.ad_partners(id);

-- ---------- mission_clicks (attribution起点) ----------
create table public.mission_clicks (
  id          uuid primary key default gen_random_uuid(),
  click_id    text unique not null,                    -- postbackで返る照合キー
  user_id     uuid not null references auth.users(id) on delete cascade,
  mission_id  uuid not null references public.missions(id) on delete cascade,
  partner_id  uuid not null references public.ad_partners(id),
  clicked_at  timestamptz not null default now(),
  expires_at  timestamptz not null,                    -- clicked_at + attribution_window
  ip          inet,
  device_fp   text,
  user_agent  text,
  is_converted boolean not null default false
);
create index idx_clicks_user_mission on public.mission_clicks(user_id, mission_id);
create index idx_clicks_expires on public.mission_clicks(expires_at);

-- ---------- postback_events (受信した生イベント + 検証結果) ----------
create table public.postback_events (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.ad_partners(id),
  transaction_id text not null,                         -- 冪等キー
  click_id       text references public.mission_clicks(click_id),
  user_id        uuid references auth.users(id),
  mission_id     uuid references public.missions(id),
  status         text not null default 'received'
                 check (status in ('received','accepted','rejected','duplicate','reversed')),
  signature_valid boolean,
  reward_points  integer,
  ledger_id      uuid references public.point_ledger(id),
  raw            jsonb,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  unique (partner_id, transaction_id)                   -- べき等性
);
create index idx_postback_user on public.postback_events(user_id, received_at desc);

-- ---------- fraud_flags ----------
create table public.fraud_flags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  flag_type   text not null,                            -- multi_account / velocity / emulator / vpn ...
  severity    text not null default 'low' check (severity in ('low','medium','high')),
  detail      jsonb,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_fraud_user on public.fraud_flags(user_id);

-- ---------- user_moderation_state (BAN / 凍結 / マーキング) ----------
create table public.user_moderation_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      text not null default 'active'
             check (state in ('active','frozen','banned','marked')),
  reason     text,
  expires_at timestamptz,                               -- 凍結の解除予定
  set_by     uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- ---------- RLS ----------
-- パートナー / postback / fraud は運営のみ（service_role 経由）。RLSは有効化し、ポリシーは付与しない＝拒否。
alter table public.ad_partners            enable row level security;
alter table public.mission_clicks         enable row level security;
alter table public.postback_events        enable row level security;
alter table public.fraud_flags            enable row level security;
alter table public.user_moderation_state  enable row level security;

create policy "own clicks read" on public.mission_clicks for select using (auth.uid() = user_id);
create policy "own postback read" on public.postback_events for select using (auth.uid() = user_id);
create policy "own modstate read" on public.user_moderation_state for select using (auth.uid() = user_id);


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0003_offerwall.sql
-- └────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0004_community.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0004 community (guild / topic / post / bounty / report / moderation)
-- Reflects docs/specs/community-guild.md
-- ============================================================

-- 横断ロール
create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','moderator','admin','superuser')),
  forum_id   uuid,                                       -- moderator用（NULL=全体）
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- フォーラム（ギルド）
create table public.forums (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  type        text not null check (type in ('public','game')),
  game_id     uuid references public.games(id),
  visibility  text not null default 'listed' check (visibility in ('listed','unlisted','archived')),
  is_open     boolean not null default true,
  opens_at    timestamptz,
  closes_at   timestamptz,                               -- 期間限定開催（BtoB）
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.forum_members (
  forum_id  uuid not null references public.forums(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (forum_id, user_id)
);

create table public.topics (
  id            uuid primary key default gen_random_uuid(),
  forum_id      uuid not null references public.forums(id) on delete cascade,
  author_id     uuid not null references auth.users(id),
  kind          text not null check (kind in ('request','question','chat')),
  title         text not null check (char_length(title) <= 120),
  status        text not null default 'open' check (status in ('open','resolved','closed','removed')),
  best_answer_post_id uuid,                              -- → posts (循環FKは後付け)
  has_bounty    boolean not null default false,
  reply_count   integer not null default 0,
  last_activity_at timestamptz not null default now(),
  moderation_state text not null default 'visible' check (moderation_state in ('visible','pending','hidden')),
  created_at    timestamptz not null default now()
);
create index idx_topics_forum on public.topics(forum_id, last_activity_at desc);

create table public.posts (
  id            uuid primary key default gen_random_uuid(),
  topic_id      uuid not null references public.topics(id) on delete cascade,
  author_id     uuid not null references auth.users(id),
  body          text not null,
  media_url     text,
  is_op         boolean not null default false,
  moderation_state text not null default 'visible' check (moderation_state in ('visible','pending','hidden')),
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  deleted_at    timestamptz
);
create index idx_posts_topic on public.posts(topic_id, created_at);

alter table public.topics
  add constraint topics_best_answer_fk foreign key (best_answer_post_id) references public.posts(id);

create table public.reactions (
  id        uuid primary key default gen_random_uuid(),
  post_id   uuid not null references public.posts(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  kind      text not null default 'like' check (kind in ('like','spotlight')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, kind)
);

-- ポイント賭け質問（エスクロー）
create table public.bounty_questions (
  topic_id      uuid primary key references public.topics(id) on delete cascade,
  amount        integer not null check (amount > 0),
  escrow_ledger_id uuid references public.point_ledger(id),  -- 賭けた時点で出金（エスクロー）
  state         text not null default 'escrowed' check (state in ('escrowed','awarded','refunded','clawed_back')),
  awarded_post_id uuid references public.posts(id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- 通報
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id),
  target_type text not null check (target_type in ('post','topic','user')),
  target_id   uuid not null,
  reason      text not null check (reason in ('spam','inappropriate','harassment','other')),
  detail      text,
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_reports_status on public.reports(status, created_at);

-- モデレーション対応ログ
create table public.moderation_actions (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid references public.reports(id),
  moderator_id uuid references auth.users(id),
  action     text not null check (action in ('delete','warn','dismiss','freeze','ban')),
  target_type text not null,
  target_id  uuid not null,
  note       text,
  created_at timestamptz not null default now()
);

-- 通知
create table public.notifications (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  type      text not null,                              -- reply / best_answer / reaction / report_result ...
  payload   jsonb not null default '{}'::jsonb,
  read_at   timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notif_user on public.notifications(user_id, created_at desc);

-- ---------- RLS ----------
alter table public.user_roles        enable row level security;
alter table public.forums            enable row level security;
alter table public.forum_members     enable row level security;
alter table public.topics            enable row level security;
alter table public.posts             enable row level security;
alter table public.reactions         enable row level security;
alter table public.bounty_questions  enable row level security;
alter table public.reports           enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.notifications     enable row level security;

-- 公開読み取り（可視のみ）。書き込みはRPC（0006）経由。
create policy "forums read" on public.forums for select using (visibility <> 'archived' and deleted_at is null);
create policy "topics read" on public.topics for select using (moderation_state = 'visible');
create policy "posts read"  on public.posts  for select using (moderation_state = 'visible' and deleted_at is null);
create policy "reactions read" on public.reactions for select using (true);
create policy "bounty read"  on public.bounty_questions for select using (true);
-- 自分の通報/通知/メンバーシップ
create policy "own reports"  on public.reports for select using (auth.uid() = reporter_id);
create policy "own notifs"   on public.notifications for select using (auth.uid() = user_id);
create policy "own membership" on public.forum_members for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reporter insert" on public.reports for insert with check (auth.uid() = reporter_id);


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0005_nudge.sql
-- └────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0006_functions.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0006 RPC functions (atomic point operations)
-- All wallet/ledger writes flow through these SECURITY DEFINER functions.
-- ============================================================

-- 内部: 確定ポイントを加減算（wallet と ledger を整合的に更新）
create or replace function public.apply_points(
  p_user uuid, p_delta bigint, p_reason text, p_ref_type text default null, p_ref_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_ledger uuid;
begin
  insert into point_ledger(user_id, delta, reason, ref_type, ref_id, status)
    values (p_user, p_delta, p_reason, p_ref_type, p_ref_id, 'confirmed')
    returning id into v_ledger;
  update point_wallets set
    balance         = balance + p_delta,
    lifetime_earned = lifetime_earned + greatest(p_delta, 0),
    lifetime_spent  = lifetime_spent  + greatest(-p_delta, 0),
    updated_at = now()
  where user_id = p_user;
  return v_ledger;
end $$;

-- ミッション達成 → ポイント付与（検証不要のもの）
create or replace function public.claim_mission(p_mission_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m missions; v_ledger uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_m from missions where id = p_mission_id and is_active;
  if not found then raise exception 'mission not found'; end if;
  if v_m.requires_verification then raise exception 'mission requires server verification (postback)'; end if;

  v_ledger := apply_points(v_uid, v_m.reward_points, 'mission', 'mission', v_m.id);
  insert into mission_completions(user_id, mission_id, status, progress, ledger_id, completed_at)
    values (v_uid, p_mission_id, 'confirmed', v_m.max_progress, v_ledger, now());
  update profiles set xp = xp + v_m.reward_points where id = v_uid;  -- 活動でXP蓄積

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;

-- ポイント交換申請（残高チェック → 出金 → 申請作成）
create or replace function public.request_exchange(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item exchange_items; v_bal bigint; v_ledger uuid; v_req uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_item from exchange_items where id = p_item_id and is_active;
  if not found then raise exception 'item not found'; end if;
  select balance into v_bal from point_wallets where user_id = v_uid for update;
  if v_bal < v_item.cost_points then raise exception 'insufficient points'; end if;
  if v_item.stock is not null and v_item.stock <= 0 then raise exception 'out of stock'; end if;

  v_ledger := apply_points(v_uid, -v_item.cost_points, 'exchange', 'exchange_item', v_item.id);
  insert into exchange_requests(user_id, item_id, cost_points, status, ledger_id)
    values (v_uid, p_item_id, v_item.cost_points, 'processing', v_ledger) returning id into v_req;
  if v_item.stock is not null then
    update exchange_items set stock = stock - 1 where id = p_item_id;
  end if;
  return jsonb_build_object('ok', true, 'request_id', v_req, 'status', 'processing');
end $$;

-- スマートナッジの対象（最も近い未到達アイテム + 不足分）
create or replace function public.next_nudge_target()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bal bigint; v_item exchange_items;
begin
  if v_uid is null then return null; end if;
  select balance into v_bal from point_wallets where user_id = v_uid;
  select * into v_item from exchange_items
    where is_active and cost_points > v_bal order by cost_points asc limit 1;
  if not found then return jsonb_build_object('all_affordable', true); end if;
  return jsonb_build_object(
    'item_id', v_item.id, 'item_name', v_item.name,
    'gap', v_item.cost_points - v_bal, 'cost', v_item.cost_points);
end $$;

grant execute on function public.claim_mission(uuid)    to authenticated;
grant execute on function public.request_exchange(uuid) to authenticated;
grant execute on function public.next_nudge_target()    to authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0007_admin.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0007 admin aggregate view (運営コンソール用)
-- service_role からの集計参照を想定（RLSをバイパス）。
-- ============================================================
create view public.admin_overview as
select
  (select count(*) from public.profiles)                                              as total_users,
  (select coalesce(sum(delta),0)  from public.point_ledger
     where delta > 0 and status = 'confirmed')                                         as distributed_points,
  (select coalesce(sum(-delta),0) from public.point_ledger
     where delta < 0 and reason = 'exchange' and status = 'confirmed')                 as exchanged_points,
  (select count(distinct user_id) from public.exchange_requests)                       as exchange_users,
  (select count(*) from public.reports where status = 'open')                          as open_reports,
  (select count(*) from public.postback_events where status = 'received')              as pending_postbacks;

-- ユーザー一覧（管理画面の表に対応：累計獲得 / 交換済み / 保有）
create view public.admin_user_rows as
select
  p.id, p.username, p.handle, p.xp,
  coalesce(w.lifetime_earned, 0) as earned,
  coalesce(w.lifetime_spent, 0)  as exchanged,
  coalesce(w.balance, 0)         as balance,
  coalesce(m.state, 'active')    as moderation_state,
  u.created_at
from public.profiles p
join auth.users u on u.id = p.id
left join public.point_wallets w on w.user_id = p.id
left join public.user_moderation_state m on m.user_id = p.id;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0008_rate.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0008 point economy rate (1,000P = 1円)
-- レートを単一の設定に集約し、金額換算・XP分離を行う。
-- ============================================================

-- アプリ全体設定（key-value）
create table public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
-- 経済レート：value は「1円あたりのポイント数」。1000 = 1,000P = 1円
insert into public.app_config (key, value) values ('point_yen_rate', '1000'::jsonb);

alter table public.app_config enable row level security;
create policy "config read" on public.app_config for select using (true);

create or replace function public.point_yen_rate() returns int
  language sql stable as $$
  select (value #>> '{}')::int from public.app_config where key = 'point_yen_rate';
$$;

-- ポイント→円換算ヘルパー（sum(delta) は numeric を返すため引数も numeric で受ける）
create or replace function public.points_to_yen(p numeric) returns numeric
  language sql stable as $$ select round(p / public.point_yen_rate()); $$;

-- ---------- XP をポイントから分離（活動量ベース） ----------
alter table public.missions add column if not exists xp_reward integer not null default 50;

create or replace function public.claim_mission(p_mission_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_m missions; v_ledger uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_m from missions where id = p_mission_id and is_active;
  if not found then raise exception 'mission not found'; end if;
  if v_m.requires_verification then raise exception 'mission requires server verification (postback)'; end if;

  v_ledger := apply_points(v_uid, v_m.reward_points, 'mission', 'mission', v_m.id);
  insert into mission_completions(user_id, mission_id, status, progress, ledger_id, completed_at)
    values (v_uid, p_mission_id, 'confirmed', v_m.max_progress, v_ledger, now());
  update profiles set xp = xp + v_m.xp_reward where id = v_uid;  -- XPはポイントと独立

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;

-- ---------- admin_overview に円換算を追加 ----------
create or replace view public.admin_overview as
select
  (select count(*) from public.profiles)                                              as total_users,
  (select coalesce(sum(delta),0)  from public.point_ledger
     where delta > 0 and status = 'confirmed')                                         as distributed_points,
  (select coalesce(sum(-delta),0) from public.point_ledger
     where delta < 0 and reason = 'exchange' and status = 'confirmed')                 as exchanged_points,
  (select count(distinct user_id) from public.exchange_requests)                       as exchange_users,
  (select count(*) from public.reports where status = 'open')                          as open_reports,
  (select count(*) from public.postback_events where status = 'received')              as pending_postbacks,
  public.points_to_yen((select coalesce(sum(delta),0) from public.point_ledger
     where delta > 0 and status = 'confirmed')::bigint)                                as distributed_yen,
  public.points_to_yen((select coalesce(sum(-delta),0) from public.point_ledger
     where delta < 0 and reason = 'exchange' and status = 'confirmed')::bigint)        as exchanged_yen;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0009_economy.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0009 economy tuning (還元率 + 収益ベンチマーク + 推奨単価ビュー)
-- docs/ECONOMY.md / wireframes/economy.html に対応。
-- ============================================================

-- 還元率（広告収益→ユーザー）。bps: 5000 = 50%
insert into public.app_config (key, value) values ('payout_ratio_bps', '5000'::jsonb)
  on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.payout_ratio() returns numeric
  language sql stable as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_config where key='payout_ratio_bps'), 5000) / 10000;
$$;

-- 収益ベンチマーク（アクション別）。ad=収益連動 / engage=固定予算（収益は参考）
create table public.revenue_benchmarks (
  action_key        text primary key,
  label             text not null,
  category          text not null check (category in ('ad','engage')),
  revenue_yen       numeric not null default 0,   -- 1回あたり収益(¥)
  freq_per_user_day numeric not null default 0,   -- 想定頻度
  note              text,
  updated_at        timestamptz not null default now()
);

insert into public.revenue_benchmarks (action_key, label, category, revenue_yen, freq_per_user_day, note) values
  ('rewarded_video','動画リワード視聴','ad', 2.0, 3,    'eCPM ¥1,500〜3,000/1000'),
  ('offer_install','提携オファー：インストール','ad', 300, 0.02, 'インストールCPA'),
  ('offer_purchase','提携オファー：初回課金','ad', 800, 0.005,'レベニューシェア'),
  ('survey','アンケート回答','ad', 100, 0.3,  'アンケートCPA'),
  ('read_article','攻略記事を読む','engage', 1.0, 2,   '間接（バナー）'),
  ('view_x','公式Xのポストを見る','engage', 0.6, 1,   '間接'),
  ('login_bonus','ログインボーナス','engage', 0, 1,   '継続施策');

alter table public.revenue_benchmarks enable row level security;
create policy "benchmarks read" on public.revenue_benchmarks for select using (true);

-- 推奨単価ビュー：ad は 収益 × 還元率 × レート、engage は NULL（固定予算）
create or replace view public.recommended_action_pricing as
select
  b.action_key, b.label, b.category, b.revenue_yen, b.freq_per_user_day,
  case when b.category = 'ad'
       then round(b.revenue_yen * public.payout_ratio() * public.point_yen_rate())
       else null end as recommended_points
from public.revenue_benchmarks b;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0010_distribution.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0010 distribution structure (実コスト / 交換先ミックス)
-- 「配布額面」と「実コスト」を分離。docs/ECONOMY.md・economy.html に対応。
-- ============================================================

-- 交換アイテムの実原価率（額面に対する%）。bps: 1500 = 15%
alter table public.exchange_items add column if not exists cost_rate_bps integer not null default 1500;

-- 提携ゲームアイテム＝低原価(15%)、実物ギフト券(csv)＝現金等価(100%)
update public.exchange_items set cost_rate_bps = 10000 where delivery_method = 'csv';
update public.exchange_items set cost_rate_bps = 1500  where delivery_method in ('code','api');

-- 交換先ミックス（配布額面の行き先・想定%）と breakage を設定に保持
insert into public.app_config (key, value) values
  ('redemption_mix_item_bps',     '7000'::jsonb),   -- ゲームアイテム 70%
  ('redemption_mix_gift_bps',     '2000'::jsonb),   -- ギフト券 20%
  ('redemption_mix_breakage_bps', '1000'::jsonb)    -- 未交換 10%
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 実効原価率（交換先ミックス × 原価率）の概算ヘルパー
-- ＝ item% × item原価率 + gift% × 100% + breakage% × 0
create or replace function public.effective_cost_rate() returns numeric
  language sql stable as $$
  select
    (select (value #>> '{}')::numeric from public.app_config where key='redemption_mix_item_bps')/10000
      * (select avg(cost_rate_bps)::numeric/10000 from public.exchange_items where delivery_method in ('code','api'))
  + (select (value #>> '{}')::numeric from public.app_config where key='redemption_mix_gift_bps')/10000
      * 1.0
  + 0;  -- breakage は原価0
$$;

-- 額面→実コスト換算（円）
create or replace function public.face_to_real_cost(face_yen numeric) returns numeric
  language sql stable as $$ select round(face_yen * public.effective_cost_rate()); $$;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0011_postback_rpc.sql
-- └────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0012_community_rpc.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0012 community write RPCs
-- Topic creation / reply / reaction / best answer (+ bounty escrow).
-- All writes flow through SECURITY DEFINER functions (RLS allows read only).
-- Reflects docs/specs/community-guild.md
-- ============================================================

-- 新規トピック作成（OP投稿を同時作成。任意でポイントを賭けてエスクロー）
create or replace function public.create_topic(
  p_forum_id uuid, p_kind text, p_title text, p_body text, p_bounty_amount integer default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_forum  forums;
  v_topic  uuid;
  v_post   uuid;
  v_bal    bigint;
  v_ledger uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('request','question','chat') then raise exception 'invalid kind'; end if;
  if coalesce(btrim(p_title),'') = '' then raise exception 'title required'; end if;
  if char_length(p_title) > 120 then raise exception 'title too long'; end if;
  if coalesce(btrim(p_body),'') = '' then raise exception 'body required'; end if;
  if p_bounty_amount < 0 then raise exception 'invalid bounty amount'; end if;

  select * into v_forum from forums
    where id = p_forum_id and deleted_at is null and visibility <> 'archived';
  if not found then raise exception 'forum not found'; end if;
  if not v_forum.is_open then raise exception 'forum closed'; end if;
  if p_bounty_amount > 0 and p_kind <> 'question' then
    raise exception 'bounty is only for questions';
  end if;

  insert into topics(forum_id, author_id, kind, title, has_bounty)
    values (p_forum_id, v_uid, p_kind, btrim(p_title), p_bounty_amount > 0)
    returning id into v_topic;

  insert into posts(topic_id, author_id, body, is_op)
    values (v_topic, v_uid, p_body, true)
    returning id into v_post;

  -- 賭け：作成時点で残高から出金しエスクロー
  if p_bounty_amount > 0 then
    select balance into v_bal from point_wallets where user_id = v_uid for update;
    if v_bal is null or v_bal < p_bounty_amount then
      raise exception 'insufficient points for bounty';
    end if;
    v_ledger := apply_points(v_uid, -p_bounty_amount, 'bounty_escrow', 'topic', v_topic);
    insert into bounty_questions(topic_id, amount, escrow_ledger_id, state)
      values (v_topic, p_bounty_amount, v_ledger, 'escrowed');
  end if;

  update profiles set xp = xp + 5 where id = v_uid;   -- 活動でXP

  return jsonb_build_object('ok', true, 'topic_id', v_topic, 'post_id', v_post);
end $$;

-- 返信（reply_count / last_activity を更新し、作者へ通知）
create or replace function public.add_reply(p_topic_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_topic topics;
  v_post  uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_body),'') = '' then raise exception 'body required'; end if;

  select * into v_topic from topics where id = p_topic_id;
  if not found then raise exception 'topic not found'; end if;
  if v_topic.status in ('closed','removed') then raise exception 'topic is closed'; end if;
  if v_topic.moderation_state <> 'visible' then raise exception 'topic unavailable'; end if;

  insert into posts(topic_id, author_id, body, is_op)
    values (p_topic_id, v_uid, p_body, false)
    returning id into v_post;

  update topics set reply_count = reply_count + 1, last_activity_at = now()
    where id = p_topic_id;

  if v_topic.author_id <> v_uid then
    insert into notifications(user_id, type, payload)
      values (v_topic.author_id, 'reply',
        jsonb_build_object('topic_id', p_topic_id, 'post_id', v_post));
  end if;

  update profiles set xp = xp + 2 where id = v_uid;

  return jsonb_build_object('ok', true, 'post_id', v_post);
end $$;

-- リアクション（押下でトグル）。新規付与時のみ作者へ通知。
create or replace function public.toggle_reaction(p_post_id uuid, p_kind text default 'like')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_post     posts;
  v_existing uuid;
  v_reacted  boolean;
  v_count    integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('like','spotlight') then raise exception 'invalid kind'; end if;

  select * into v_post from posts where id = p_post_id and deleted_at is null;
  if not found then raise exception 'post not found'; end if;

  select id into v_existing from reactions
    where post_id = p_post_id and user_id = v_uid and kind = p_kind;

  if v_existing is not null then
    delete from reactions where id = v_existing;
    v_reacted := false;
  else
    insert into reactions(post_id, user_id, kind) values (p_post_id, v_uid, p_kind);
    v_reacted := true;
    if v_post.author_id <> v_uid then
      insert into notifications(user_id, type, payload)
        values (v_post.author_id, 'reaction',
          jsonb_build_object('post_id', p_post_id, 'kind', p_kind));
    end if;
  end if;

  select count(*) into v_count from reactions where post_id = p_post_id and kind = p_kind;
  return jsonb_build_object('ok', true, 'reacted', v_reacted, 'count', v_count);
end $$;

-- ベストアンサー確定（作者のみ）。賭けがあればエスクローを回答者へ付与。
create or replace function public.set_best_answer(p_topic_id uuid, p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_topic  topics;
  v_post   posts;
  v_bounty bounty_questions;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_topic from topics where id = p_topic_id;
  if not found then raise exception 'topic not found'; end if;
  if v_topic.author_id <> v_uid then
    raise exception 'only the topic author can pick the best answer';
  end if;

  select * into v_post from posts
    where id = p_post_id and topic_id = p_topic_id and deleted_at is null;
  if not found then raise exception 'post not found in topic'; end if;
  if v_post.is_op then raise exception 'cannot pick the original post'; end if;

  update topics set best_answer_post_id = p_post_id, status = 'resolved'
    where id = p_topic_id;

  -- 賭け質問：エスクローから賞金を回答者へ
  select * into v_bounty from bounty_questions where topic_id = p_topic_id;
  if found and v_bounty.state = 'escrowed' then
    perform apply_points(v_post.author_id, v_bounty.amount, 'bounty_award', 'topic', p_topic_id);
    update bounty_questions
      set state = 'awarded', awarded_post_id = p_post_id, resolved_at = now()
      where topic_id = p_topic_id;
  end if;

  if v_post.author_id <> v_uid then
    insert into notifications(user_id, type, payload)
      values (v_post.author_id, 'best_answer',
        jsonb_build_object('topic_id', p_topic_id, 'post_id', p_post_id));
  end if;

  return jsonb_build_object('ok', true, 'best_answer_post_id', p_post_id);
end $$;

grant execute on function public.create_topic(uuid, text, text, text, integer) to authenticated;
grant execute on function public.add_reply(uuid, text)                          to authenticated;
grant execute on function public.toggle_reaction(uuid, text)                    to authenticated;
grant execute on function public.set_best_answer(uuid, uuid)                    to authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0013_security_hardening.sql
-- └────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0014_fk_indexes.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0014 未インデックスの外部キーにインデックスを追加
-- 参照 join / カスケード削除 / 集計の性能を改善する。
-- 既存の複合インデックスでカバー済みの列は対象外。
-- ============================================================
create index if not exists idx_games_partner        on public.games(partner_id);
create index if not exists idx_missions_partner      on public.missions(partner_id);
create index if not exists idx_exchange_items_game   on public.exchange_items(game_id);
create index if not exists idx_exchange_req_item     on public.exchange_requests(item_id);
create index if not exists idx_offers_network        on public.offers(network_id);
create index if not exists idx_offercomp_offer       on public.offer_completions(offer_id);
create index if not exists idx_offercomp_network     on public.offer_completions(network_id);
create index if not exists idx_completions_mission   on public.mission_completions(mission_id);
create index if not exists idx_postback_partner      on public.postback_events(partner_id);
create index if not exists idx_clicks_partner        on public.mission_clicks(partner_id);
create index if not exists idx_topics_author         on public.topics(author_id);
create index if not exists idx_posts_author          on public.posts(author_id);


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0015_ledger_idempotency_reversal.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0015 台帳の冪等キー ＋ postback 取消（reversal）
--   spec §5.5/§6.3/§6.4 に対応。
--   1) point_ledger.idempotency_key（unique）＝二重付与の最終防御
--   2) apply_points を冪等キー対応に置換（オーバーロードを作らず drop→create）
--   3) confirm_postback / claim_mission が冪等キーを付与
--   4) reverse_postback RPC（取消・reversed 遷移・打ち消しエントリ）
-- ============================================================

-- ---------- 1) 冪等キー列 ----------
alter table public.point_ledger add column if not exists idempotency_key text;
-- NULL は複数許容（従来の付与に影響なし）。非 NULL のみ一意。
create unique index if not exists uq_ledger_idempotency
  on public.point_ledger(idempotency_key) where idempotency_key is not null;

-- ---------- 2) apply_points（冪等キー対応版へ置換） ----------
-- 旧5引数版を drop してから6引数版を作る（default 付きなので既存の5引数呼び出しも解決される）。
-- オーバーロードを残すと新シグネチャに PUBLIC EXECUTE が付き 0013 の権限剥奪が無効化されるため。
drop function if exists public.apply_points(uuid, bigint, text, text, uuid);
create or replace function public.apply_points(
  p_user uuid, p_delta bigint, p_reason text,
  p_ref_type text default null, p_ref_id uuid default null, p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_ledger uuid;
begin
  -- 冪等キーがあれば既存エントリを返し、二重付与しない（wallet も触らない）
  if p_idempotency_key is not null then
    select id into v_ledger from point_ledger where idempotency_key = p_idempotency_key;
    if found then return v_ledger; end if;
  end if;

  begin
    insert into point_ledger(user_id, delta, reason, ref_type, ref_id, status, idempotency_key)
      values (p_user, p_delta, p_reason, p_ref_type, p_ref_id, 'confirmed', p_idempotency_key)
      returning id into v_ledger;
  exception when unique_violation then
    -- 競合：先行トランザクションが付与済み。wallet は更新せず既存 ledger を返す。
    select id into v_ledger from point_ledger where idempotency_key = p_idempotency_key;
    return v_ledger;
  end;

  -- 新規挿入時のみ wallet を更新（欠損時は ensure→update）
  insert into point_wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  update point_wallets set
    balance         = balance + p_delta,
    lifetime_earned = lifetime_earned + greatest(p_delta, 0),
    lifetime_spent  = lifetime_spent  + greatest(-p_delta, 0),
    updated_at = now()
  where user_id = p_user;
  return v_ledger;
end $$;
revoke all on function public.apply_points(uuid, bigint, text, text, uuid, text) from public, anon, authenticated;

-- ---------- 3) confirm_postback に冪等キーを付与 ----------
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

  begin
    insert into postback_events(partner_id, transaction_id, click_id, status, raw, received_at)
      values (v_partner.id, p_transaction_id, p_click_id, 'received', p_raw, now())
      returning id into v_event;
  exception when unique_violation then
    return jsonb_build_object('status','duplicate','transaction_id',p_transaction_id);
  end;

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

  select state into v_modstate from user_moderation_state where user_id = v_uid;
  if v_modstate in ('banned','frozen') then
    update postback_events set status='rejected', user_id=v_uid, mission_id=v_m.id, processed_at=now() where id=v_event;
    insert into fraud_flags(user_id, flag_type, severity, detail)
      values (v_uid, 'postback_blocked_state', 'medium', jsonb_build_object('state',v_modstate,'tx',p_transaction_id));
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  if v_click.is_converted then
    update postback_events set status='duplicate', processed_at=now() where id=v_event;
    return jsonb_build_object('status','duplicate','reason','click_already_converted');
  end if;

  v_reward := v_m.reward_points;
  if p_reward_override is not null and p_reward_override > 0 and p_reward_override <= v_m.reward_points then
    v_reward := p_reward_override;
  end if;

  -- 冪等キー：partner:transaction_id。台帳レベルでも二重付与を防ぐ最終防御。
  v_ledger := apply_points(v_uid, v_reward, 'postback', 'mission', v_m.id,
                           'postback:' || v_partner.id::text || ':' || p_transaction_id);
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

-- ---------- claim_mission に冪等キーを付与 ----------
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

  insert into mission_completions(user_id, mission_id, status, progress, period_key)
    values (v_uid, p_mission_id, 'confirmed', v_m.max_progress, v_period)
    on conflict (user_id, mission_id, period_key) do nothing
    returning id into v_completion;
  if v_completion is null then raise exception 'mission already claimed'; end if;

  v_ledger := apply_points(v_uid, v_m.reward_points, 'mission', 'mission', v_m.id,
                           'mission:' || v_uid::text || ':' || p_mission_id::text || ':' || v_period);
  update mission_completions set ledger_id = v_ledger, completed_at = now() where id = v_completion;
  update profiles set xp = xp + v_m.xp_reward where id = v_uid;

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;
revoke all on function public.claim_mission(uuid) from public, anon;
grant execute on function public.claim_mission(uuid) to authenticated;

-- ---------- 4) reverse_postback（取消） ----------
-- 不正判明・チャージバック時に確定済み postback を打ち消す。service_role 専用。
-- ledger は不変なので負の打ち消しエントリを追加し、関連状態を reversed に遷移する。
create or replace function public.reverse_postback(
  p_partner_slug text, p_transaction_id text, p_reason text default 'chargeback'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_partner ad_partners; v_event postback_events; v_ledger uuid;
begin
  select * into v_partner from ad_partners where slug = p_partner_slug;
  if not found then return jsonb_build_object('status','rejected','reason','unknown_partner'); end if;

  select * into v_event from postback_events
    where partner_id = v_partner.id and transaction_id = p_transaction_id;
  if not found then return jsonb_build_object('status','rejected','reason','event_not_found'); end if;
  if v_event.status = 'reversed' then
    return jsonb_build_object('status','duplicate','reason','already_reversed');
  end if;
  if v_event.status <> 'accepted' or v_event.user_id is null or v_event.reward_points is null then
    return jsonb_build_object('status','rejected','reason','not_reversible');
  end if;

  -- 打ち消し（負）エントリ。冪等キーで二重取消を防止。
  v_ledger := apply_points(v_event.user_id, -v_event.reward_points, 'postback_reversal',
                           'mission', v_event.mission_id,
                           'reverse:' || v_event.id::text);
  update postback_events set status='reversed', processed_at=now() where id = v_event.id;
  update mission_completions set status='reversed' where ledger_id = v_event.ledger_id;
  insert into fraud_flags(user_id, flag_type, severity, detail)
    values (v_event.user_id, 'postback_reversed', 'high',
            jsonb_build_object('tx', p_transaction_id, 'reason', p_reason, 'reward', v_event.reward_points));

  return jsonb_build_object('status','reversed','user_id',v_event.user_id,'reversal_ledger',v_ledger);
end $$;
revoke all on function public.reverse_postback(text, text, text) from public, anon, authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0016_community_concurrency.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0016 community RPC の並行安全性強化
--   1) set_best_answer: bounty の二重付与を state 遷移で防止（+冪等キー）
--   2) create_topic: 残高/エスクロー検証を挿入前に行い、escrow を冪等化
--   3) toggle_reaction: 同時押下の unique 違反を on conflict で解消
-- ============================================================

-- ---------- 1) set_best_answer ----------
create or replace function public.set_best_answer(p_topic_id uuid, p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_topic   topics;
  v_post    posts;
  v_amount  integer;
  v_awardee uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_topic from topics where id = p_topic_id;
  if not found then raise exception 'topic not found'; end if;
  if v_topic.author_id <> v_uid then
    raise exception 'only the topic author can pick the best answer';
  end if;

  select * into v_post from posts
    where id = p_post_id and topic_id = p_topic_id and deleted_at is null;
  if not found then raise exception 'post not found in topic'; end if;
  if v_post.is_op then raise exception 'cannot pick the original post'; end if;

  -- ベストアンサー確定は「未確定→確定」の遷移を1回だけ許可（並行/再送で二重確定しない）
  update topics set best_answer_post_id = p_post_id, status = 'resolved'
    where id = p_topic_id and status <> 'resolved';
  if not found then raise exception 'best answer already chosen'; end if;

  -- 賭け質問：エスクロー state を escrowed→awarded に遷移できたときだけ付与（唯一の勝者）
  update bounty_questions
    set state = 'awarded', awarded_post_id = p_post_id, resolved_at = now()
    where topic_id = p_topic_id and state = 'escrowed'
    returning amount into v_amount;
  if found then
    v_awardee := v_post.author_id;
    perform apply_points(v_awardee, v_amount, 'bounty_award', 'topic', p_topic_id,
                         'bounty_award:' || p_topic_id::text);
  end if;

  if v_post.author_id <> v_uid then
    insert into notifications(user_id, type, payload)
      values (v_post.author_id, 'best_answer',
        jsonb_build_object('topic_id', p_topic_id, 'post_id', p_post_id));
  end if;

  return jsonb_build_object('ok', true, 'best_answer_post_id', p_post_id);
end $$;
revoke all on function public.set_best_answer(uuid, uuid) from public, anon;
grant execute on function public.set_best_answer(uuid, uuid) to authenticated;

-- ---------- 2) create_topic ----------
create or replace function public.create_topic(
  p_forum_id uuid, p_kind text, p_title text, p_body text, p_bounty_amount integer default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_forum  forums;
  v_topic  uuid;
  v_post   uuid;
  v_bal    bigint;
  v_ledger uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('request','question','chat') then raise exception 'invalid kind'; end if;
  if coalesce(btrim(p_title),'') = '' then raise exception 'title required'; end if;
  if char_length(p_title) > 120 then raise exception 'title too long'; end if;
  if coalesce(btrim(p_body),'') = '' then raise exception 'body required'; end if;
  if p_bounty_amount < 0 then raise exception 'invalid bounty amount'; end if;

  select * into v_forum from forums
    where id = p_forum_id and deleted_at is null and visibility <> 'archived';
  if not found then raise exception 'forum not found'; end if;
  if not v_forum.is_open then raise exception 'forum closed'; end if;
  if p_bounty_amount > 0 and p_kind <> 'question' then
    raise exception 'bounty is only for questions';
  end if;

  -- 賭けがある場合は「挿入前」に残高を確保（失敗時にトピックの残骸を作らない）
  if p_bounty_amount > 0 then
    select balance into v_bal from point_wallets where user_id = v_uid for update;
    if v_bal is null or v_bal < p_bounty_amount then
      raise exception 'insufficient points for bounty';
    end if;
  end if;

  insert into topics(forum_id, author_id, kind, title, has_bounty)
    values (p_forum_id, v_uid, p_kind, btrim(p_title), p_bounty_amount > 0)
    returning id into v_topic;

  insert into posts(topic_id, author_id, body, is_op)
    values (v_topic, v_uid, p_body, true)
    returning id into v_post;

  if p_bounty_amount > 0 then
    -- topic 単位の冪等キー（同一 topic への二重出金を防止）
    v_ledger := apply_points(v_uid, -p_bounty_amount, 'bounty_escrow', 'topic', v_topic,
                             'bounty_escrow:' || v_topic::text);
    insert into bounty_questions(topic_id, amount, escrow_ledger_id, state)
      values (v_topic, p_bounty_amount, v_ledger, 'escrowed');
  end if;

  update profiles set xp = xp + 5 where id = v_uid;

  return jsonb_build_object('ok', true, 'topic_id', v_topic, 'post_id', v_post);
end $$;
revoke all on function public.create_topic(uuid, text, text, text, integer) from public, anon;
grant execute on function public.create_topic(uuid, text, text, text, integer) to authenticated;

-- ---------- 3) toggle_reaction ----------
create or replace function public.toggle_reaction(p_post_id uuid, p_kind text default 'like')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_post    posts;
  v_reacted boolean;
  v_deleted integer;
  v_count   integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('like','spotlight') then raise exception 'invalid kind'; end if;

  select * into v_post from posts where id = p_post_id and deleted_at is null;
  if not found then raise exception 'post not found'; end if;

  -- まず削除を試み、消えれば「取り消し」。消えなければ挿入して「付与」。
  -- delete/insert(on conflict) はどちらも単一文でアトミックなので同時押下でも 500 にならない。
  delete from reactions where post_id = p_post_id and user_id = v_uid and kind = p_kind;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    v_reacted := false;
  else
    insert into reactions(post_id, user_id, kind) values (p_post_id, v_uid, p_kind)
      on conflict (post_id, user_id, kind) do nothing;
    v_reacted := true;
    if v_post.author_id <> v_uid then
      insert into notifications(user_id, type, payload)
        values (v_post.author_id, 'reaction',
          jsonb_build_object('post_id', p_post_id, 'kind', p_kind));
    end if;
  end if;

  select count(*) into v_count from reactions where post_id = p_post_id and kind = p_kind;
  return jsonb_build_object('ok', true, 'reacted', v_reacted, 'count', v_count);
end $$;
revoke all on function public.toggle_reaction(uuid, text) from public, anon;
grant execute on function public.toggle_reaction(uuid, text) to authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0017_economy_paths.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0017 経済パスの実装（スキーマのみ存在→動作させる）
--   1) accrue_staking(period): 月次の保有ボーナスを付与（冪等）
--   2) fulfill_exchange / cancel_exchange: 交換申請の確定・取消（返金＋在庫戻し）
--   3) confirm_offer: オファーウォール達成の確定（冪等＋日次レート制限）
--   4) mark_notification_read: 通知の既読化
--   5) next_nudge_target: ナッジ表示ログ（nudge_events）を記録
-- すべて apply_points(0015 の冪等キー対応版) を単一の付与口として使う。
-- ============================================================

-- 日次オファー上限（app_config。既定 20）
insert into public.app_config (key, value) values ('daily_offer_cap', '20'::jsonb)
  on conflict (key) do nothing;

-- ---------- 1) staking accrual（月次保有ボーナス） ----------
-- 対象月(period=月初日)の残高に VIP 月利を掛けて付与する。(user,period) で冪等。
-- pg_cron 等から `select accrue_staking(date_trunc('month', now())::date);` を月次実行する想定。
create or replace function public.accrue_staking(p_period date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_row record; v_rate integer; v_accrued integer; v_ledger uuid; v_count integer := 0;
begin
  for v_row in
    select w.user_id, w.balance, p.xp
    from point_wallets w join profiles p on p.id = w.user_id
    where w.balance > 0
  loop
    -- 既に当月付与済みならスキップ（冪等）
    if exists (select 1 from staking_accruals where user_id = v_row.user_id and period = p_period) then
      continue;
    end if;
    select coalesce(
      (select staking_rate_bps from vip_tiers t where t.min_xp <= v_row.xp order by t.min_xp desc limit 1), 0)
      into v_rate;
    v_accrued := floor(v_row.balance::numeric * v_rate / 10000)::integer;
    if v_accrued <= 0 then continue; end if;

    v_ledger := apply_points(v_row.user_id, v_accrued, 'staking', 'staking', null,
                             'staking:' || v_row.user_id::text || ':' || p_period::text);
    insert into staking_accruals(user_id, period, base_balance, rate_bps, accrued_points, ledger_id)
      values (v_row.user_id, p_period, v_row.balance, v_rate, v_accrued, v_ledger)
      on conflict (user_id, period) do nothing;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'period', p_period, 'accrued_users', v_count);
end $$;
revoke all on function public.accrue_staking(date) from public, anon, authenticated;

-- ---------- 2) exchange fulfillment / cancel ----------
-- 交換申請を確定（コード付与）。processing のときのみ遷移。運営/自動フルフィルから呼ぶ。
create or replace function public.fulfill_exchange(p_request_id uuid, p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req exchange_requests;
begin
  update exchange_requests
    set status = 'fulfilled', code = p_code, fulfilled_at = now()
    where id = p_request_id and status = 'processing'
    returning * into v_req;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_processing'); end if;
  if v_req.user_id is not null then
    insert into notifications(user_id, type, payload)
      values (v_req.user_id, 'exchange_fulfilled',
        jsonb_build_object('request_id', p_request_id, 'has_code', p_code is not null));
  end if;
  return jsonb_build_object('ok', true, 'request_id', p_request_id, 'status', 'fulfilled');
end $$;
revoke all on function public.fulfill_exchange(uuid, text) from public, anon, authenticated;

-- 交換申請を取消。ポイントを返金し、在庫を戻す。processing のときのみ。
create or replace function public.cancel_exchange(p_request_id uuid, p_reason text default 'admin_cancel')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_req exchange_requests; v_item exchange_items;
begin
  update exchange_requests set status = 'cancelled'
    where id = p_request_id and status = 'processing'
    returning * into v_req;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_processing'); end if;

  -- 返金（冪等キーで二重返金を防止）
  perform apply_points(v_req.user_id, v_req.cost_points, 'exchange_refund', 'exchange_request', v_req.id,
                       'exchange_refund:' || v_req.id::text);
  -- 在庫を戻す（有限在庫のみ）
  select * into v_item from exchange_items where id = v_req.item_id;
  if found and v_item.stock is not null then
    update exchange_items set stock = stock + 1 where id = v_req.item_id;
  end if;
  insert into notifications(user_id, type, payload)
    values (v_req.user_id, 'exchange_cancelled',
      jsonb_build_object('request_id', p_request_id, 'refunded', v_req.cost_points, 'reason', p_reason));
  return jsonb_build_object('ok', true, 'request_id', p_request_id, 'refunded', v_req.cost_points);
end $$;
revoke all on function public.cancel_exchange(uuid, text) from public, anon, authenticated;

-- ---------- 3) offerwall 達成の確定 ----------
-- 署名/IP 検証は Edge Function 側（offer-postback）で済ませた前提で service_role から呼ぶ。
-- 冪等: unique(network_id, network_txn_id)。日次上限: user_daily_offer_counts。
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

  -- BAN/凍結ユーザーは付与しない
  select state into v_modstate from user_moderation_state where user_id = p_user;
  if v_modstate in ('banned','frozen') then
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  -- 冪等: 既に受信済みの txn は（レート上限より先に）duplicate を返す
  if exists (select 1 from offer_completions where network_id = v_net.id and network_txn_id = p_network_txn_id) then
    return jsonb_build_object('status','duplicate','network_txn_id',p_network_txn_id);
  end if;

  -- 報酬額はオファー設定を上限に採用（無ければ override / それも無ければ拒否）
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

  -- 日次上限チェック（offerwall）
  select coalesce((value #>> '{}')::int, 20) into v_cap from app_config where key = 'daily_offer_cap';
  select coalesce(count, 0) into v_used from user_daily_offer_counts
    where user_id = p_user and day = current_date and ad_type = 'offerwall';
  if v_cap is not null and v_used >= v_cap then
    return jsonb_build_object('status','rejected','reason','daily_cap_reached');
  end if;

  -- 冪等付与：offer_completions の unique が二重を弾く
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

  -- 日次カウンタを加算
  insert into user_daily_offer_counts(user_id, day, ad_type, count)
    values (p_user, current_date, 'offerwall', 1)
    on conflict (user_id, day, ad_type) do update set count = user_daily_offer_counts.count + 1;

  return jsonb_build_object('status','accepted','user_id',p_user,'reward',v_reward);
end $$;
revoke all on function public.confirm_offer(text, text, uuid, text, integer) from public, anon, authenticated;

-- ---------- 4) 通知の既読化 ----------
create or replace function public.mark_notification_read(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  update notifications set read_at = now()
    where id = p_id and user_id = v_uid and read_at is null;
  return jsonb_build_object('ok', found);
end $$;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- ---------- 5) next_nudge_target に表示ログ ----------
-- ギャップ対象を返すときに nudge_events を記録（表示→交換ファネル計測）。
-- 表示スパムを避けるため、同種ナッジは 1 時間クールダウン。
create or replace function public.next_nudge_target()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bal bigint; v_item exchange_items; v_last timestamptz;
begin
  if v_uid is null then return null; end if;
  select balance into v_bal from point_wallets where user_id = v_uid;
  select * into v_item from exchange_items
    where is_active and cost_points > coalesce(v_bal,0) order by cost_points asc limit 1;
  if not found then return jsonb_build_object('all_affordable', true); end if;

  -- クールダウン内でなければ表示ログを記録
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


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0018_handle_uniqueness.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — 0018 handle 生成の衝突耐性
-- handle_new_user は handle を UUID 先頭8桁から作っていたため、先頭8桁が一致する
-- 2ユーザーが同時に存在できず（handle UNIQUE 違反で signup が中断）。
-- id（PK＝一意）由来の全桁を使い、既定 handle を確実に一意にする。
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, handle)
    values (new.id, coalesce(new.raw_user_meta_data->>'username','Player'),
            'player_' || translate(new.id::text, '-', ''));  -- id 由来で一意
  insert into public.point_wallets (user_id) values (new.id);
  return new;
end $$;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0019_offer_click.sql
-- └────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0020_push_tokens.sql
-- └────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0021_fraud_detection.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- 0021: 不正検知（fraud detection）
--
-- fraud_flags テーブルは 0002 から存在し、flag_type のコメントに
-- multi_account / velocity / emulator / vpn と設計意図まで書かれていたが、
-- 実際に起票していたのは「すでに BAN 済みユーザーが postback を受けた時」
-- ＝事後記録のみで、検知ロジックは存在しなかった。
--
-- ポイ活の収益源は広告主の CPA 報酬であり、不正ユーザーの混入は
-- 「広告主に切られる＝事業が止まる」直接のリスクになる。
-- API の穴（無限鋳造・連打・在庫レース）は 0013 で塞いだので、
-- ここで塞ぐのは「正規 API を正しく叩く不正ユーザー」の側。
--
--   1) fraud_settings      … 閾値をマイグレーション無しで調整できるように
--   2) user_devices        … 端末とアカウントの紐付け（多重アカウント検知の土台）
--   3) raise_fraud_flag    … 重複起票を抑えつつ fraud_flags に起票する内部関数
--   4) register_device     … 端末登録 + multi_account / emulator 検知（アプリから呼ぶ）
--   5) check_velocity      … 短時間の異常獲得を検知（apply_points から自動で走る）
--   6) admin_fraud_rows    … 運営レビュー用ビュー
--   7) resolve_fraud_flag  … 運営の処理（却下 / 凍結 / BAN）
--
-- 注意: device_id はクライアント申告値なので「証拠」ではなく「シグナル」。
-- 端末の真正性を厳密に取るには DeviceCheck(iOS) / Play Integrity(Android) の
-- アテステーションが要る（本番強化の次段）。ここでは自己申告値でも十分に効く
-- 「同一端末でアカウントを作り直す」典型パターンの検知を目的とする。
-- ============================================================

-- ---------- 1) 閾値設定 ----------
create table if not exists public.fraud_settings (
  key        text primary key,
  value      bigint not null,
  note       text,
  updated_at timestamptz not null default now()
);

insert into public.fraud_settings(key, value, note) values
  ('multi_account_warn',      3,     '同一端末でこの数以上のアカウント → multi_account 起票'),
  ('multi_account_mark',      5,     '同一端末でこの数以上 → さらに moderation_state を marked に'),
  ('velocity_count_1h',      40,     '1時間あたりの獲得回数がこの数以上 → velocity 起票(medium)'),
  ('velocity_points_1h',  20000,     '1時間あたりの獲得ポイントがこの値以上 → velocity 起票(high)'),
  ('flag_cooldown_minutes', 1440,    '同一ユーザー/同一種別の再起票を抑制する時間（分）')
on conflict (key) do nothing;

alter table public.fraud_settings enable row level security; -- ポリシー無し＝service_role 専用

create or replace function public.fraud_setting(p_key text, p_default bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select value from fraud_settings where key = p_key), p_default);
$$;
revoke all on function public.fraud_setting(text, bigint) from public, anon, authenticated;

-- ---------- 2) 端末とアカウントの紐付け ----------
create table if not exists public.user_devices (
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   text not null,
  platform    text,
  model       text,
  os_version  text,
  is_emulator boolean not null default false,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (user_id, device_id)
);
-- 「この端末を使っている全アカウント」を引くための索引（多重アカウント検知の主経路）
create index if not exists idx_user_devices_device on public.user_devices(device_id);

alter table public.user_devices enable row level security;
drop policy if exists ud_self_read on public.user_devices;
create policy ud_self_read on public.user_devices
  for select using (auth.uid() = user_id);
-- 書き込みは register_device（SECURITY DEFINER）経由のみ。直接 INSERT はポリシー不在＝拒否。

-- ---------- 3) 起票の共通処理（重複抑制つき） ----------
-- 同じユーザー・同じ種別の未解決フラグが cooldown 内にあれば起票しない。
-- 運営のレビューキューが同一事象で溢れるのを防ぐ。
create or replace function public.raise_fraud_flag(
  p_user uuid, p_type text, p_severity text, p_detail jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cooldown bigint;
begin
  if p_user is null then return null; end if;
  v_cooldown := fraud_setting('flag_cooldown_minutes', 1440);

  if exists (
    select 1 from fraud_flags
     where user_id = p_user and flag_type = p_type and resolved_at is null
       and created_at > now() - make_interval(mins => v_cooldown::int)
  ) then
    return null;
  end if;

  insert into fraud_flags(user_id, flag_type, severity, detail)
    values (p_user, p_type, p_severity, p_detail)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.raise_fraud_flag(uuid, text, text, jsonb) from public, anon, authenticated;

-- ---------- 4) 端末登録 + 多重アカウント / エミュレータ検知 ----------
create or replace function public.register_device(
  p_device_id   text,
  p_platform    text default null,
  p_model       text default null,
  p_os_version  text default null,
  p_is_emulator boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_accounts bigint; v_warn bigint; v_mark bigint; v_flag uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_device_id is null or length(btrim(p_device_id)) = 0 then
    raise exception 'device_id required';
  end if;
  if length(p_device_id) > 200 then raise exception 'device_id too long'; end if;

  insert into user_devices(user_id, device_id, platform, model, os_version, is_emulator)
    values (v_uid, btrim(p_device_id), p_platform, p_model, p_os_version, coalesce(p_is_emulator,false))
  on conflict (user_id, device_id) do update
    set last_seen   = now(),
        platform    = coalesce(excluded.platform,   user_devices.platform),
        model       = coalesce(excluded.model,      user_devices.model),
        os_version  = coalesce(excluded.os_version, user_devices.os_version),
        is_emulator = excluded.is_emulator;

  -- この端末に紐づくアカウント数（＝作り直しの痕跡）
  select count(distinct user_id) into v_accounts
    from user_devices where device_id = btrim(p_device_id);

  v_warn := fraud_setting('multi_account_warn', 3);
  v_mark := fraud_setting('multi_account_mark', 5);

  if v_accounts >= v_warn then
    v_flag := raise_fraud_flag(
      v_uid, 'multi_account',
      case when v_accounts >= v_mark then 'high' else 'medium' end,
      jsonb_build_object('device_id', btrim(p_device_id), 'accounts', v_accounts)
    );
  end if;

  -- 閾値超えは自動で marked に（BAN/凍結は誤検知の影響が大きいので運営判断に残す）。
  -- marked は獲得をブロックしない＝レビュー対象の目印。既に banned/frozen なら触らない。
  if v_accounts >= v_mark then
    insert into user_moderation_state(user_id, state, reason)
      values (v_uid, 'marked', 'auto: multi_account')
    on conflict (user_id) do update
      set state = case when user_moderation_state.state = 'active' then 'marked'
                       else user_moderation_state.state end,
          reason = case when user_moderation_state.state = 'active' then 'auto: multi_account'
                        else user_moderation_state.reason end,
          updated_at = now();
  end if;

  if coalesce(p_is_emulator, false) then
    perform raise_fraud_flag(v_uid, 'emulator', 'medium',
      jsonb_build_object('device_id', btrim(p_device_id), 'model', p_model, 'platform', p_platform));
  end if;

  return jsonb_build_object('ok', true, 'accounts_on_device', v_accounts, 'flagged', v_flag is not null);
end $$;
revoke all on function public.register_device(text, text, text, text, boolean) from public, anon;
grant execute on function public.register_device(text, text, text, text, boolean) to authenticated;

-- ---------- 5) 獲得速度の異常検知 ----------
-- 直近1時間の「獲得回数」と「獲得ポイント」を見る。人力では到達しない速度＝自動化の疑い。
create or replace function public.check_velocity(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_count bigint; v_sum bigint;
begin
  select count(*), coalesce(sum(delta), 0) into v_count, v_sum
    from point_ledger
   where user_id = p_user and delta > 0 and status = 'confirmed'
     and created_at > now() - interval '1 hour';

  if v_sum >= fraud_setting('velocity_points_1h', 20000) then
    perform raise_fraud_flag(p_user, 'velocity', 'high',
      jsonb_build_object('window', '1h', 'points', v_sum, 'count', v_count));
  elsif v_count >= fraud_setting('velocity_count_1h', 40) then
    perform raise_fraud_flag(p_user, 'velocity', 'medium',
      jsonb_build_object('window', '1h', 'points', v_sum, 'count', v_count));
  end if;
end $$;
revoke all on function public.check_velocity(uuid) from public, anon, authenticated;

-- apply_points に検知を挿す。全ての付与が通る唯一の隘路なので、ここに置けば
-- mission / offer / postback / staking すべてを一箇所でカバーできる。
-- 検知は「絶対に付与を壊さない」— 例外は握りつぶす（監視が落ちても経済は回る）。
create or replace function public.apply_points(
  p_user uuid, p_delta bigint, p_reason text,
  p_ref_type text default null, p_ref_id uuid default null, p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_ledger uuid;
begin
  if p_idempotency_key is not null then
    select id into v_ledger from point_ledger where idempotency_key = p_idempotency_key;
    if found then return v_ledger; end if;
  end if;

  begin
    insert into point_ledger(user_id, delta, reason, ref_type, ref_id, status, idempotency_key)
      values (p_user, p_delta, p_reason, p_ref_type, p_ref_id, 'confirmed', p_idempotency_key)
      returning id into v_ledger;
  exception when unique_violation then
    select id into v_ledger from point_ledger where idempotency_key = p_idempotency_key;
    return v_ledger;
  end;

  insert into point_wallets(user_id) values (p_user) on conflict (user_id) do nothing;
  update point_wallets set
    balance         = balance + p_delta,
    lifetime_earned = lifetime_earned + greatest(p_delta, 0),
    lifetime_spent  = lifetime_spent  + greatest(-p_delta, 0),
    updated_at = now()
  where user_id = p_user;

  -- 付与時のみ速度検知。失敗しても付与は成立させる。
  if p_delta > 0 then
    begin
      perform check_velocity(p_user);
    exception when others then null;
    end;
  end if;

  return v_ledger;
end $$;
revoke all on function public.apply_points(uuid, bigint, text, text, uuid, text) from public, anon, authenticated;

-- ---------- 6) 運営レビュー用ビュー ----------
create or replace view public.admin_fraud_rows
with (security_invoker = on) as
select
  f.id, f.user_id, f.flag_type, f.severity, f.detail,
  f.created_at, f.resolved_at,
  p.handle, p.username,
  coalesce(m.state, 'active') as moderation_state,
  coalesce(w.balance, 0)      as balance,
  (select count(distinct d2.user_id)
     from user_devices d1
     join user_devices d2 on d2.device_id = d1.device_id
    where d1.user_id = f.user_id) as linked_accounts
from fraud_flags f
left join profiles p              on p.id      = f.user_id
left join user_moderation_state m on m.user_id = f.user_id
left join point_wallets w         on w.user_id = f.user_id;
revoke all on public.admin_fraud_rows from public, anon, authenticated;

-- ---------- 7) 運営の処理 ----------
-- dismiss=誤検知として解決 / freeze=一時凍結 / ban=永久停止。
-- 凍結・BAN は confirm_postback・confirm_offer 側で獲得がブロックされる。
create or replace function public.resolve_fraud_flag(
  p_flag_id uuid, p_action text, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_flag fraud_flags; v_state text;
begin
  if p_action not in ('dismiss','freeze','ban') then
    raise exception 'invalid action: %', p_action;
  end if;

  select * into v_flag from fraud_flags where id = p_flag_id;
  if not found then raise exception 'flag not found'; end if;

  if v_flag.resolved_at is not null then
    return jsonb_build_object('status','duplicate','reason','already_resolved');
  end if;

  update fraud_flags
     set resolved_at = now(),
         detail = coalesce(detail,'{}'::jsonb)
                  || jsonb_build_object('resolution', p_action, 'note', p_note)
   where id = p_flag_id;

  if p_action <> 'dismiss' and v_flag.user_id is not null then
    v_state := case p_action when 'freeze' then 'frozen' else 'banned' end;
    insert into user_moderation_state(user_id, state, reason)
      values (v_flag.user_id, v_state, coalesce(p_note, 'fraud: ' || v_flag.flag_type))
    on conflict (user_id) do update
      set state = excluded.state, reason = excluded.reason, updated_at = now();
  end if;

  return jsonb_build_object('status','resolved','action',p_action,'user_id',v_flag.user_id);
end $$;
revoke all on function public.resolve_fraud_flag(uuid, text, text) from public, anon, authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0022_economy_analytics.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- 0022: ポイント経済の可視化（運営ダッシュボード用の集計ビュー）
--
-- admin_overview は「累計」しか持たず、日次の推移も、発行に対する交換の比率も、
-- 未交換残高（＝将来の支払債務）も見えなかった。ポイ活は「配りすぎ」が一瞬で
-- 赤字になる商売なのに、赤字化に気づく手段が無い状態だった。
--
-- 特に重要なのが **未交換残高**。発行済みで未だ交換されていないポイントは
-- 会計上の負債であり、資金決済法の前払式支払手段に該当する場合は未使用残高に
-- 応じた供託義務も生じうる。KPI として常時見えている必要がある。
--
--   1) economy_daily         … 日次の発行/消費/参加者（直近60日、欠測日も0で埋める）
--   2) economy_by_reason     … 経路別の内訳（どこからポイントが出ているか）
--   3) economy_liability     … 未交換残高＝将来債務（額面/円/実コスト）
--   4) admin_economy_summary … ダッシュボードのKPIを1行で
--
-- 全て security_invoker + クライアントロールから revoke（service_role 専用）。
-- ============================================================

-- ---------- 1) 日次推移 ----------
-- generate_series で日付を作ってから left join することで、取引ゼロの日も
-- 行として残す（グラフが日付をスキップして歪むのを防ぐ）。
create or replace view public.economy_daily
with (security_invoker = on) as
select
  d::date                                                          as day,
  coalesce(sum(l.delta) filter (where l.delta > 0), 0)::bigint     as issued_points,
  coalesce(-sum(l.delta) filter (where l.delta < 0), 0)::bigint    as spent_points,
  coalesce(-sum(l.delta) filter (where l.reason = 'exchange'), 0)::bigint as exchanged_points,
  count(distinct l.user_id) filter (where l.delta > 0)             as earning_users,
  count(l.id) filter (where l.delta > 0)                           as earn_events
from generate_series(current_date - 59, current_date, interval '1 day') d
left join public.point_ledger l
       on l.created_at >= d
      and l.created_at <  d + interval '1 day'
      and l.status = 'confirmed'
group by d;
revoke all on public.economy_daily from public, anon, authenticated;

-- ---------- 2) 経路別の内訳（直近30日） ----------
-- 「どのミッション種別/オファーからポイントが出ているか」を掴む。
-- 想定外の経路が急伸していたら不正か設定ミスを疑う入口になる。
create or replace view public.economy_by_reason
with (security_invoker = on) as
select
  l.reason,
  coalesce(sum(l.delta) filter (where l.delta > 0), 0)::bigint  as issued_points,
  coalesce(-sum(l.delta) filter (where l.delta < 0), 0)::bigint as spent_points,
  count(*)                                                      as events,
  count(distinct l.user_id)                                     as users
from public.point_ledger l
where l.status = 'confirmed'
  and l.created_at > now() - interval '30 days'
group by l.reason;
revoke all on public.economy_by_reason from public, anon, authenticated;

-- ---------- 3) 未交換残高＝将来債務 ----------
-- outstanding_real_cost_yen は交換先ミックス（0010）を通した実コスト見込み。
-- 額面そのままではなく「実際に出ていく金額」で債務を見るための列。
create or replace view public.economy_liability
with (security_invoker = on) as
select
  coalesce(sum(w.balance), 0)::bigint                                as outstanding_points,
  public.points_to_yen(coalesce(sum(w.balance), 0)::bigint)          as outstanding_yen,
  public.face_to_real_cost(
    public.points_to_yen(coalesce(sum(w.balance), 0)::bigint))       as outstanding_real_cost_yen,
  count(*) filter (where w.balance > 0)                              as holders,
  coalesce(max(w.balance), 0)::bigint                                as max_balance
from public.point_wallets w;
revoke all on public.economy_liability from public, anon, authenticated;

-- ---------- 4) ダッシュボード用サマリ ----------
create or replace view public.admin_economy_summary
with (security_invoker = on) as
with w30 as (
  select
    coalesce(sum(delta) filter (where delta > 0), 0)::bigint            as issued_30d,
    coalesce(-sum(delta) filter (where delta < 0), 0)::bigint           as spent_30d,
    coalesce(-sum(delta) filter (where reason = 'exchange'), 0)::bigint as exchanged_30d,
    count(distinct user_id) filter (where delta > 0)                    as earning_users_30d
  from public.point_ledger
  where status = 'confirmed' and created_at > now() - interval '30 days'
),
w7 as (
  select coalesce(sum(delta) filter (where delta > 0), 0)::bigint as issued_7d
  from public.point_ledger
  where status = 'confirmed' and created_at > now() - interval '7 days'
)
select
  w30.issued_30d,
  w30.spent_30d,
  w30.exchanged_30d,
  w30.earning_users_30d,
  w7.issued_7d,
  public.points_to_yen(w30.issued_30d)                                   as issued_yen_30d,
  public.points_to_yen(w30.exchanged_30d)                                as exchanged_yen_30d,
  -- 実際に出ていく金額（交換先ミックス経由の実コスト）
  public.face_to_real_cost(public.points_to_yen(w30.exchanged_30d))      as real_cost_yen_30d,
  -- 発行に対して実際に交換された割合。低いほど breakage（未交換）が大きい
  case when w30.issued_30d > 0
       then round(w30.exchanged_30d::numeric / w30.issued_30d * 100, 1)
       else 0 end                                                        as redemption_rate_pct,
  -- 1人あたり発行額面（円）。獲得ユーザー基準の配布強度
  case when w30.earning_users_30d > 0
       then round(public.points_to_yen(w30.issued_30d) / w30.earning_users_30d, 1)
       else 0 end                                                        as issued_yen_per_user_30d,
  l.outstanding_points,
  l.outstanding_yen,
  l.outstanding_real_cost_yen,
  l.holders,
  round(public.effective_cost_rate() * 100, 1)                           as effective_cost_rate_pct,
  round(public.payout_ratio() * 100, 1)                                  as payout_ratio_pct
from w30, w7, public.economy_liability l;
revoke all on public.admin_economy_summary from public, anon, authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0023_referral.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- 0023: 招待・リファラル
--
-- 「招待」はポイ活の主要な成長エンジンだが、同時に**最も荒らされやすい導線**でもある。
-- 自己招待・捨てアカウント量産・端末を変えないままの多重取得が典型で、対策の無い
-- 招待機能は不正の入口そのものになる。そのため 0021 の不正検知（user_devices）と
-- 連動させ、以下の多層で守る:
--
--   1) 自己招待の禁止（自分のコードは使えない）
--   2) 1アカウント1回だけ被招待（referee_id を UNIQUE）
--   3) **同一端末の招待を拒否**（0021 の user_devices を突き合わせ、fraud_flags に起票）
--   4) 新規アカウントのみ被招待可（作成から N 日以内。既存アカウントの刈り取り防止）
--   5) 招待者の日次上限（大量ファーミングの抑制）
--   6) **招待者への報酬は被招待者が実際に遊んでから**（マイルストーン到達で確定）
--      → 捨てアカウントを作るだけでは招待者に報酬が入らない
--   7) BAN/凍結ユーザーは対象外
--
-- 報酬額・閾値は app_config で調整できる（マイグレーション不要）。
-- ============================================================

-- ---------- 設定 ----------
insert into public.app_config (key, value) values
  ('referral_reward_referee',   '30000'::jsonb),  -- 被招待者への報酬（額面30円相当）
  ('referral_reward_referrer',  '50000'::jsonb),  -- 招待者への報酬（マイルストーン到達後）
  ('referral_milestone_points', '10000'::jsonb),  -- 被招待者がこの累計獲得に達したら招待者に付与
  ('referral_max_age_days',     '7'::jsonb),      -- 被招待できるのは登録から何日以内か
  ('referral_referrer_daily_cap', '10'::jsonb)    -- 招待者が1日に確定できる招待数
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.referral_config(p_key text, p_default bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::bigint from app_config where key = p_key), p_default);
$$;
revoke all on function public.referral_config(text, bigint) from public, anon, authenticated;

-- ---------- 招待コード ----------
alter table public.profiles add column if not exists referral_code text;
create unique index if not exists idx_profiles_referral_code
  on public.profiles(referral_code) where referral_code is not null;

-- 紛らわしい文字(0/O/1/I)を除いた8桁。口頭・手入力で共有されることを想定。
create or replace function public.gen_referral_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text; i int;
begin
  for attempt in 1..20 loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    if not exists (select 1 from profiles where referral_code = v_code) then
      return v_code;
    end if;
  end loop;
  -- 20回引いても衝突する状況は異常。無言で重複させず落とす。
  raise exception 'could not generate a unique referral code';
end $$;
revoke all on function public.gen_referral_code() from public, anon, authenticated;

-- 既存ユーザーに付与
update public.profiles set referral_code = public.gen_referral_code() where referral_code is null;

-- 新規ユーザーにも自動付与
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, handle, referral_code)
    values (new.id, coalesce(new.raw_user_meta_data->>'username','Player'),
            'player_' || translate(new.id::text, '-', ''),
            public.gen_referral_code());
  insert into public.point_wallets (user_id) values (new.id);
  return new;
end $$;

-- ---------- 招待の記録 ----------
create table if not exists public.referrals (
  id                 uuid primary key default gen_random_uuid(),
  referrer_id        uuid not null references auth.users(id) on delete cascade,
  referee_id         uuid not null unique references auth.users(id) on delete cascade, -- 1人1回だけ被招待
  code               text not null,
  status             text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  referee_ledger_id  uuid references public.point_ledger(id),
  referrer_ledger_id uuid references public.point_ledger(id),
  created_at         timestamptz not null default now(),
  confirmed_at       timestamptz,
  constraint referral_no_self check (referrer_id <> referee_id)   -- 自己招待はDBレベルでも禁止
);
create index if not exists idx_referrals_referrer on public.referrals(referrer_id, created_at desc);

alter table public.referrals enable row level security;
drop policy if exists ref_self_read on public.referrals;
-- 自分が招待した/された行のみ参照可。書き込みは RPC 経由のみ。
create policy ref_self_read on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referee_id);

-- ---------- 自分の招待コードと実績 ----------
create or replace function public.my_referral_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_code text; v_pending int; v_confirmed int; v_earned bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select referral_code into v_code from profiles where id = v_uid;
  if v_code is null then
    v_code := gen_referral_code();
    update profiles set referral_code = v_code where id = v_uid;
  end if;

  select count(*) filter (where status = 'pending'),
         count(*) filter (where status = 'confirmed')
    into v_pending, v_confirmed
    from referrals where referrer_id = v_uid;

  select coalesce(sum(l.delta), 0) into v_earned
    from referrals r join point_ledger l on l.id = r.referrer_ledger_id
   where r.referrer_id = v_uid;

  return jsonb_build_object(
    'code', v_code,
    'pending', coalesce(v_pending, 0),
    'confirmed', coalesce(v_confirmed, 0),
    'earned_points', coalesce(v_earned, 0),
    'reward_referee', referral_config('referral_reward_referee', 30000),
    'reward_referrer', referral_config('referral_reward_referrer', 50000)
  );
end $$;
revoke all on function public.my_referral_status() from public, anon;
grant execute on function public.my_referral_status() to authenticated;

-- ---------- 招待コードの利用 ----------
create or replace function public.redeem_referral_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_referrer uuid; v_created timestamptz; v_reward bigint; v_ledger uuid;
  v_shared int; v_today int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_code is null or length(btrim(p_code)) = 0 then raise exception 'code required'; end if;

  -- 既に被招待済み（1人1回）
  if exists (select 1 from referrals where referee_id = v_uid) then
    return jsonb_build_object('status','rejected','reason','already_referred');
  end if;

  select id into v_referrer from profiles where referral_code = upper(btrim(p_code));
  if v_referrer is null then
    return jsonb_build_object('status','rejected','reason','invalid_code');
  end if;

  -- 自己招待
  if v_referrer = v_uid then
    return jsonb_build_object('status','rejected','reason','self_referral');
  end if;

  -- 新規アカウントのみ（既存アカウントの刈り取りを防ぐ）
  select created_at into v_created from profiles where id = v_uid;
  if v_created < now() - make_interval(days => referral_config('referral_max_age_days', 7)::int) then
    return jsonb_build_object('status','rejected','reason','account_too_old');
  end if;

  -- BAN/凍結ユーザーは対象外（招待側・被招待側とも）
  if exists (select 1 from user_moderation_state
              where user_id in (v_uid, v_referrer) and state in ('banned','frozen')) then
    return jsonb_build_object('status','rejected','reason','moderated');
  end if;

  -- 同一端末からの招待は拒否（0021 の user_devices と突き合わせ）。
  -- 「同じ端末でアカウントを作り直して自分を招待する」典型パターンをここで止める。
  select count(*) into v_shared
    from user_devices a join user_devices b on a.device_id = b.device_id
   where a.user_id = v_uid and b.user_id = v_referrer;
  if v_shared > 0 then
    perform raise_fraud_flag(v_uid, 'referral_same_device', 'high',
      jsonb_build_object('referrer', v_referrer, 'code', upper(btrim(p_code))));
    return jsonb_build_object('status','rejected','reason','same_device');
  end if;

  -- 招待者の日次上限（大量ファーミングの抑制）
  select count(*) into v_today from referrals
   where referrer_id = v_referrer and created_at > now() - interval '1 day';
  if v_today >= referral_config('referral_referrer_daily_cap', 10) then
    return jsonb_build_object('status','rejected','reason','referrer_daily_cap');
  end if;

  -- 被招待者へは即時付与。招待者への報酬はマイルストーン到達まで保留（捨てアカ対策）。
  v_reward := referral_config('referral_reward_referee', 30000);
  v_ledger := apply_points(v_uid, v_reward, 'referral_referee', 'referral', null,
                           'referral_referee:' || v_uid::text);

  insert into referrals(referrer_id, referee_id, code, status, referee_ledger_id)
    values (v_referrer, v_uid, upper(btrim(p_code)), 'pending', v_ledger);

  return jsonb_build_object('status','ok','reward', v_reward,
                            'note','招待した人へのボーナスは、あなたがミッションを進めると確定します');
exception when unique_violation then
  -- 競合：同時に2回叩かれた場合も二重付与しない（idempotency_key + referee_id UNIQUE）
  return jsonb_build_object('status','rejected','reason','already_referred');
end $$;
revoke all on function public.redeem_referral_code(text) from public, anon;
grant execute on function public.redeem_referral_code(text) to authenticated;

-- ---------- 招待者への報酬確定 ----------
-- 被招待者が「実際に遊んだ」ことを累計獲得ポイントで判定する。
-- 捨てアカウントを作るだけでは招待者に報酬が入らない＝ファーミングの旨味を消す。
create or replace function public.try_confirm_referral(p_referee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ref referrals; v_earned bigint; v_reward bigint; v_ledger uuid; v_today int;
begin
  select * into v_ref from referrals where referee_id = p_referee and status = 'pending';
  if not found then return; end if;

  select lifetime_earned into v_earned from point_wallets where user_id = p_referee;
  -- 招待ボーナス自体はマイルストーンに数えない（それだけで達成してしまうため）
  v_earned := coalesce(v_earned, 0) - referral_config('referral_reward_referee', 30000);
  if v_earned < referral_config('referral_milestone_points', 10000) then return; end if;

  -- 確定時点でも招待者のBAN/凍結を再確認（保留中に処分された場合に払わない）
  if exists (select 1 from user_moderation_state
              where user_id = v_ref.referrer_id and state in ('banned','frozen')) then
    update referrals set status = 'rejected', confirmed_at = now() where id = v_ref.id;
    return;
  end if;

  select count(*) into v_today from referrals
   where referrer_id = v_ref.referrer_id and status = 'confirmed'
     and confirmed_at > now() - interval '1 day';
  if v_today >= referral_config('referral_referrer_daily_cap', 10) then return; end if;

  v_reward := referral_config('referral_reward_referrer', 50000);
  v_ledger := apply_points(v_ref.referrer_id, v_reward, 'referral_referrer', 'referral', v_ref.id,
                           'referral_referrer:' || v_ref.id::text);

  update referrals
     set status = 'confirmed', confirmed_at = now(), referrer_ledger_id = v_ledger
   where id = v_ref.id;
end $$;
revoke all on function public.try_confirm_referral(uuid) from public, anon, authenticated;

-- claim_mission の成功時にマイルストーン判定を挿す。
-- 「ミッションを達成した＝実際にアプリを使った」を確定条件にする（postback/offer は
-- 最も荒らされやすい経路なので、招待の確定トリガーにはあえて使わない）。
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

  insert into mission_completions(user_id, mission_id, status, progress, period_key)
    values (v_uid, p_mission_id, 'confirmed', v_m.max_progress, v_period)
    on conflict (user_id, mission_id, period_key) do nothing
    returning id into v_completion;
  if v_completion is null then raise exception 'mission already claimed'; end if;

  v_ledger := apply_points(v_uid, v_m.reward_points, 'mission', 'mission', v_m.id,
                           'mission:' || v_uid::text || ':' || p_mission_id::text || ':' || v_period);
  update mission_completions set ledger_id = v_ledger, completed_at = now() where id = v_completion;
  update profiles set xp = xp + v_m.xp_reward where id = v_uid;

  -- 招待の確定判定。失敗してもミッション達成は成立させる。
  begin
    perform try_confirm_referral(v_uid);
  exception when others then null;
  end;

  return jsonb_build_object('ok', true, 'reward', v_m.reward_points);
end $$;
revoke all on function public.claim_mission(uuid) from public, anon;
grant execute on function public.claim_mission(uuid) to authenticated;

-- ---------- 運営レビュー用 ----------
create or replace view public.admin_referral_rows
with (security_invoker = on) as
select
  r.id, r.status, r.code, r.created_at, r.confirmed_at,
  r.referrer_id, pr.handle as referrer_handle,
  r.referee_id,  pe.handle as referee_handle,
  coalesce(mr.state, 'active') as referrer_state,
  coalesce(me.state, 'active') as referee_state,
  (select count(distinct b.user_id)
     from user_devices a join user_devices b on a.device_id = b.device_id
    where a.user_id = r.referrer_id) as referrer_linked_accounts
from public.referrals r
left join public.profiles pr on pr.id = r.referrer_id
left join public.profiles pe on pe.id = r.referee_id
left join public.user_moderation_state mr on mr.user_id = r.referrer_id
left join public.user_moderation_state me on me.user_id = r.referee_id;
revoke all on public.admin_referral_rows from public, anon, authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0024_legal_and_expiry.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- 0024: 法務・ストア審査対応（規約同意 / 年齢確認 / ポイント有効期限）
--
-- ポイ活はストア審査（特に iOS）と国内法規の両方が厳しい領域で、リリース前に
-- 必ず要る一式が揃っていなかった（マイページの「利用規約・プライバシー」は
-- Alert のプレースホルダのままだった）。
--
--   1) legal_documents    … 規約/PP/特商法を**DBで版管理**。改定時にアプリ再配布が要らず、
--                           「いつの版に同意したか」を記録できる（改定時の再同意に必要）
--   2) legal_acceptances  … 同意の記録（誰が・どの文書の・どの版に・いつ）
--   3) profiles.date_of_birth … 年齢確認。最低年齢未満は登録不可、未成年フラグを持つ
--   4) ポイント有効期限   … 最終利用から一定期間で失効。失効前に通知する
--
-- ⚠ 本マイグレーションが用意するのは**仕組みと雛形**であり、条文そのものは
--   〔 〕のプレースホルダを含む下書きです。**公開前に必ず弁護士の確認を受け、
--   運営者名・住所・連絡先を実際の値に置き換えてください。**
--   ポイントが資金決済法の前払式支払手段に該当するか、景品表示法上の表示が
--   適切か等は個別判断が必要です。
-- ============================================================

-- ---------- 設定 ----------
insert into public.app_config (key, value) values
  ('min_age',                  '13'::jsonb),  -- 登録可能な最低年齢
  ('adult_age',                '18'::jsonb),  -- 成人年齢（未成年は保護者同意の導線が要る）
  ('point_expiry_months',      '12'::jsonb),  -- 最終利用からこの月数で失効
  ('point_expiry_notice_days', '30'::jsonb)   -- 失効の何日前に通知するか
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.legal_config(p_key text, p_default bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::bigint from app_config where key = p_key), p_default);
$$;
revoke all on function public.legal_config(text, bigint) from public, anon, authenticated;

-- ---------- 1) 法務文書（版管理） ----------
create table if not exists public.legal_documents (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null check (slug in ('terms','privacy','tokushoho')),
  version      text not null,                    -- 例 '2026-07-01'
  title        text not null,
  body         text not null,
  requires_consent boolean not null default true, -- 特商法表記は同意対象ではなく掲示のみ
  published_at timestamptz not null default now(),
  unique (slug, version)
);
create index if not exists idx_legal_docs_slug on public.legal_documents(slug, published_at desc);

alter table public.legal_documents enable row level security;
-- 規約類は未ログインでも読めなければならない（登録前に確認する）。
-- RLS ポリシーだけでは足りず、テーブルへの SELECT 権限も要る。
drop policy if exists legal_public_read on public.legal_documents;
create policy legal_public_read on public.legal_documents for select using (true);
grant select on public.legal_documents to anon, authenticated;

-- 各 slug の最新版
create or replace view public.current_legal_documents
with (security_invoker = on) as
select distinct on (slug) slug, id, version, title, body, requires_consent, published_at
from public.legal_documents
order by slug, published_at desc;
grant select on public.current_legal_documents to anon, authenticated;

-- ---------- 2) 同意の記録 ----------
create table if not exists public.legal_acceptances (
  user_id     uuid not null references auth.users(id) on delete cascade,
  slug        text not null,
  version     text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, slug, version)   -- 同じ版への再同意は1行
);

alter table public.legal_acceptances enable row level security;
drop policy if exists la_self_read on public.legal_acceptances;
create policy la_self_read on public.legal_acceptances for select using (auth.uid() = user_id);

-- 同意を記録する。存在しない版には同意できない（改ざん防止）。
create or replace function public.accept_legal(p_slug text, p_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from legal_documents where slug = p_slug and version = p_version) then
    raise exception 'unknown legal document: % %', p_slug, p_version;
  end if;

  insert into legal_acceptances(user_id, slug, version)
    values (v_uid, p_slug, p_version)
  on conflict (user_id, slug, version) do nothing;

  return jsonb_build_object('ok', true, 'slug', p_slug, 'version', p_version);
end $$;
revoke all on function public.accept_legal(text, text) from public, anon;
grant execute on function public.accept_legal(text, text) to authenticated;

-- 未同意（未同意 or 改定により旧版のまま）の文書を返す。アプリ起動時に確認して同意画面を出す。
create or replace function public.pending_legal_consents()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_rows jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'version', c.version, 'title', c.title)), '[]'::jsonb)
    into v_rows
    from current_legal_documents c
   where c.requires_consent
     and not exists (
       select 1 from legal_acceptances a
        where a.user_id = v_uid and a.slug = c.slug and a.version = c.version
     );

  return v_rows;
end $$;
revoke all on function public.pending_legal_consents() from public, anon;
grant execute on function public.pending_legal_consents() to authenticated;

-- ---------- 3) 年齢確認 ----------
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists age_verified_at timestamptz;

-- 生年月日は本人が1度だけ設定できる（後から書き換えて年齢制限を回避させない）。
create or replace function public.set_date_of_birth(p_dob date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_existing date; v_age int; v_min int; v_adult int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_dob is null then raise exception 'date_of_birth required'; end if;
  if p_dob > current_date then raise exception 'date_of_birth cannot be in the future'; end if;
  if p_dob < current_date - interval '120 years' then raise exception 'invalid date_of_birth'; end if;

  select date_of_birth into v_existing from profiles where id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('status','rejected','reason','already_set');
  end if;

  v_age   := extract(year from age(current_date, p_dob))::int;
  v_min   := legal_config('min_age', 13)::int;
  v_adult := legal_config('adult_age', 18)::int;

  if v_age < v_min then
    -- 記録は残さない（最低年齢未満のデータを保持しない）
    return jsonb_build_object('status','rejected','reason','under_minimum_age','min_age', v_min);
  end if;

  update profiles set date_of_birth = p_dob, age_verified_at = now() where id = v_uid;

  return jsonb_build_object('status','ok','age', v_age, 'is_minor', v_age < v_adult);
end $$;
revoke all on function public.set_date_of_birth(date) from public, anon;
grant execute on function public.set_date_of_birth(date) to authenticated;

-- ---------- 4) ポイント有効期限 ----------
-- 最終ポイント利用（point_wallets.updated_at＝apply_points が更新）から一定期間で失効。
-- 台帳は追記専用なので、失効も「負の確定エントリ」として記録する（残高との整合を保つ）。

-- 失効予定日を持つビュー（アプリの残高表示・運営の確認に使う）
create or replace view public.wallet_expiry
with (security_invoker = on) as
select
  w.user_id,
  w.balance,
  w.updated_at as last_activity_at,
  (w.updated_at + make_interval(months => public.legal_config('point_expiry_months', 12)::int))::date as expires_on
from public.point_wallets w;
grant select on public.wallet_expiry to authenticated;  -- RLS は基表 point_wallets に従う（security_invoker）

-- 失効予告の通知。運営バッチ（pg_cron 等）から service_role で日次実行する。
create or replace function public.notify_expiring_points()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_notice int; v_months int; v_count int := 0; r record;
begin
  v_notice := legal_config('point_expiry_notice_days', 30)::int;
  v_months := legal_config('point_expiry_months', 12)::int;

  for r in
    select w.user_id, w.balance,
           (w.updated_at + make_interval(months => v_months))::date as expires_on
      from point_wallets w
     where w.balance > 0
       and w.updated_at + make_interval(months => v_months)
             <= now() + make_interval(days => v_notice)
       and w.updated_at + make_interval(months => v_months) > now()   -- まだ失効前
  loop
    -- 同じ失効日に対する重複通知を避ける
    if not exists (
      select 1 from notifications n
       where n.user_id = r.user_id and n.type = 'point_expiry_notice'
         and n.payload->>'expires_on' = r.expires_on::text
    ) then
      insert into notifications(user_id, type, payload)
        values (r.user_id, 'point_expiry_notice',
                jsonb_build_object('balance', r.balance, 'expires_on', r.expires_on));
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('notified', v_count);
end $$;
revoke all on function public.notify_expiring_points() from public, anon, authenticated;

-- 失効の実行。p_dry_run=true なら対象を数えるだけで失効させない（本番投入前の確認用）。
create or replace function public.expire_points(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_months int; v_count int := 0; v_points bigint := 0; r record;
begin
  v_months := legal_config('point_expiry_months', 12)::int;

  for r in
    select w.user_id, w.balance
      from point_wallets w
     where w.balance > 0
       and w.updated_at + make_interval(months => v_months) <= now()
     for update
  loop
    v_count  := v_count + 1;
    v_points := v_points + r.balance;

    if not p_dry_run then
      -- 台帳は追記専用。失効も負の確定エントリとして残す（監査可能にする）。
      -- 冪等キーに失効月を含め、同月内の重複実行で二重計上しない。
      perform apply_points(r.user_id, -r.balance, 'expiry', 'wallet', null,
                           'expiry:' || r.user_id::text || ':' || to_char(now(), 'YYYY-MM'));
      insert into notifications(user_id, type, payload)
        values (r.user_id, 'point_expired', jsonb_build_object('points', r.balance));
    end if;
  end loop;

  return jsonb_build_object('dry_run', p_dry_run, 'wallets', v_count, 'points', v_points);
end $$;
revoke all on function public.expire_points(boolean) from public, anon, authenticated;

-- ---------- 法務文書の雛形 ----------
-- ⚠ 下書き。〔 〕は公開前に必ず実際の値へ置き換え、弁護士の確認を受けること。
insert into public.legal_documents (slug, version, title, body, requires_consent) values
('terms', '2026-07-01', '利用規約', E'本規約は、〔運営者名〕（以下「当社」）が提供するアプリ「MasterGame」（以下「本サービス」）の利用条件を定めるものです。\n\n' ||
E'## 第1条（適用）\n本規約は、本サービスの利用に関する当社と利用者との間の一切の関係に適用されます。\n\n' ||
E'## 第2条（利用登録）\n本サービスの利用には利用登録が必要です。〔最低年齢〕歳未満の方はご登録いただけません。未成年の方は保護者の同意を得たうえでご利用ください。\n\n' ||
E'## 第3条（ポイント）\n1. 利用者はミッションの達成等により当社が定めるポイントを取得できます。\n2. ポイントは当社が定める商品等との交換にのみ利用でき、換金・第三者への譲渡・相続はできません。\n3. ポイントの最終利用日から〔有効期間〕を経過した場合、ポイントは失効します。失効前に当社所定の方法で通知します。\n4. 当社は、必要と判断した場合、ポイントの付与条件・交換内容・有効期間を変更することがあります。\n\n' ||
E'## 第4条（禁止事項）\n利用者は、次の行為を行ってはなりません。\n- 同一人物による複数アカウントの作成・利用\n- 自動化ツール、エミュレータ等による不正なポイント取得\n- 虚偽の情報の登録\n- 法令または公序良俗に違反する行為\n\n' ||
E'## 第5条（不正利用への対応）\n当社は、不正が疑われる場合、事前の通知なくアカウントの一時停止・停止、ポイントの取消しを行うことがあります。\n\n' ||
E'## 第6条（免責）\n当社は、本サービスに事実上または法律上の瑕疵がないことを保証しません。ただし、消費者契約法その他の強行法規により当社の責任が免除されない場合はこの限りではありません。\n\n' ||
E'## 第7条（規約の変更）\n当社は、必要と判断した場合、本規約を変更することがあります。重要な変更の場合は、本サービス上で通知し、改めて同意をお願いすることがあります。\n\n' ||
E'## 第8条（準拠法・管轄）\n本規約は日本法に準拠し、本サービスに関する紛争は〔管轄裁判所〕を第一審の専属的合意管轄裁判所とします。\n\n' ||
E'制定日: 2026年7月1日\n〔運営者名〕', true),

('privacy', '2026-07-01', 'プライバシーポリシー', E'〔運営者名〕（以下「当社」）は、本サービスにおける利用者の個人情報の取扱いについて、以下のとおり定めます。\n\n' ||
E'## 1. 取得する情報\n- メールアドレス、パスワード（ハッシュ化して保管）\n- プロフィール情報（ニックネーム、興味のあるジャンル等）\n- 生年月日（年齢確認のため。生年月日そのものは年齢判定にのみ使用します）\n- 端末情報（OS、端末モデル、端末識別子）\n- 利用状況（ミッション達成履歴、ポイント履歴、アクセス日時）\n- プッシュ通知トークン（通知の配信に使用）\n\n' ||
E'## 2. 利用目的\n- 本サービスの提供・本人確認・ポイントの管理\n- **不正行為の検知および防止**（複数アカウントの検知、異常な取得速度の検知等）\n- 提携先へのポイント付与の確認（成果の照合）\n- お問い合わせ対応、重要なお知らせの通知\n- 統計データの作成（個人を識別できない形式に加工します）\n\n' ||
E'## 3. 第三者提供\n当社は、次の場合を除き、利用者の同意なく個人情報を第三者に提供しません。\n- 法令に基づく場合\n- 人の生命・身体・財産の保護に必要で、本人の同意を得ることが困難な場合\n\n' ||
E'## 4. 業務委託\n利用目的の達成に必要な範囲で、個人情報の取扱いを外部に委託することがあります。委託先に対しては必要かつ適切な監督を行います。\n\n' ||
E'## 5. 広告・提携サービス\n本サービスには提携する広告ネットワークのオファーが含まれます。提携先での行動については各提携先のプライバシーポリシーが適用されます。\n\n' ||
E'## 6. 保有期間\n利用目的の達成に必要な期間、および法令で定められた期間保有します。退会後は、不正防止および法令遵守に必要な範囲を除き、速やかに削除します。\n\n' ||
E'## 7. 開示・訂正・削除の請求\n利用者は、当社が保有する自己の個人情報について、開示・訂正・利用停止・削除を請求できます。下記窓口までご連絡ください。\n\n' ||
E'## 8. お問い合わせ窓口\n〔運営者名〕　個人情報お問い合わせ窓口\nメール: 〔連絡先メールアドレス〕\n\n' ||
E'制定日: 2026年7月1日', true),

('tokushoho', '2026-07-01', '特定商取引法に基づく表記', E'## 販売事業者\n〔運営者名〕\n\n' ||
E'## 代表責任者\n〔代表者名〕\n\n' ||
E'## 所在地\n〔所在地〕\n\n' ||
E'## 連絡先\nメール: 〔連絡先メールアドレス〕\n電話: 〔電話番号〕（受付時間: 〔受付時間〕）\n\n' ||
E'## 販売価格\n本サービスの利用は無料です。ポイントの取得に費用は発生しません。\n\n' ||
E'## 役務の提供時期\nポイントの交換申請後、〔提供までの期間〕以内に交換内容をお渡しします。提携先の確認が必要な場合はこれを超えることがあります。\n\n' ||
E'## 返品・キャンセル\nポイント交換の性質上、交換申請後のキャンセル・返品はお受けできません。ただし、当社の責めに帰すべき事由により交換内容をお渡しできない場合は、ポイントを返還します。\n\n' ||
E'## 動作環境\niOS 〔対応バージョン〕以上 / Android 〔対応バージョン〕以上\n\n' ||
E'最終更新日: 2026年7月1日', false)
on conflict (slug, version) do nothing;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0025_game_hub.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- 0025: ゲームハブ（タイトル軸のコミュニティ）
--
-- 「MasterGame」という名前でありながら、コミュニティは汎用のトピック/投稿でしかなく、
-- 「ゲーマー向け」である必然性がプロダクトに出ていなかった。ポイ活アプリは無数にあるので、
-- 差別化はここでしか作れない：**ゲームタイトルを軸にコミュニティを構造化する**。
--
-- forums にはもともと type='game' と game_id 列があったのに使われていなかった
-- （seed の 'eldia-guild' も game_id が NULL のまま）。その設計を実際に動かす。
--
--   1) games の拡充     … プラットフォーム/リリース日/公式サイト等のメタ
--   2) ensure_game_forum … タイトルごとの掲示板を自動で用意し forums.game_id で紐づける
--   3) user_games       … タイトルのフォロー（＝関心の明示。フィードの素になる）
--   4) game_hub_rows    … 一覧用（フォロワー数・トピック数つき）
--   5) my_game_feed     … フォロー中タイトルのトピックだけを流すフィード
-- ============================================================

-- ---------- 1) games の拡充 ----------
alter table public.games add column if not exists description  text;
alter table public.games add column if not exists cover_url    text;
alter table public.games add column if not exists publisher    text;
alter table public.games add column if not exists platforms    text[] not null default '{}';
alter table public.games add column if not exists released_on  date;
alter table public.games add column if not exists is_featured  boolean not null default false;

-- 一覧は「注目 → 名前順」で出すことが多い
create index if not exists idx_games_featured on public.games(is_featured desc, name)
  where is_active;

-- games は公開情報。未ログインでも見られてよい（登録前に「どんなゲームがあるか」を見せたい）
alter table public.games enable row level security;
drop policy if exists games_public_read on public.games;
create policy games_public_read on public.games for select using (is_active);
grant select on public.games to anon, authenticated;

-- ---------- 2) タイトルごとの掲示板 ----------
-- 1タイトル1掲示板。既にあれば作らない（冪等）。
create unique index if not exists idx_forums_game on public.forums(game_id)
  where game_id is not null and deleted_at is null;

create or replace function public.ensure_game_forum(p_game_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_game games; v_forum uuid;
begin
  select * into v_game from games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;

  select id into v_forum from forums
   where game_id = p_game_id and deleted_at is null;
  if found then return v_forum; end if;

  insert into forums(slug, name, description, type, game_id, visibility, is_open)
    values ('game-' || v_game.slug,
            v_game.name,
            v_game.name || ' の攻略・質問・パーティ募集',
            'game', p_game_id, 'listed', true)
  on conflict (slug) do update set game_id = excluded.game_id  -- 既存 slug があれば紐づけ直す
  returning id into v_forum;

  return v_forum;
end $$;
revoke all on function public.ensure_game_forum(uuid) from public, anon, authenticated;

-- 既存タイトルぶんを用意し、seed の 'eldia-guild'（game_id が NULL のまま放置されていた）を紐づける
update public.forums f
   set game_id = g.id
  from public.games g
 where f.slug = 'eldia-guild' and f.game_id is null and g.slug = 'eldia';

do $$ declare r record; begin
  for r in select id from public.games where is_active loop
    perform public.ensure_game_forum(r.id);
  end loop;
end $$;

-- 新しいタイトルを追加したら掲示板も自動で用意する
create or replace function public.tg_game_forum() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_active then perform ensure_game_forum(new.id); end if;
  return new;
end $$;

drop trigger if exists trg_game_forum on public.games;
create trigger trg_game_forum after insert on public.games
  for each row execute function public.tg_game_forum();

-- ---------- 3) タイトルのフォロー ----------
create table if not exists public.user_games (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_id     uuid not null references public.games(id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists idx_user_games_game on public.user_games(game_id);

alter table public.user_games enable row level security;
drop policy if exists ug_self_all on public.user_games;
-- 自分のフォローは自分で読み書きできる（ポイントが動かないので RPC 必須にはしない）
create policy ug_self_all on public.user_games
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, delete on public.user_games to authenticated;

-- ---------- 4) 一覧用ビュー ----------
create or replace view public.game_hub_rows
with (security_invoker = on) as
select
  g.id, g.slug, g.name, g.genre, g.description, g.icon_url, g.cover_url,
  g.publisher, g.platforms, g.released_on, g.is_featured,
  f.id as forum_id,
  (select count(*) from user_games ug where ug.game_id = g.id)          as followers,
  (select count(*) from topics t
     where t.forum_id = f.id and t.moderation_state = 'visible')        as topic_count,
  (select max(t.last_activity_at) from topics t where t.forum_id = f.id) as last_activity_at
from public.games g
left join public.forums f on f.game_id = g.id and f.deleted_at is null
where g.is_active;
grant select on public.game_hub_rows to anon, authenticated;

-- ---------- 5) フォロー中タイトルのフィード ----------
-- 「自分が関心を示したタイトルの動き」だけを流す。汎用の新着一覧との差はここ。
create or replace function public.my_game_feed(p_limit int default 30)
returns table (
  topic_id uuid, forum_id uuid, game_id uuid, game_name text,
  kind text, title text, reply_count int, has_bounty boolean, last_activity_at timestamptz
) language sql stable security definer set search_path = public as $$
  select t.id, t.forum_id, g.id, g.name,
         t.kind, t.title, t.reply_count, t.has_bounty, t.last_activity_at
    from user_games ug
    join games g   on g.id = ug.game_id and g.is_active
    join forums f  on f.game_id = g.id and f.deleted_at is null
    join topics t  on t.forum_id = f.id and t.moderation_state = 'visible'
   where ug.user_id = auth.uid()
   order by t.last_activity_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;
revoke all on function public.my_game_feed(int) from public, anon;
grant execute on function public.my_game_feed(int) to authenticated;

-- ---------- 既存タイトルのメタを埋める ----------
-- 既に seed 済みのDB向けの backfill。新規環境では seed.sql 側が最初から値を持つ
-- （run.sh は migrations → seed の順なので、ここでの UPDATE は新規環境では 0 行になる）。
-- 実在タイトルではなくプロトタイプ用の作例。運営が管理画面から差し替える前提。
update public.games set
  description = case slug
    when 'eldia'          then '王道ファンタジーRPG。パーティ編成と属性相性が肝。'
    when 'monster'        then 'モンスターを育てて競う対戦ストラテジー。'
    when 'starfall'       then '爽快な弾幕シューティング。週替りのランキング戦。'
    when 'puzzle-kingdom' then '連鎖を繋ぐパズル。デイリーの詰めパズルが人気。'
    when 'sengoku'        then '戦国武将を集めて領地を広げるシミュレーション。'
    else description end,
  platforms = case slug
    when 'eldia'          then array['ios','android']
    when 'monster'        then array['ios','android','pc']
    when 'starfall'       then array['ios','android']
    when 'puzzle-kingdom' then array['ios','android']
    when 'sengoku'        then array['ios','android','pc']
    else platforms end,
  is_featured = slug in ('eldia', 'monster')
where slug in ('eldia','monster','starfall','puzzle-kingdom','sengoku');


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0026_account_deletion.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- 0026: アカウント削除（退会）
--
-- **App Store は 2022 年から「アカウントを作成できるアプリは、アプリ内でアカウント削除も
-- 提供すること」を必須要件にしている。** 実装が無いと審査で落ちる。加えて 0024 で入れた
-- プライバシーポリシーには「退会後は速やかに削除します」と書いてあるのに実装が無く、
-- 文書と実態が矛盾していた（それ自体が法務リスク）。
--
-- ■ なぜ「物理削除」ではなく「匿名化」なのか
-- point_ledger をはじめ多くのテーブルが auth.users を `on delete cascade` で参照している。
-- 素朴に auth.users を削除すると **台帳ごと消えて会計が壊れる**（発行済みポイントの記録が
-- 消え、経済KPIも監査証跡も失われる）。台帳は追記専用として設計してあるので、
-- ここで消してはいけない。したがって:
--   - PII（メール・生年月日・プロフィール）は消す/無効化する
--   - 会計記録（point_ledger）は残す
--   - 不正防止に必要な最小限（端末の紐付け）は残す
--     → 「退会 → 再登録」で初回ボーナスを取り直す荒稼ぎを防ぐため。
--       これは 0024 のプライバシーポリシー「不正防止および法令遵守に必要な範囲を除き削除」
--       の範囲内。
--   - 同意記録（legal_acceptances）は残す（いつどの版に同意したかは法的な証跡）
--
-- ■ 猶予期間
-- 誤操作と「勢いでの退会」を救うため、既定7日の猶予後に確定する。
-- ストア要件は「アプリ内で削除を開始できること」なので猶予付きで問題ない。
-- 猶予中はログインでき、いつでも取り消せる。
-- ============================================================

insert into public.app_config (key, value) values
  ('account_deletion_grace_days', '7'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------- moderation_state に 'deleted' を追加 ----------
alter table public.user_moderation_state drop constraint if exists user_moderation_state_state_check;
alter table public.user_moderation_state add constraint user_moderation_state_state_check
  check (state in ('active','frozen','banned','marked','deleted'));

-- ---------- 削除申請 ----------
create table if not exists public.account_deletions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','cancelled','completed')),
  reason       text,
  requested_at timestamptz not null default now(),
  scheduled_at timestamptz not null,
  completed_at timestamptz
);
create index if not exists idx_account_deletions_due
  on public.account_deletions(scheduled_at) where status = 'pending';

alter table public.account_deletions enable row level security;
drop policy if exists ad_self_read on public.account_deletions;
create policy ad_self_read on public.account_deletions
  for select using (auth.uid() = user_id);

-- ---------- 申請 ----------
create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_days int; v_sched timestamptz; v_balance bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if exists (select 1 from account_deletions where user_id = v_uid and status = 'completed') then
    return jsonb_build_object('status','rejected','reason','already_deleted');
  end if;

  v_days  := legal_config('account_deletion_grace_days', 7)::int;
  v_sched := now() + make_interval(days => v_days);
  select coalesce(balance, 0) into v_balance from point_wallets where user_id = v_uid;

  insert into account_deletions(user_id, status, reason, requested_at, scheduled_at)
    values (v_uid, 'pending', p_reason, now(), v_sched)
  on conflict (user_id) do update
    set status = 'pending', reason = excluded.reason,
        requested_at = now(), scheduled_at = excluded.scheduled_at, completed_at = null;

  -- 残高は退会確定で失効する。交換の機会を明示的に知らせる（黙って消さない）。
  return jsonb_build_object(
    'status','ok',
    'scheduled_at', v_sched,
    'grace_days', v_days,
    'balance', coalesce(v_balance, 0),
    'notice', case when coalesce(v_balance,0) > 0
                   then '保有ポイントは退会の完了時に失効します。交換がお済みでない場合はキャンセルしてご交換ください。'
                   else '退会をキャンセルする場合は完了日までにお手続きください。' end
  );
end $$;
revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

-- ---------- 取消 ----------
create or replace function public.cancel_account_deletion()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_rows int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  update account_deletions set status = 'cancelled'
   where user_id = v_uid and status = 'pending';
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('status','rejected','reason','no_pending_request');
  end if;
  return jsonb_build_object('status','ok');
end $$;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------- 自分の状態 ----------
create or replace function public.my_account_deletion()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_row account_deletions;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_row from account_deletions where user_id = v_uid;
  if not found or v_row.status <> 'pending' then
    return jsonb_build_object('pending', false);
  end if;
  return jsonb_build_object('pending', true, 'scheduled_at', v_row.scheduled_at);
end $$;
revoke all on function public.my_account_deletion() from public, anon;
grant execute on function public.my_account_deletion() to authenticated;

-- ---------- 確定処理（匿名化） ----------
-- service_role 専用。pg_cron 等で日次実行する。p_dry_run=true なら対象を数えるだけ。
create or replace function public.process_account_deletions(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count int := 0; v_forfeited bigint := 0; r record; v_balance bigint;
begin
  for r in
    select d.user_id from account_deletions d
     where d.status = 'pending' and d.scheduled_at <= now()
     for update
  loop
    v_count := v_count + 1;
    select coalesce(balance, 0) into v_balance from point_wallets where user_id = r.user_id;
    v_forfeited := v_forfeited + coalesce(v_balance, 0);

    if p_dry_run then continue; end if;

    -- 1) 残高の失効。台帳は追記専用なので負の確定エントリとして残す（監査可能にする）
    if coalesce(v_balance, 0) > 0 then
      perform apply_points(r.user_id, -v_balance, 'account_closed', 'account', null,
                           'account_closed:' || r.user_id::text);
    end if;

    -- 2) PII の削除／匿名化。投稿は消さない（スレッドが壊れるため）が、
    --    表示名は profiles 由来なのでここを匿名化すれば投稿者は特定できなくなる。
    update profiles set
      username        = '退会したユーザー',
      handle          = 'deleted_' || translate(r.user_id::text, '-', ''),
      avatar_url      = null,
      bio             = null,
      date_of_birth   = null,
      age_verified_at = null,
      referral_code   = null,   -- 招待コードを無効化（退会後に使われないように）
      updated_at      = now()
    where id = r.user_id;

    -- 3) ログインできないようにする（auth のメールを無効ドメインへ退避）
    update auth.users set
      email = 'deleted+' || r.user_id::text || '@invalid',
      raw_user_meta_data = '{}'::jsonb
    where id = r.user_id;

    -- 4) 不要な個人データの物理削除
    delete from push_tokens where user_id = r.user_id;
    delete from user_genres  where user_id = r.user_id;
    delete from user_games   where user_id = r.user_id;
    delete from notifications where user_id = r.user_id;

    -- 5) 状態を deleted に（付与ガードで弾くため）
    insert into user_moderation_state(user_id, state, reason)
      values (r.user_id, 'deleted', 'account deleted')
    on conflict (user_id) do update
      set state = 'deleted', reason = 'account deleted', updated_at = now();

    -- 6) 意図的に残すもの:
    --    point_ledger      … 会計記録（追記専用・cascade で消さない）
    --    legal_acceptances … いつどの版に同意したかの証跡
    --    user_devices      … 「退会→再登録」での初回ボーナス荒稼ぎ検知に必要
    update account_deletions set status = 'completed', completed_at = now()
     where user_id = r.user_id;
  end loop;

  return jsonb_build_object('dry_run', p_dry_run, 'accounts', v_count, 'forfeited_points', v_forfeited);
end $$;
revoke all on function public.process_account_deletions(boolean) from public, anon, authenticated;

-- ---------- 退会済み端末からの再登録を検知 ----------
-- 端末に退会済みアカウントが紐づいていれば起票する。ブロックはしない
-- （家族の共有端末など正当なケースがあるため、運営がレビューする材料として残す）。
create or replace function public.register_device(
  p_device_id   text,
  p_platform    text default null,
  p_model       text default null,
  p_os_version  text default null,
  p_is_emulator boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_accounts bigint; v_warn bigint; v_mark bigint; v_flag uuid; v_deleted bigint;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_device_id is null or length(btrim(p_device_id)) = 0 then
    raise exception 'device_id required';
  end if;
  if length(p_device_id) > 200 then raise exception 'device_id too long'; end if;

  insert into user_devices(user_id, device_id, platform, model, os_version, is_emulator)
    values (v_uid, btrim(p_device_id), p_platform, p_model, p_os_version, coalesce(p_is_emulator,false))
  on conflict (user_id, device_id) do update
    set last_seen   = now(),
        platform    = coalesce(excluded.platform,   user_devices.platform),
        model       = coalesce(excluded.model,      user_devices.model),
        os_version  = coalesce(excluded.os_version, user_devices.os_version),
        is_emulator = excluded.is_emulator;

  select count(distinct user_id) into v_accounts
    from user_devices where device_id = btrim(p_device_id);

  v_warn := fraud_setting('multi_account_warn', 3);
  v_mark := fraud_setting('multi_account_mark', 5);

  if v_accounts >= v_warn then
    v_flag := raise_fraud_flag(
      v_uid, 'multi_account',
      case when v_accounts >= v_mark then 'high' else 'medium' end,
      jsonb_build_object('device_id', btrim(p_device_id), 'accounts', v_accounts)
    );
  end if;

  if v_accounts >= v_mark then
    insert into user_moderation_state(user_id, state, reason)
      values (v_uid, 'marked', 'auto: multi_account')
    on conflict (user_id) do update
      set state = case when user_moderation_state.state = 'active' then 'marked'
                       else user_moderation_state.state end,
          reason = case when user_moderation_state.state = 'active' then 'auto: multi_account'
                        else user_moderation_state.reason end,
          updated_at = now();
  end if;

  if coalesce(p_is_emulator, false) then
    perform raise_fraud_flag(v_uid, 'emulator', 'medium',
      jsonb_build_object('device_id', btrim(p_device_id), 'model', p_model, 'platform', p_platform));
  end if;

  -- 退会済みアカウントが同じ端末にある＝初回ボーナスの取り直しを疑う材料
  select count(*) into v_deleted
    from user_devices d
    join user_moderation_state m on m.user_id = d.user_id and m.state = 'deleted'
   where d.device_id = btrim(p_device_id) and d.user_id <> v_uid;
  if v_deleted > 0 then
    perform raise_fraud_flag(v_uid, 'rejoin_after_deletion', 'medium',
      jsonb_build_object('device_id', btrim(p_device_id), 'deleted_accounts', v_deleted));
  end if;

  return jsonb_build_object('ok', true, 'accounts_on_device', v_accounts, 'flagged', v_flag is not null);
end $$;
revoke all on function public.register_device(text, text, text, text, boolean) from public, anon;
grant execute on function public.register_device(text, text, text, text, boolean) to authenticated;

-- ---------- 付与ガードに 'deleted' を追加 ----------
-- 退会後に遅れて到着した postback / オファー確定で、匿名化済みアカウントに
-- 付与してしまうのを防ぐ（残高は失効済みなので、付与すると復活してしまう）。
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

  begin
    insert into postback_events(partner_id, transaction_id, click_id, status, raw, received_at)
      values (v_partner.id, p_transaction_id, p_click_id, 'received', p_raw, now())
      returning id into v_event;
  exception when unique_violation then
    return jsonb_build_object('status','duplicate','transaction_id',p_transaction_id);
  end;

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

  select state into v_modstate from user_moderation_state where user_id = v_uid;
  if v_modstate in ('banned','frozen','deleted') then
    update postback_events set status='rejected', user_id=v_uid, mission_id=v_m.id, processed_at=now() where id=v_event;
    insert into fraud_flags(user_id, flag_type, severity, detail)
      values (v_uid, 'postback_blocked_state', 'medium', jsonb_build_object('state',v_modstate,'tx',p_transaction_id));
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  if v_click.is_converted then
    update postback_events set status='duplicate', processed_at=now() where id=v_event;
    return jsonb_build_object('status','duplicate','reason','click_already_converted');
  end if;

  v_reward := v_m.reward_points;
  if p_reward_override is not null and p_reward_override > 0 and p_reward_override <= v_m.reward_points then
    v_reward := p_reward_override;
  end if;

  v_ledger := apply_points(v_uid, v_reward, 'postback', 'mission', v_m.id,
                           'postback:' || v_partner.id::text || ':' || p_transaction_id);
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
  if v_modstate in ('banned','frozen','deleted') then
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

-- ---------- 運営レビュー用 ----------
create or replace view public.admin_deletion_rows
with (security_invoker = on) as
select
  d.user_id, d.status, d.reason, d.requested_at, d.scheduled_at, d.completed_at,
  p.handle, p.username,
  coalesce(w.balance, 0) as balance
from public.account_deletions d
left join public.profiles p      on p.id = d.user_id
left join public.point_wallets w on w.user_id = d.user_id;
revoke all on public.admin_deletion_rows from public, anon, authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0027_support.sql
-- └────────────────────────────────────────────────────────
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


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0028_analytics_events.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- 0028: 行動イベント計測（ファネル / リテンション）
--
-- 0022 で「配りすぎ」は見えるようになったが、**「効いているか」が見えない**。
-- いま持っている数字は台帳だけで、
--   - ミッション表示 → タップ → 達成 のどこで落ちているか
--   - D1 / D7 リテンションがどうか
-- が一切測れず、改善のループが回らない状態だった。
--
--   1) app_events        … 行動イベント（大量に入るのでインデックスと保持期間を設計する）
--   2) record_events     … アプリからのバッチ送信（1回の往復で複数件）
--   3) analytics_daily   … DAU / イベント数の日次
--   4) event_funnel      … 名前別の日次集計（任意のファネルを組める素材）
--   5) mission_funnel    … 表示→タップ→達成 の転換率
--   6) retention_cohorts … 登録日コホートの D1 / D7 / D30 復帰率
--   7) purge_app_events  … 保持期間を過ぎた生ログの削除（集計は別途残す前提）
-- ============================================================

insert into public.app_config (key, value) values
  ('event_retention_days', '90'::jsonb),  -- 生ログの保持期間
  ('event_batch_max',      '50'::jsonb)   -- 1リクエストで受け付ける最大件数
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------- 1) イベント ----------
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  name       text not null,
  params     jsonb not null default '{}'::jsonb,
  session_id text,
  platform   text,
  created_at timestamptz not null default now()
);
-- 集計は「名前×日付」と「ユーザー×日付」で引くので、その2軸に索引を張る
create index if not exists idx_app_events_name_time on public.app_events(name, created_at desc);
create index if not exists idx_app_events_user_time on public.app_events(user_id, created_at desc);

alter table public.app_events enable row level security; -- ポリシー無し＝直接の読み書き不可

-- ---------- 2) 送信 ----------
-- アプリは複数イベントをまとめて送る（1件ごとに往復すると電池と通信を無駄にする）。
-- イベント名は形式を固定し、未知の名前でテーブルが汚れるのを防ぐ。
create or replace function public.record_events(p_events jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_max int; v_count int := 0; e jsonb; v_name text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_events) <> 'array' then raise exception 'events must be an array'; end if;

  v_max := legal_config('event_batch_max', 50)::int;
  if jsonb_array_length(p_events) > v_max then
    return jsonb_build_object('status','rejected','reason','batch_too_large','max',v_max);
  end if;

  for e in select * from jsonb_array_elements(p_events) loop
    v_name := e->>'name';
    -- 英小文字・数字・アンダースコアの 3〜50 文字。想定外の名前は黙って捨てず件数から除く。
    if v_name is null or v_name !~ '^[a-z][a-z0-9_]{2,49}$' then
      continue;
    end if;
    insert into app_events(user_id, name, params, session_id, platform)
      values (v_uid, v_name,
              coalesce(e->'params', '{}'::jsonb),
              left(coalesce(e->>'session_id',''), 64),
              left(coalesce(e->>'platform',''), 16));
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('status','ok','recorded', v_count);
end $$;
revoke all on function public.record_events(jsonb) from public, anon;
grant execute on function public.record_events(jsonb) to authenticated;

-- ---------- 3) 日次のアクティブ ----------
create or replace view public.analytics_daily
with (security_invoker = on) as
select
  d::date                                            as day,
  count(distinct e.user_id)                          as active_users,
  count(e.id)                                        as events,
  count(distinct e.session_id) filter (where e.session_id <> '') as sessions
from generate_series(current_date - 59, current_date, interval '1 day') d
left join public.app_events e
       on e.created_at >= d and e.created_at < d + interval '1 day'
group by d;
revoke all on public.analytics_daily from public, anon, authenticated;

-- ---------- 4) 名前別の日次集計 ----------
create or replace view public.event_funnel
with (security_invoker = on) as
select
  e.name,
  count(*)                    as events,
  count(distinct e.user_id)   as users,
  max(e.created_at)           as last_seen
from public.app_events e
where e.created_at > now() - interval '30 days'
group by e.name;
revoke all on public.event_funnel from public, anon, authenticated;

-- ---------- 5) ミッションのファネル ----------
-- 表示 → タップ → 達成。どこで落ちているかが分かる最小のファネル。
-- 転換率は「ユーザー数ベース」で見る（イベント数ベースだと連打で歪む）。
create or replace view public.mission_funnel
with (security_invoker = on) as
with f as (
  select
    count(distinct user_id) filter (where name = 'mission_list_view')  as viewed,
    count(distinct user_id) filter (where name = 'mission_claim_tap')  as tapped,
    count(distinct user_id) filter (where name = 'mission_claimed')    as claimed
  from public.app_events
  where created_at > now() - interval '30 days'
)
select
  viewed, tapped, claimed,
  case when viewed > 0 then round(tapped::numeric  / viewed * 100, 1) else 0 end as view_to_tap_pct,
  case when tapped > 0 then round(claimed::numeric / tapped * 100, 1) else 0 end as tap_to_claim_pct,
  case when viewed > 0 then round(claimed::numeric / viewed * 100, 1) else 0 end as overall_pct
from f;
revoke all on public.mission_funnel from public, anon, authenticated;

-- ---------- 6) リテンション ----------
-- 登録日コホートごとに、D1 / D7 / D30 に戻ってきた割合。
-- 「ちょうどその日に活動したか」を見る古典的リテンション（範囲ではなく点で見る定義）。
create or replace view public.retention_cohorts
with (security_invoker = on) as
with cohort as (
  select p.id as user_id, p.created_at::date as cohort_date
  from public.profiles p
  where p.created_at >= current_date - 90
),
activity as (
  select distinct user_id, created_at::date as day from public.app_events
)
select
  c.cohort_date,
  count(distinct c.user_id)                                                          as cohort_size,
  count(distinct a.user_id) filter (where a.day = c.cohort_date + 1)                 as d1,
  count(distinct a.user_id) filter (where a.day = c.cohort_date + 7)                 as d7,
  count(distinct a.user_id) filter (where a.day = c.cohort_date + 30)                as d30,
  case when count(distinct c.user_id) > 0
       then round(count(distinct a.user_id) filter (where a.day = c.cohort_date + 1)::numeric
                  / count(distinct c.user_id) * 100, 1) else 0 end                   as d1_pct,
  case when count(distinct c.user_id) > 0
       then round(count(distinct a.user_id) filter (where a.day = c.cohort_date + 7)::numeric
                  / count(distinct c.user_id) * 100, 1) else 0 end                   as d7_pct
from cohort c
left join activity a on a.user_id = c.user_id
group by c.cohort_date;
revoke all on public.retention_cohorts from public, anon, authenticated;

-- ---------- 7) 生ログの掃除 ----------
-- 行動ログは放置すると際限なく膨らむ。保持期間を過ぎた生ログは消す
-- （日次集計が必要なら、事前に別テーブルへ集計しておくこと）。
create or replace function public.purge_app_events(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_days int; v_count bigint;
begin
  v_days := legal_config('event_retention_days', 90)::int;
  select count(*) into v_count from app_events
   where created_at < now() - make_interval(days => v_days);

  if not p_dry_run then
    delete from app_events where created_at < now() - make_interval(days => v_days);
  end if;

  return jsonb_build_object('dry_run', p_dry_run, 'deleted', v_count, 'retention_days', v_days);
end $$;
revoke all on function public.purge_app_events(boolean) from public, anon, authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/migrations/0029_login_streak.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- 0029: 連続ログイン（ストリーク）
--
-- ポイ活のリテンション施策の定番だが実装がゼロだった。0028 で計測基盤が入ったので、
-- 導入後に D1/D7 が動いたかを検証できる状態で入れる。
--
-- ■ 設計上の注意
-- 1) 「日付」の境界をサーバ側で決める（クライアントの時計を信用すると、端末の
--    日付を進めて連続ボーナスを取り放題になる）。JST 基準で判定する。
-- 2) 報酬は claim_mission と同じく **冪等キー付き apply_points** を通す。
--    連打しても1日1回しか付与されない。
-- 3) 途切れたら1日目に戻す。ただし「同じ日に2回目」は途切れでもなく加算でもない
--    （既に受け取り済みとして拒否する）。
-- 4) 段階報酬は設定テーブルに持ち、マイグレーション無しで調整できるようにする。
-- ============================================================

-- ---------- 日付境界 ----------
-- サービスのタイムゾーン。日付の切り替わりをここで決める。
insert into public.app_config (key, value) values
  ('service_timezone', '"Asia/Tokyo"'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.service_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone
          coalesce((select value #>> '{}' from app_config where key = 'service_timezone'), 'Asia/Tokyo'))::date;
$$;
revoke all on function public.service_today() from public, anon;
grant execute on function public.service_today() to authenticated;

-- ---------- 段階報酬 ----------
create table if not exists public.streak_rewards (
  day_index     integer primary key check (day_index >= 1),  -- 連続 n 日目
  reward_points integer not null check (reward_points >= 0),
  label         text
);

insert into public.streak_rewards(day_index, reward_points, label) values
  (1, 1000,  '1日目'),
  (2, 1500,  '2日目'),
  (3, 2000,  '3日目'),
  (4, 2500,  '4日目'),
  (5, 3000,  '5日目'),
  (6, 4000,  '6日目'),
  (7, 10000, '7日目 コンプリート！')
on conflict (day_index) do nothing;

alter table public.streak_rewards enable row level security;
-- 「続けると何がもらえるか」はユーザーに見せる（継続の動機になる）
drop policy if exists streak_rewards_read on public.streak_rewards;
create policy streak_rewards_read on public.streak_rewards for select using (true);
grant select on public.streak_rewards to authenticated;

-- ---------- ストリークの状態 ----------
create table if not exists public.user_streaks (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_claim_on  date,
  total_claims   integer not null default 0,
  updated_at     timestamptz not null default now()
);

alter table public.user_streaks enable row level security;
drop policy if exists streak_self_read on public.user_streaks;
create policy streak_self_read on public.user_streaks
  for select using (auth.uid() = user_id);
grant select on public.user_streaks to authenticated;

-- ---------- 受け取り ----------
-- 連続日数は 1..(最大段階) を循環する。7日で一巡し、翌日は再び1日目から。
create or replace function public.claim_daily_streak()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date; v_row user_streaks; v_next int; v_max int;
  v_reward int; v_ledger uuid; v_modstate text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_today := service_today();

  -- BAN/凍結/退会は付与しない（他の付与経路と同じ扱い）
  select state into v_modstate from user_moderation_state where user_id = v_uid;
  if v_modstate in ('banned','frozen','deleted') then
    return jsonb_build_object('status','rejected','reason','user_'||v_modstate);
  end if;

  -- 行を確保してからロックする（同時実行で二重に進めないため）
  insert into user_streaks(user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_row from user_streaks where user_id = v_uid for update;

  if v_row.last_claim_on = v_today then
    return jsonb_build_object('status','duplicate','reason','already_claimed_today',
                              'current_streak', v_row.current_streak);
  end if;

  select coalesce(max(day_index), 1) into v_max from streak_rewards;

  -- 昨日受け取っていれば継続、それ以外（初回・途切れ）は1日目から
  if v_row.last_claim_on = v_today - 1 then
    v_next := v_row.current_streak + 1;
    if v_next > v_max then v_next := 1; end if;   -- 一巡したら最初に戻る
  else
    v_next := 1;
  end if;

  select reward_points into v_reward from streak_rewards where day_index = v_next;
  if v_reward is null then v_reward := 0; end if;

  -- 冪等キーに「ユーザー＋日付」を含める。連打しても1日1回だけ付与される。
  if v_reward > 0 then
    v_ledger := apply_points(v_uid, v_reward, 'streak', 'streak', null,
                             'streak:' || v_uid::text || ':' || v_today::text);
  end if;

  update user_streaks set
    current_streak = v_next,
    longest_streak = greatest(longest_streak, v_next),
    last_claim_on  = v_today,
    total_claims   = total_claims + 1,
    updated_at     = now()
  where user_id = v_uid;

  return jsonb_build_object(
    'status','ok',
    'streak', v_next,
    'reward', v_reward,
    'completed', v_next = v_max,     -- 一巡した（次回は1日目に戻る）
    'ledger_id', v_ledger
  );
end $$;
revoke all on function public.claim_daily_streak() from public, anon;
grant execute on function public.claim_daily_streak() to authenticated;

-- ---------- 状態照会 ----------
-- 「今日受け取れるか」「次にいくらもらえるか」をアプリに返す。
create or replace function public.my_streak()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today date; v_row user_streaks; v_next int; v_max int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_today := service_today();
  select * into v_row from user_streaks where user_id = v_uid;
  select coalesce(max(day_index), 1) into v_max from streak_rewards;

  -- 次に受け取る段階（今日まだ受け取っていない場合の見込み）
  if v_row.last_claim_on = v_today - 1 then
    v_next := v_row.current_streak + 1;
    if v_next > v_max then v_next := 1; end if;
  else
    v_next := 1;
  end if;

  return jsonb_build_object(
    'current_streak', coalesce(v_row.current_streak, 0),
    'longest_streak', coalesce(v_row.longest_streak, 0),
    'claimed_today',  coalesce(v_row.last_claim_on = v_today, false),
    'next_day_index', v_next,
    'next_reward',    coalesce((select reward_points from streak_rewards where day_index = v_next), 0),
    'max_day_index',  v_max,
    -- 直前まで続いていた連続が途切れているか（UIで「リセットされました」を出すため）
    'broken', v_row.last_claim_on is not null
              and v_row.last_claim_on < v_today - 1
              and coalesce(v_row.current_streak, 0) > 1
  );
end $$;
revoke all on function public.my_streak() from public, anon;
grant execute on function public.my_streak() to authenticated;

-- ---------- 運営の可視化 ----------
-- ストリークが実際にリテンションへ効いているかを見る（0028 の計測と併せて判断する）。
create or replace view public.admin_streak_summary
with (security_invoker = on) as
select
  count(*)                                                as users_with_streak,
  count(*) filter (where current_streak >= 3)              as streak_3plus,
  count(*) filter (where current_streak >= 7)              as streak_7plus,
  count(*) filter (where last_claim_on = public.service_today())     as claimed_today,
  count(*) filter (where last_claim_on = public.service_today() - 1) as claimed_yesterday,
  coalesce(round(avg(current_streak), 2), 0)               as avg_current_streak,
  coalesce(max(longest_streak), 0)                         as best_streak
from public.user_streaks;
revoke all on public.admin_streak_summary from public, anon, authenticated;


-- ┌────────────────────────────────────────────────────────
-- │ supabase/seed.sql
-- └────────────────────────────────────────────────────────
-- ============================================================
-- MasterGame — seed data (catalogs). Run after migrations.
-- ============================================================

-- VIP tiers (staking rate in bps: 100 = 1.0% / 月)
insert into public.vip_tiers (name, min_xp, staking_rate_bps, point_boost_bps, sort) values
  ('ブロンズ',     0,   100, 300, 1),
  ('シルバー',  3000,   150, 500, 2),
  ('ゴールド', 10000,   200, 700, 3),
  ('プラチナ', 30000,   300, 900, 4),
  ('ダイヤ',   80000,   500,1100, 5);

-- ad networks
insert into public.ad_networks (code, name, priority) values
  ('applovin','AppLovin',10),('tapjoy','Tapjoy',20),
  ('ironsource','ironSource',30),('pollfish','PollFish',40);

-- games (genre-based)
-- games（タイトル別掲示板は insert 時に自動生成される＝0025 の trg_game_forum）
-- 実在タイトルではなくプロトタイプ用の作例。運営が管理画面から差し替える前提。
insert into public.games (slug, name, genre, description, platforms, is_featured) values
  ('eldia','エルディア戦記','rpg','王道ファンタジーRPG。パーティ編成と属性相性が肝。', array['ios','android'], true),
  ('monster','モンスターアリーナ','strategy','モンスターを育てて競う対戦ストラテジー。', array['ios','android','pc'], true),
  ('starfall','スターフォール','shooter','爽快な弾幕シューティング。週替りのランキング戦。', array['ios','android'], false),
  ('puzzle-kingdom','パズルキングダム','puzzle','連鎖を繋ぐパズル。デイリーの詰めパズルが人気。', array['ios','android'], false),
  ('sengoku','戦国アリーナ','strategy','戦国武将を集めて領地を広げるシミュレーション。', array['ios','android','pc'], false);

-- missions （reward_points は 1,000P=1円 換算。xp_reward は活動量ベースで独立）
insert into public.missions (type, title, reward_points, xp_reward, icon, max_progress, requires_verification) values
  ('daily','攻略記事を1本読む',3000,30,'news',1,false),
  ('daily','公式Xのポストを見る',2000,20,'x',1,false),
  ('daily','ログインボーナスを受け取る',1000,10,'check',1,false),
  ('weekly','デイリーミッションを5日達成',20000,200,'target',5,false),
  ('achievement','累計1,000,000P獲得',50000,500,'crown',1000000,false),
  ('event','『エルディア戦記』事前登録',50000,500,'sword',1,true),    -- 要postback検証
  ('offer','『パズルキングダム』をインストール',80000,300,'game',1,true);

-- exchange items
insert into public.exchange_items (name, game_id, cost_points, delivery_method, stock, sort)
select v.name, g.id, v.cost, v.method, v.stock, v.sort
from (values
  ('ゲーム内通貨 1,000','eldia',80000,'code',null,1),
  ('スタミナ回復ドリンク ×5','eldia',30000,'code',null,2),
  ('ガチャチケット ×3','monster',150000,'api',120,3),
  ('限定レアキャラ確定チケット','monster',120000,'code',0,4),
  ('プレミアム装備スキン','starfall',160000,'code',null,5),
  ('Amazonギフト券 500円分',null,500000,'csv',58,6)   -- 500円 ÷ (1000P=1円) = 500,000P
) as v(name,gslug,cost,method,stock,sort)
left join public.games g on g.slug = v.gslug;

-- ad partners（postback 検証の相手。sandbox の署名鍵は Vault 参照名で保持）
-- 検証には環境変数 POSTBACK_SECRET_SANDBOX を設定する（.env.example 参照）。
insert into public.ad_partners (name, slug, signing_secret_ref, allowed_ips, attribution_window, postback_mode, status) values
  ('Sandbox Partner','sandbox','vault:POSTBACK_SECRET_SANDBOX', null, interval '24 hours','sandbox','active');

-- 検証が必要なミッション（event/offer）を sandbox パートナーへ紐づける（postback パスを E2E 可能に）
update public.missions m
  set partner_id = (select id from public.ad_partners where slug = 'sandbox')
  where m.requires_verification and m.partner_id is null;

-- offers（offerwall。ad_networks に紐づく）。offer_url は本番でネットワーク SDK/API が払い出す。
insert into public.offers (network_id, external_id, title, description, reward_points, event_type, status, offer_url)
select n.id, v.ext, v.title, v.descr, v.reward, v.evt, 'active', v.url
from (values
  ('applovin','of-install-001','新作RPGをインストール','インストール後に起動で達成',60000,'install','https://example.com/offer/of-install-001'),
  ('tapjoy','of-purchase-002','ショップで初回購入','初回課金で達成',200000,'purchase','https://example.com/offer/of-purchase-002'),
  ('pollfish','of-survey-003','アンケートに回答','約5分のアンケート',12000,'survey','https://example.com/offer/of-survey-003')
) as v(netcode,ext,title,descr,reward,evt,url)
join public.ad_networks n on n.code = v.netcode;

-- public forum（author設定はアプリ層/サインアップ後に作成想定。ここは構造例）
-- ゲームタイトル別の掲示板は games への insert で自動生成される（0025 の trg_game_forum）ため、
-- ここでは作らない。手で作ると1タイトル2掲示板になってしまう。
insert into public.forums (slug, name, description, type) values
  ('lounge','公開ラウンジ','なんでも雑談OKの広場','public');

