-- ============================================================
-- セキュリティ不変条件テスト（0013/0015）
--   - 内部関数 apply_points はクライアントロールから実行不可
--   - claim_mission は期間内で冪等（連打しても1回分のみ）
--   - request_exchange の在庫はアトミック（oversell しない）
--   - point_ledger は追記専用（UPDATE/DELETE 不可）
-- ============================================================
\set ON_ERROR_STOP on
begin;

-- 権限：付与の内部口はクライアントから叩けない
select test.ok(not has_function_privilege('anon','public.apply_points(uuid,bigint,text,text,uuid,text)','execute'), 'apply_points not executable by anon');
select test.ok(not has_function_privilege('authenticated','public.apply_points(uuid,bigint,text,text,uuid,text)','execute'), 'apply_points not executable by authenticated');
select test.ok(not has_function_privilege('anon','public.confirm_postback(text,text,text,integer,jsonb)','execute'), 'confirm_postback not executable by anon');
select test.ok(not has_function_privilege('authenticated','public.claim_mission(uuid)','execute') = false, 'claim_mission IS executable by authenticated');

-- 管理ビューはクライアントロールから参照不可
select test.ok(not has_table_privilege('anon','public.admin_user_rows','select'), 'admin_user_rows not readable by anon');
select test.ok(not has_table_privilege('authenticated','public.admin_user_rows','select'), 'admin_user_rows not readable by authenticated');

-- ビューは security_invoker（reloptions は 'on' で格納される）
select test.eq(
  (select option_value from pg_options_to_table((select reloptions from pg_class where relname='admin_user_rows')) where option_name='security_invoker'),
  'on', 'admin_user_rows is security_invoker');

-- --- claim_mission 冪等 ---
select test.new_user('11111111-0000-0000-0000-000000000001');
insert into missions(id,type,title,reward_points,xp_reward,is_active)
  values ('11111111-0000-0000-0000-0000000000a1','daily','t',100,10,true);
select test.set_uid('11111111-0000-0000-0000-000000000001');
select public.claim_mission('11111111-0000-0000-0000-0000000000a1');
select test.raises($$ select public.claim_mission('11111111-0000-0000-0000-0000000000a1') $$, 'second daily claim rejected');
select test.eq((select balance from point_wallets where user_id='11111111-0000-0000-0000-000000000001'), 100::bigint, 'balance is single reward after double claim');
select test.eq((select count(*) from mission_completions where user_id='11111111-0000-0000-0000-000000000001'), 1::bigint, 'one completion row');

-- --- request_exchange 在庫アトミック ---
insert into exchange_items(id,name,cost_points,stock,is_active)
  values ('11111111-0000-0000-0000-0000000000b1','stock1',50,1,true);
select public.request_exchange('11111111-0000-0000-0000-0000000000b1');  -- ok, stock 1→0
select test.raises($$ select public.request_exchange('11111111-0000-0000-0000-0000000000b1') $$, 'second exchange out of stock');
select test.eq((select stock from exchange_items where id='11111111-0000-0000-0000-0000000000b1'), 0::int, 'stock floored at 0 (no oversell)');
select test.eq((select balance from point_wallets where user_id='11111111-0000-0000-0000-000000000001'), 50::bigint, 'balance debited once');

-- --- point_ledger 追記専用 ---
select test.raises($$ update point_ledger set delta=999 where user_id='11111111-0000-0000-0000-000000000001' $$, 'ledger UPDATE rejected');
select test.raises($$ delete from point_ledger where user_id='11111111-0000-0000-0000-000000000001' $$, 'ledger DELETE rejected');

rollback;
