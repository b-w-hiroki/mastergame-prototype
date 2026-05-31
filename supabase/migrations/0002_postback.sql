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
