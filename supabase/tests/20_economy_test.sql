-- ============================================================
-- 経済パステスト（0011/0015/0016/0017）
--   - postback 冪等 + reversal
--   - staking 月次付与（冪等）
--   - offer 確定（冪等 + 日次上限）
--   - exchange fulfill / cancel（返金＋在庫戻し）
--   - bounty ベストアンサーの二重付与防止
-- ============================================================
\set ON_ERROR_STOP on
begin;

-- ===== postback 冪等 + reversal =====
select test.new_user('22222222-0000-0000-0000-000000000001');
insert into ad_partners(id,name,slug,signing_secret_ref,status)
  values ('22222222-0000-0000-0000-0000000000f1','P','ptest','vault:x','active');
insert into missions(id,type,title,reward_points,requires_verification,partner_id,is_active)
  values ('22222222-0000-0000-0000-0000000000a1','offer','v',5000,true,'22222222-0000-0000-0000-0000000000f1',true);
insert into mission_clicks(click_id,user_id,mission_id,partner_id,expires_at,is_converted)
  values ('ck-1','22222222-0000-0000-0000-000000000001','22222222-0000-0000-0000-0000000000a1','22222222-0000-0000-0000-0000000000f1', now()+interval '1 hour', false);

select test.eq(public.confirm_postback('ptest','tx-1','ck-1',null,'{}')->>'status', 'accepted', 'postback accepted');
select test.eq(public.confirm_postback('ptest','tx-1','ck-1',null,'{}')->>'status', 'duplicate', 'postback duplicate blocked');
select test.eq((select balance from point_wallets where user_id='22222222-0000-0000-0000-000000000001'), 5000::bigint, 'granted once');
select test.eq((select count(*) from point_ledger where reason='postback' and user_id='22222222-0000-0000-0000-000000000001'), 1::bigint, 'single postback ledger row');

select test.eq(public.reverse_postback('ptest','tx-1','fraud')->>'status', 'reversed', 'reversal ok');
select test.eq(public.reverse_postback('ptest','tx-1','fraud')->>'status', 'duplicate', 'double reversal blocked');
select test.eq((select balance from point_wallets where user_id='22222222-0000-0000-0000-000000000001'), 0::bigint, 'balance back to zero after reversal');

-- ===== staking（VIP tiers は seed 済み。xp で rate 決定） =====
select test.new_user('22222222-0000-0000-0000-000000000002');
insert into missions(id,type,title,reward_points,xp_reward,is_active)
  values ('22222222-0000-0000-0000-0000000000a2','achievement','s',100000,5000,true);
select test.set_uid('22222222-0000-0000-0000-000000000002');
select public.claim_mission('22222222-0000-0000-0000-0000000000a2');   -- balance 100000, xp 5000 (silver 150bps)
select test.eq(public.accrue_staking(date '2026-08-01')->>'ok', 'true', 'accrue ok');
select public.accrue_staking(date '2026-08-01');  -- idempotent
select test.eq((select count(*) from staking_accruals where user_id='22222222-0000-0000-0000-000000000002'), 1::bigint, 'one accrual (idempotent)');
select test.eq((select accrued_points from staking_accruals where user_id='22222222-0000-0000-0000-000000000002'), 1500::int, 'accrued 1.5% of 100000');

-- ===== offer 確定（冪等 + 日次上限） =====
select test.eq(public.confirm_offer('applovin','otx-1','22222222-0000-0000-0000-000000000002',null,6000)->>'status', 'accepted', 'offer accepted');
select test.eq(public.confirm_offer('applovin','otx-1','22222222-0000-0000-0000-000000000002',null,6000)->>'status', 'duplicate', 'offer duplicate blocked');
update app_config set value='1'::jsonb where key='daily_offer_cap';
select test.eq(public.confirm_offer('applovin','otx-2','22222222-0000-0000-0000-000000000002',null,6000)->>'reason', 'daily_cap_reached', 'daily cap enforced');

-- ===== exchange fulfill / cancel =====
insert into exchange_items(id,name,cost_points,stock,is_active)
  values ('22222222-0000-0000-0000-0000000000b2','it',5000,3,true);
select test.set_uid('22222222-0000-0000-0000-000000000002');
select public.request_exchange('22222222-0000-0000-0000-0000000000b2')->>'request_id' as rid \gset
select test.eq((select stock from exchange_items where id='22222222-0000-0000-0000-0000000000b2'), 2::int, 'stock decremented on request');
select test.eq(public.fulfill_exchange(:'rid','CODE-1')->>'status', 'fulfilled', 'fulfill ok');
select test.eq((select code from exchange_requests where id=:'rid'), 'CODE-1', 'code set');
-- cancel path
select public.request_exchange('22222222-0000-0000-0000-0000000000b2')->>'request_id' as rid2 \gset
select public.cancel_exchange(:'rid2','t');
select test.eq((select status from exchange_requests where id=:'rid2'), 'cancelled', 'cancelled');
select test.eq((select stock from exchange_items where id='22222222-0000-0000-0000-0000000000b2'), 2::int, 'stock restored on cancel');

-- ===== bounty ベストアンサー二重付与防止 =====
select test.new_user('22222222-0000-0000-0000-000000000003');  -- answerer
insert into forums(id,slug,name,type,visibility,is_open)
  values ('22222222-0000-0000-0000-0000000000c1','g','G','public','listed',true);
select test.set_uid('22222222-0000-0000-0000-000000000002');   -- asker (has points)
select public.create_topic('22222222-0000-0000-0000-0000000000c1','question','Q','body',500)->>'topic_id' as tid \gset
select test.set_uid('22222222-0000-0000-0000-000000000003');
select public.add_reply(:'tid','answer')->>'post_id' as pid \gset
select test.set_uid('22222222-0000-0000-0000-000000000002');
select test.eq(public.set_best_answer(:'tid',:'pid')->>'ok', 'true', 'best answer set');
select test.raises($$ select public.set_best_answer('$$ || :'tid' || $$','$$ || :'pid' || $$') $$, 'second best-answer pick rejected');
select test.eq((select count(*) from point_ledger where reason='bounty_award' and user_id='22222222-0000-0000-0000-000000000003'), 1::bigint, 'bounty awarded exactly once');

rollback;
