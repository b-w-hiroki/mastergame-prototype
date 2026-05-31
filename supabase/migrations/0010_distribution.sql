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
