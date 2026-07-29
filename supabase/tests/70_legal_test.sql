-- ============================================================
-- 法務・年齢確認・ポイント有効期限（0024）
--   - legal_documents は未ログインでも読める / 最新版ビュー
--   - accept_legal: 存在しない版には同意できない・冪等
--   - pending_legal_consents: 未同意と改定後の再同意
--   - set_date_of_birth: 最低年齢未満は拒否・1度だけ・未成年判定
--   - expire_points: dry_run・失効・台帳への記録・冪等
--   - notify_expiring_points: 予告通知・重複しない
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('77777777-0000-0000-0000-000000000001');
select test.new_user('77777777-0000-0000-0000-000000000002');

-- ---------- 法務文書 ----------
select test.eq((select count(*)::int from current_legal_documents), 3, 'terms/privacy/tokushoho are published');
select test.eq(has_table_privilege('anon', 'public.legal_documents', 'select'), true, 'legal docs readable before signup');
-- 特商法は掲示のみで同意対象ではない
select test.eq((select requires_consent from current_legal_documents where slug='tokushoho'), false, 'tokushoho does not require consent');
select test.eq((select requires_consent from current_legal_documents where slug='terms'), true, 'terms requires consent');

-- ---------- 同意 ----------
select test.set_uid('77777777-0000-0000-0000-000000000001');
-- 最初は規約・PP の2件が未同意
select test.eq((select jsonb_array_length(public.pending_legal_consents())), 2, 'terms and privacy pending initially');

select test.eq((select public.accept_legal('terms', '2026-07-01')->>'ok'), 'true', 'accept terms');
select test.eq((select jsonb_array_length(public.pending_legal_consents())), 1, 'one left after accepting terms');
select public.accept_legal('privacy', '2026-07-01');
select test.eq((select jsonb_array_length(public.pending_legal_consents())), 0, 'nothing pending once both accepted');

-- 同じ版への再同意は行を増やさない
select public.accept_legal('terms', '2026-07-01');
select test.eq((select count(*)::int from legal_acceptances where user_id='77777777-0000-0000-0000-000000000001' and slug='terms'), 1, 'idempotent acceptance');

-- 存在しない版には同意できない（改ざん防止）
select test.raises($$select public.accept_legal('terms','9999-99-99')$$, 'unknown version rejected');

-- 規約を改定すると再同意が必要になる
insert into legal_documents(slug, version, title, body, requires_consent)
  values ('terms', '2026-09-01', '利用規約', '改定版', true);
select test.eq((select jsonb_array_length(public.pending_legal_consents())), 1, 'revision requires re-consent');
select test.eq((select public.pending_legal_consents()->0->>'version'), '2026-09-01', 'pending points at the new version');
select test.eq((select version from current_legal_documents where slug='terms'), '2026-09-01', 'current view follows the latest');

-- ---------- 年齢確認 ----------
-- 最低年齢未満は拒否し、生年月日を保存しない
select test.eq((select public.set_date_of_birth((current_date - interval '10 years')::date)->>'reason'), 'under_minimum_age', 'under-age rejected');
select test.eq((select date_of_birth is null from profiles where id='77777777-0000-0000-0000-000000000001'), true, 'under-age DOB not stored');

-- 未成年（13〜17）は登録できるが is_minor
select test.eq((select public.set_date_of_birth((current_date - interval '15 years')::date)->>'is_minor'), 'true', 'minor flagged');
select test.eq((select age_verified_at is not null from profiles where id='77777777-0000-0000-0000-000000000001'), true, 'verification timestamped');

-- 1度だけ設定できる（後から書き換えて制限を回避させない）
select test.eq((select public.set_date_of_birth((current_date - interval '30 years')::date)->>'reason'), 'already_set', 'DOB cannot be changed');
select test.eq((select extract(year from age(current_date, date_of_birth))::int from profiles where id='77777777-0000-0000-0000-000000000001'), 15, 'original DOB kept');

-- 成人は is_minor=false
select test.set_uid('77777777-0000-0000-0000-000000000002');
select test.eq((select public.set_date_of_birth((current_date - interval '30 years')::date)->>'is_minor'), 'false', 'adult not flagged as minor');

-- 未来日・異常値は拒否
select test.new_user('77777777-0000-0000-0000-000000000003');
select test.set_uid('77777777-0000-0000-0000-000000000003');
select test.raises($$select public.set_date_of_birth((current_date + interval '1 day')::date)$$, 'future DOB rejected');
select test.raises($$select public.set_date_of_birth((current_date - interval '200 years')::date)$$, 'absurd DOB rejected');

-- ---------- ポイント有効期限 ----------
select test.set_uid(null);
select public.apply_points('77777777-0000-0000-0000-000000000002', 5000, 'mission');

-- 失効予定日が出る
select test.eq((select expires_on from wallet_expiry where user_id='77777777-0000-0000-0000-000000000002'),
               (current_date + interval '12 months')::date, 'expiry date is 12 months out');

-- まだ失効対象ではない
select test.eq((select (public.expire_points(true)->>'wallets')::int), 0, 'nothing to expire yet');

-- 最終利用を13ヶ月前に巻き戻す → 対象になる
update point_wallets set updated_at = now() - interval '13 months' where user_id='77777777-0000-0000-0000-000000000002';
select test.eq((select (public.expire_points(true)->>'wallets')::int), 1, 'dry run finds the stale wallet');
select test.eq((select (public.expire_points(true)->>'points')::bigint), 5000::bigint, 'dry run reports the points');
-- dry run では失効しない
select test.eq((select balance from point_wallets where user_id='77777777-0000-0000-0000-000000000002'), 5000::bigint, 'dry run does not expire');

-- 実行 → 残高0・台帳に負のエントリ・通知
select test.eq((select (public.expire_points(false)->>'wallets')::int), 1, 'expiry executed');
select test.eq((select balance from point_wallets where user_id='77777777-0000-0000-0000-000000000002'), 0::bigint, 'balance cleared');
select test.eq((select delta from point_ledger where user_id='77777777-0000-0000-0000-000000000002' and reason='expiry'), -5000::bigint, 'expiry recorded in the append-only ledger');
select test.eq((select count(*)::int from notifications where user_id='77777777-0000-0000-0000-000000000002' and type='point_expired'), 1, 'user notified of expiry');

-- 再実行しても何も起きない（残高0）
select test.eq((select (public.expire_points(false)->>'wallets')::int), 0, 'nothing left to expire');

-- ---------- 失効予告の通知 ----------
select public.apply_points('77777777-0000-0000-0000-000000000001', 3000, 'mission');
-- 失効の20日前まで進める（通知しきい値30日以内）
update point_wallets set updated_at = now() - interval '12 months' + interval '20 days'
  where user_id='77777777-0000-0000-0000-000000000001';
select test.eq((select (public.notify_expiring_points()->>'notified')::int), 1, 'expiring wallet notified');
select test.eq((select payload->>'balance' from notifications where user_id='77777777-0000-0000-0000-000000000001' and type='point_expiry_notice'), '3000', 'notice carries the balance');

-- 同じ失効日に対して重複通知しない
select test.eq((select (public.notify_expiring_points()->>'notified')::int), 0, 'no duplicate notice for the same expiry date');

-- ---------- 権限 ----------
select test.eq(has_function_privilege('authenticated', 'public.expire_points(boolean)', 'execute'), false, 'expire_points is service_role only');
select test.eq(has_function_privilege('authenticated', 'public.notify_expiring_points()', 'execute'), false, 'notify is service_role only');
select test.eq(has_function_privilege('authenticated', 'public.accept_legal(text,text)', 'execute'), true, 'accept_legal available to users');
select test.eq(has_function_privilege('anon', 'public.accept_legal(text,text)', 'execute'), false, 'accept_legal not available to anon');
select test.eq(has_function_privilege('authenticated', 'public.set_date_of_birth(date)', 'execute'), true, 'set_date_of_birth available to users');
select test.eq((select relrowsecurity from pg_class where relname='legal_acceptances'), true, 'legal_acceptances RLS enabled');

rollback;
