-- ============================================================
-- ポイント経済の集計ビュー（0022）
--   - economy_daily: 日次の発行/消費/交換、取引ゼロの日も欠測しない
--   - economy_by_reason: 経路別の内訳
--   - economy_liability: 未交換残高＝将来債務
--   - admin_economy_summary: 交換率・1人あたり発行・実コスト
--   - 権限: クライアントロールから参照不可
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('55555555-0000-0000-0000-000000000001');
select test.new_user('55555555-0000-0000-0000-000000000002');

-- 既存 seed の影響を受けないよう、この検証の前に台帳を空にする（トランザクション内なので安全）。
-- point_ledger は追記専用（0013 のトリガで DELETE 禁止）だが、seed は台帳を作らないため
-- ここでの DELETE は 0 行＝行トリガは発火しない。念のため空であることを先に確認する。
select test.eq((select count(*)::int from point_ledger), 0, 'ledger starts empty');
delete from point_wallets;

-- ---------- 発行ゼロの状態でゼロ除算しない（新規環境で落ちないこと） ----------
-- 追記専用のため「後から空に戻す」ことはできない。空の今のうちに検証する。
select test.eq((select redemption_rate_pct from admin_economy_summary), 0::numeric, 'no division by zero when nothing issued');
select test.eq((select issued_yen_per_user_30d from admin_economy_summary), 0::numeric, 'per-user is zero when no users');
select test.eq((select outstanding_points from economy_liability), 0::bigint, 'no liability when nothing issued');

-- user1: 発行 1000 → 交換 400 / user2: 発行 500
select public.apply_points('55555555-0000-0000-0000-000000000001', 1000, 'mission');
select public.apply_points('55555555-0000-0000-0000-000000000001', -400, 'exchange');
select public.apply_points('55555555-0000-0000-0000-000000000002', 500, 'offer');

-- ---------- economy_daily ----------
select test.eq((select issued_points from economy_daily where day = current_date), 1500::bigint, 'daily issued');
select test.eq((select spent_points from economy_daily where day = current_date), 400::bigint, 'daily spent');
select test.eq((select exchanged_points from economy_daily where day = current_date), 400::bigint, 'daily exchanged');
select test.eq((select earning_users from economy_daily where day = current_date), 2::bigint, 'daily earning users');
select test.eq((select earn_events from economy_daily where day = current_date), 2::bigint, 'daily earn events');

-- 取引ゼロの日も行として存在し、0 で埋まる（グラフが日付をスキップしない）
select test.eq((select count(*)::int from economy_daily), 60, 'daily view spans 60 days');
select test.eq((select issued_points from economy_daily where day = current_date - 5), 0::bigint, 'quiet day is zero, not missing');
select test.eq((select earning_users from economy_daily where day = current_date - 5), 0::bigint, 'quiet day has zero users');

-- ---------- economy_by_reason ----------
select test.eq((select issued_points from economy_by_reason where reason = 'mission'), 1000::bigint, 'reason mission issued');
select test.eq((select issued_points from economy_by_reason where reason = 'offer'), 500::bigint, 'reason offer issued');
select test.eq((select spent_points from economy_by_reason where reason = 'exchange'), 400::bigint, 'reason exchange spent');
select test.eq((select users from economy_by_reason where reason = 'mission'), 1::bigint, 'reason user count');

-- ---------- economy_liability（未交換残高＝将来債務） ----------
-- user1: 1000-400=600, user2: 500 → 合計 1100
select test.eq((select outstanding_points from economy_liability), 1100::bigint, 'outstanding = issued - spent');
select test.eq((select holders from economy_liability), 2::bigint, 'holders with positive balance');
select test.eq((select max_balance from economy_liability), 600::bigint, 'max balance');
-- 実コストは額面以下（交換先ミックスを通すため）
select test.ok((select outstanding_real_cost_yen <= outstanding_yen from economy_liability), 'real cost does not exceed face value');

-- ---------- admin_economy_summary ----------
select test.eq((select issued_30d from admin_economy_summary), 1500::bigint, 'summary issued 30d');
select test.eq((select exchanged_30d from admin_economy_summary), 400::bigint, 'summary exchanged 30d');
select test.eq((select earning_users_30d from admin_economy_summary), 2::bigint, 'summary earning users');
-- 交換率 = 400/1500 = 26.7%
select test.eq((select redemption_rate_pct from admin_economy_summary), 26.7::numeric, 'redemption rate');
select test.eq((select outstanding_points from admin_economy_summary), 1100::bigint, 'summary carries liability');
select test.ok((select payout_ratio_pct > 0 from admin_economy_summary), 'payout ratio exposed');
select test.ok((select effective_cost_rate_pct > 0 from admin_economy_summary), 'effective cost rate exposed');

-- ---------- 権限 ----------
select test.eq(has_table_privilege('authenticated', 'public.economy_daily', 'select'), false, 'economy_daily hidden from authenticated');
select test.eq(has_table_privilege('anon', 'public.economy_daily', 'select'), false, 'economy_daily hidden from anon');
select test.eq(has_table_privilege('authenticated', 'public.economy_liability', 'select'), false, 'economy_liability hidden from authenticated');
select test.eq(has_table_privilege('authenticated', 'public.admin_economy_summary', 'select'), false, 'admin_economy_summary hidden from authenticated');
select test.eq(has_table_privilege('authenticated', 'public.economy_by_reason', 'select'), false, 'economy_by_reason hidden from authenticated');

rollback;
