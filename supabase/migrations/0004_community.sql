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
