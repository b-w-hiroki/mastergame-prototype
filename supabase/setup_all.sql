-- ============================================================
-- MasterGame — 一括セットアップSQL（自動生成）
-- Supabase Studio の SQL Editor にこの内容を全て貼り付けて Run。
-- 内容 = migrations 0001〜0012 ＋ seed.sql（この順で実行）。
-- 新規プロジェクトで1回だけ実行してください。
-- 元ファイルを編集した場合は scripts/build-setup-sql.sh で再生成。
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

-- ポイント→円換算ヘルパー
create or replace function public.points_to_yen(p bigint) returns numeric
  language sql stable as $$ select round(p::numeric / public.point_yen_rate()); $$;

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
     where delta > 0 and status = 'confirmed'))                                        as distributed_yen,
  public.points_to_yen((select coalesce(sum(-delta),0) from public.point_ledger
     where delta < 0 and reason = 'exchange' and status = 'confirmed'))                as exchanged_yen;


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
insert into public.games (slug, name, genre) values
  ('eldia','エルディア戦記','rpg'),
  ('monster','モンスターアリーナ','strategy'),
  ('starfall','スターフォール','shooter'),
  ('puzzle-kingdom','パズルキングダム','puzzle'),
  ('sengoku','戦国アリーナ','strategy');

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

-- public forum + a couple topics (author設定はアプリ層/サインアップ後に作成想定。ここは構造例)
insert into public.forums (slug, name, description, type) values
  ('lounge','公開ラウンジ','なんでも雑談OKの広場','public'),
  ('eldia-guild','エルディア戦記 ギルド','攻略・パーティ募集・質問','game');

