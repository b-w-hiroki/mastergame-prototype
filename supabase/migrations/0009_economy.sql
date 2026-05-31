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
