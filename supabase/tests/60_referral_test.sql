-- ============================================================
-- 招待・リファラル（0023）
--   - コード発行・自己招待禁止・1人1回・無効コード
--   - 同一端末の招待を拒否（0021 の user_devices と連動）＋ fraud_flags 起票
--   - 新規アカウントのみ被招待可 / BAN・凍結は対象外 / 招待者の日次上限
--   - 招待者への報酬はマイルストーン到達で確定（捨てアカでは払われない）
--   - 権限
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('66666666-0000-0000-0000-000000000001'); -- 招待者
select test.new_user('66666666-0000-0000-0000-000000000002'); -- 被招待者（正常）
select test.new_user('66666666-0000-0000-0000-000000000003'); -- 同一端末（不正）
select test.new_user('66666666-0000-0000-0000-000000000004'); -- 古いアカウント
select test.new_user('66666666-0000-0000-0000-000000000005'); -- BAN 済み招待者

-- ---------- コード発行 ----------
select test.set_uid('66666666-0000-0000-0000-000000000001');
select test.ok((select (public.my_referral_status()->>'code') ~ '^[2-9A-HJ-NP-Z]{8}$'), 'code is 8 chars without confusing glyphs');
select test.eq((select (public.my_referral_status()->>'confirmed')::int), 0, 'no confirmed referrals yet');

-- 新規ユーザーには自動で付与されている（handle_new_user）
select test.ok((select referral_code is not null from profiles where id='66666666-0000-0000-0000-000000000002'), 'new user gets a code automatically');
-- コードは一意
select test.eq((select count(distinct referral_code)::int from profiles where referral_code is not null),
               (select count(*)::int from profiles where referral_code is not null), 'codes are unique');

-- ---------- 自己招待の禁止 ----------
select test.eq(
  (select public.redeem_referral_code((select referral_code from profiles where id='66666666-0000-0000-0000-000000000001'))->>'reason'),
  'self_referral', 'self referral rejected');

-- ---------- 無効コード ----------
select test.set_uid('66666666-0000-0000-0000-000000000002');
select test.eq((select public.redeem_referral_code('ZZZZZZZZ')->>'reason'), 'invalid_code', 'unknown code rejected');

-- ---------- 正常な招待 ----------
select test.eq(
  (select public.redeem_referral_code((select referral_code from profiles where id='66666666-0000-0000-0000-000000000001'))->>'status'),
  'ok', 'valid referral accepted');
-- 被招待者には即時付与
select test.eq((select balance from point_wallets where user_id='66666666-0000-0000-0000-000000000002'), 30000::bigint, 'referee rewarded immediately');
select test.eq((select status from referrals where referee_id='66666666-0000-0000-0000-000000000002'), 'pending', 'referral starts pending');
-- 招待者にはまだ入らない（マイルストーン未達）
select test.eq((select coalesce(balance,0) from point_wallets where user_id='66666666-0000-0000-0000-000000000001'), 0::bigint, 'referrer not yet rewarded');

-- 二重利用は不可
select test.eq((select public.redeem_referral_code((select referral_code from profiles where id='66666666-0000-0000-0000-000000000001'))->>'reason'),
               'already_referred', 'cannot be referred twice');

-- ---------- マイルストーン到達で招待者に確定 ----------
-- 招待ボーナス自体はマイルストーンに数えない（それだけで達成しないこと）
select public.try_confirm_referral('66666666-0000-0000-0000-000000000002');
select test.eq((select status from referrals where referee_id='66666666-0000-0000-0000-000000000002'), 'pending', 'signup bonus alone does not confirm');

-- 実際の獲得を積む → 確定
select public.apply_points('66666666-0000-0000-0000-000000000002', 10000, 'mission');
select public.try_confirm_referral('66666666-0000-0000-0000-000000000002');
select test.eq((select status from referrals where referee_id='66666666-0000-0000-0000-000000000002'), 'confirmed', 'confirmed after milestone');
select test.eq((select balance from point_wallets where user_id='66666666-0000-0000-0000-000000000001'), 50000::bigint, 'referrer rewarded at milestone');

-- 再実行しても二重付与しない（冪等キー）
select public.try_confirm_referral('66666666-0000-0000-0000-000000000002');
select test.eq((select balance from point_wallets where user_id='66666666-0000-0000-0000-000000000001'), 50000::bigint, 'no double payout on retry');
select test.eq((select (public.my_referral_status()->>'confirmed')::int from (select test.set_uid('66666666-0000-0000-0000-000000000001')) s), 1, 'status reports confirmed count');

-- ---------- 同一端末の招待を拒否（①との連動） ----------
select test.set_uid('66666666-0000-0000-0000-000000000001');
select public.register_device('shared-dev');
select test.set_uid('66666666-0000-0000-0000-000000000003');
select public.register_device('shared-dev');
select test.eq(
  (select public.redeem_referral_code((select referral_code from profiles where id='66666666-0000-0000-0000-000000000001'))->>'reason'),
  'same_device', 'same-device referral rejected');
-- 不正フラグが立つ
select test.eq((select count(*)::int from fraud_flags where flag_type='referral_same_device' and user_id='66666666-0000-0000-0000-000000000003'), 1, 'same-device referral raises a fraud flag');
select test.eq((select severity from fraud_flags where flag_type='referral_same_device'), 'high', 'flagged as high severity');
-- 付与も記録もされない
select test.eq((select coalesce(balance,0) from point_wallets where user_id='66666666-0000-0000-0000-000000000003'), 0::bigint, 'no points for same-device referral');
select test.eq((select count(*)::int from referrals where referee_id='66666666-0000-0000-0000-000000000003'), 0, 'no referral row created');

-- ---------- 新規アカウントのみ被招待可 ----------
update profiles set created_at = now() - interval '30 days' where id='66666666-0000-0000-0000-000000000004';
select test.set_uid('66666666-0000-0000-0000-000000000004');
select test.eq(
  (select public.redeem_referral_code((select referral_code from profiles where id='66666666-0000-0000-0000-000000000001'))->>'reason'),
  'account_too_old', 'old account cannot be referred');

-- ---------- BAN/凍結は対象外 ----------
insert into user_moderation_state(user_id, state, reason) values ('66666666-0000-0000-0000-000000000005','banned','test')
  on conflict (user_id) do update set state='banned';
select test.set_uid('66666666-0000-0000-0000-000000000004');
update profiles set created_at = now() where id='66666666-0000-0000-0000-000000000004'; -- 年齢条件は満たす
select test.eq(
  (select public.redeem_referral_code((select referral_code from profiles where id='66666666-0000-0000-0000-000000000005'))->>'reason'),
  'moderated', 'banned referrer rejected');

-- 保留中に招待者が処分されたら確定させない
select test.new_user('66666666-0000-0000-0000-000000000006');
select test.new_user('66666666-0000-0000-0000-000000000007');
select test.set_uid('66666666-0000-0000-0000-000000000007');
select public.redeem_referral_code((select referral_code from profiles where id='66666666-0000-0000-0000-000000000006'));
insert into user_moderation_state(user_id, state, reason) values ('66666666-0000-0000-0000-000000000006','frozen','test')
  on conflict (user_id) do update set state='frozen';
select public.apply_points('66666666-0000-0000-0000-000000000007', 10000, 'mission');
select public.try_confirm_referral('66666666-0000-0000-0000-000000000007');
select test.eq((select status from referrals where referee_id='66666666-0000-0000-0000-000000000007'), 'rejected', 'frozen referrer is not paid');
select test.eq((select coalesce(balance,0) from point_wallets where user_id='66666666-0000-0000-0000-000000000006'), 0::bigint, 'no payout to frozen referrer');

-- ---------- 招待者の日次上限 ----------
update app_config set value = '1'::jsonb where key = 'referral_referrer_daily_cap';
select test.new_user('66666666-0000-0000-0000-000000000008');
select test.new_user('66666666-0000-0000-0000-000000000009');
select test.new_user('66666666-0000-0000-0000-00000000000a');
select test.set_uid('66666666-0000-0000-0000-000000000009');
select test.eq((select public.redeem_referral_code((select referral_code from profiles where id='66666666-0000-0000-0000-000000000008'))->>'status'), 'ok', 'first referral within cap');
select test.set_uid('66666666-0000-0000-0000-00000000000a');
select test.eq((select public.redeem_referral_code((select referral_code from profiles where id='66666666-0000-0000-0000-000000000008'))->>'reason'), 'referrer_daily_cap', 'daily cap enforced');
update app_config set value = '10'::jsonb where key = 'referral_referrer_daily_cap';

-- ---------- 権限 ----------
select test.eq(has_function_privilege('anon', 'public.redeem_referral_code(text)', 'execute'), false, 'redeem not executable by anon');
select test.eq(has_function_privilege('authenticated', 'public.redeem_referral_code(text)', 'execute'), true, 'redeem executable by authenticated');
select test.eq(has_function_privilege('authenticated', 'public.my_referral_status()', 'execute'), true, 'status executable by authenticated');
select test.eq(has_function_privilege('authenticated', 'public.try_confirm_referral(uuid)', 'execute'), false, 'confirm is internal only');
select test.eq(has_function_privilege('authenticated', 'public.gen_referral_code()', 'execute'), false, 'code generator is internal only');
select test.eq(has_table_privilege('authenticated', 'public.admin_referral_rows', 'select'), false, 'admin view hidden from authenticated');
select test.eq((select relrowsecurity from pg_class where relname='referrals'), true, 'referrals RLS enabled');

rollback;
