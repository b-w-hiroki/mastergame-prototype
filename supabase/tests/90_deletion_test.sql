-- ============================================================
-- アカウント削除（0026）
--   - 申請 / 取消 / 状態照会・猶予期間
--   - 確定処理: PII 匿名化・残高失効・ログイン不能化
--   - **台帳が消えないこと**（cascade で会計が壊れないことの回帰テスト）
--   - 意図的に残すもの（同意記録・端末の紐付け）
--   - 退会後の postback / オファー確定をブロック
--   - 退会済み端末からの再登録を検知
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('99999999-0000-0000-0000-000000000001');
select test.new_user('99999999-0000-0000-0000-000000000002');
select test.new_user('99999999-0000-0000-0000-000000000003');

-- ---------- 申請 ----------
select test.set_uid('99999999-0000-0000-0000-000000000001');
select public.apply_points('99999999-0000-0000-0000-000000000001', 5000, 'mission');
select public.accept_legal('terms', '2026-07-01');

select test.eq((select public.request_account_deletion('もう使わない')->>'status'), 'ok', 'deletion requested');
select test.eq((select status from account_deletions where user_id='99999999-0000-0000-0000-000000000001'), 'pending', 'status is pending');
-- 残高がある場合は失効することを明示的に知らせる（黙って消さない）
select test.eq((select (public.request_account_deletion()->>'balance')::bigint), 5000::bigint, 'balance surfaced to the user');
select test.ok((select public.request_account_deletion()->>'notice' like '%失効%'), 'forfeiture is stated up front');

-- 猶予期間中は即時削除されない
select test.eq((select (public.process_account_deletions(true)->>'accounts')::int), 0, 'not due during the grace period');
select test.eq((select pending from (select (public.my_account_deletion()->>'pending')::boolean as pending) s), true, 'app can see the pending request');

-- ---------- 取消 ----------
select test.eq((select public.cancel_account_deletion()->>'status'), 'ok', 'cancelled');
select test.eq((select status from account_deletions where user_id='99999999-0000-0000-0000-000000000001'), 'cancelled', 'status is cancelled');
select test.eq((select (public.my_account_deletion()->>'pending')::boolean), false, 'no longer pending');
-- 保留が無ければ取消はできない
select test.eq((select public.cancel_account_deletion()->>'reason'), 'no_pending_request', 'cannot cancel without a request');

-- ---------- 確定処理 ----------
select public.request_account_deletion();
-- 猶予を過ぎさせる
update account_deletions set scheduled_at = now() - interval '1 day' where user_id='99999999-0000-0000-0000-000000000001';

-- dry run では何も変わらない
select test.eq((select (public.process_account_deletions(true)->>'accounts')::int), 1, 'dry run finds the due account');
select test.eq((select (public.process_account_deletions(true)->>'forfeited_points')::bigint), 5000::bigint, 'dry run reports forfeiture');
select test.eq((select balance from point_wallets where user_id='99999999-0000-0000-0000-000000000001'), 5000::bigint, 'dry run does not touch the balance');
select test.eq((select username from profiles where id='99999999-0000-0000-0000-000000000001'), 'Player', 'dry run does not anonymize');

-- 実行
select test.eq((select (public.process_account_deletions(false)->>'accounts')::int), 1, 'deletion executed');

-- 残高の失効（台帳に負の確定エントリとして残る）
select test.eq((select balance from point_wallets where user_id='99999999-0000-0000-0000-000000000001'), 0::bigint, 'balance forfeited');
select test.eq((select delta from point_ledger where user_id='99999999-0000-0000-0000-000000000001' and reason='account_closed'), -5000::bigint, 'forfeiture recorded in the ledger');

-- **台帳が残っていること**（auth.users を消していたら cascade で消えていた）
select test.eq((select count(*)::int from point_ledger where user_id='99999999-0000-0000-0000-000000000001' and reason='mission'), 1, 'original ledger entry survives the deletion');

-- PII の匿名化
select test.eq((select username from profiles where id='99999999-0000-0000-0000-000000000001'), '退会したユーザー', 'username anonymized');
select test.ok((select handle like 'deleted_%' from profiles where id='99999999-0000-0000-0000-000000000001'), 'handle anonymized');
select test.eq((select date_of_birth from profiles where id='99999999-0000-0000-0000-000000000001'), null, 'date of birth erased');
select test.eq((select referral_code from profiles where id='99999999-0000-0000-0000-000000000001'), null, 'referral code invalidated');

-- ログイン不能化（auth のメールを無効ドメインへ）
select test.ok((select email like 'deleted+%@invalid' from auth.users where id='99999999-0000-0000-0000-000000000001'), 'auth email neutralized');

-- 状態は deleted
select test.eq((select state from user_moderation_state where user_id='99999999-0000-0000-0000-000000000001'), 'deleted', 'moderation state is deleted');
select test.eq((select status from account_deletions where user_id='99999999-0000-0000-0000-000000000001'), 'completed', 'request marked completed');

-- 意図的に残すもの：同意記録（法的証跡）
select test.eq((select count(*)::int from legal_acceptances where user_id='99999999-0000-0000-0000-000000000001'), 1, 'consent record retained');

-- 二重処理されない
select test.eq((select (public.process_account_deletions(false)->>'accounts')::int), 0, 'nothing left to process');
-- 完了済みは再申請できない
select test.eq((select public.request_account_deletion()->>'reason'), 'already_deleted', 'cannot re-request after completion');

-- ---------- 退会後の付与はブロックされる ----------
-- 残高を復活させないこと（匿名化済みアカウントへの遅延 postback 対策）
select test.eq(
  (select public.confirm_offer('applovin','txn-after-deletion','99999999-0000-0000-0000-000000000001', null, 1000)->>'reason'),
  'user_deleted', 'offer confirmation blocked for deleted user');
select test.eq((select balance from point_wallets where user_id='99999999-0000-0000-0000-000000000001'), 0::bigint, 'balance stays zero');

-- ---------- 退会済み端末からの再登録を検知 ----------
-- 退会したユーザーの端末を用意する
insert into user_devices(user_id, device_id) values ('99999999-0000-0000-0000-000000000001','dev-rejoin')
  on conflict do nothing;
select test.set_uid('99999999-0000-0000-0000-000000000002');
select public.register_device('dev-rejoin');
select test.eq((select count(*)::int from fraud_flags
                 where flag_type='rejoin_after_deletion' and user_id='99999999-0000-0000-0000-000000000002'),
               1, 'rejoin on a device with a deleted account is flagged');
-- ブロックはしない（家族の共有端末など正当なケースがあるため、レビュー材料として残す）
select test.eq((select count(*)::int from user_devices
                 where user_id='99999999-0000-0000-0000-000000000002' and device_id='dev-rejoin'), 1, 'rejoin is not blocked');

-- 退会済みが居ない端末では起票しない
select test.set_uid('99999999-0000-0000-0000-000000000003');
select public.register_device('dev-clean');
select test.eq((select count(*)::int from fraud_flags
                 where flag_type='rejoin_after_deletion' and user_id='99999999-0000-0000-0000-000000000003'),
               0, 'clean device raises no rejoin flag');

-- ---------- 権限 ----------
select test.eq(has_function_privilege('authenticated', 'public.request_account_deletion(text)', 'execute'), true, 'users can request deletion');
select test.eq(has_function_privilege('anon', 'public.request_account_deletion(text)', 'execute'), false, 'anon cannot request deletion');
select test.eq(has_function_privilege('authenticated', 'public.cancel_account_deletion()', 'execute'), true, 'users can cancel');
select test.eq(has_function_privilege('authenticated', 'public.process_account_deletions(boolean)', 'execute'), false, 'processing is service_role only');
select test.eq(has_table_privilege('authenticated', 'public.admin_deletion_rows', 'select'), false, 'admin view hidden from users');
select test.eq((select relrowsecurity from pg_class where relname='account_deletions'), true, 'account_deletions RLS enabled');

rollback;
