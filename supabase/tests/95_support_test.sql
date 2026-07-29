-- ============================================================
-- 問い合わせ・CS（0027）
--   - 作成/返信・カテゴリ検証・日次上限・クローズ後の返信拒否
--   - 他人の問い合わせに返信できない
--   - 運営の回答で status 遷移＋通知、担当者個人を露出しない
--   - support_user_context が対応に必要な材料を返す
--   - 権限・RLS
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('aaaa0000-0000-0000-0000-000000000001');
select test.new_user('aaaa0000-0000-0000-0000-000000000002');

-- ---------- 作成 ----------
select test.set_uid('aaaa0000-0000-0000-0000-000000000001');
select test.eq((select public.create_inquiry('points','ポイントが反映されない','昨日オファーを達成しましたが入っていません')->>'status'),
               'ok', 'inquiry created');
select test.eq((select count(*)::int from inquiries where user_id='aaaa0000-0000-0000-0000-000000000001'), 1, 'one inquiry');
select test.eq((select status from inquiries where user_id='aaaa0000-0000-0000-0000-000000000001'), 'open', 'starts open');
-- 本文が最初のメッセージとして入る
select test.eq((select count(*)::int from inquiry_messages m join inquiries i on i.id=m.inquiry_id
                 where i.user_id='aaaa0000-0000-0000-0000-000000000001'), 1, 'body stored as first message');
select test.eq((select is_staff from inquiry_messages limit 1), false, 'user message is not staff');

-- 入力検証
select test.raises($$select public.create_inquiry('invalid','件名','本文')$$, 'invalid category rejected');
select test.raises($$select public.create_inquiry('points','','本文')$$, 'empty subject rejected');
select test.raises($$select public.create_inquiry('points','件名','')$$, 'empty body rejected');

-- ---------- 日次上限（連投対策） ----------
update app_config set value = '2'::jsonb where key = 'inquiry_daily_cap';
select public.create_inquiry('bug','2件目','本文');
select test.eq((select public.create_inquiry('other','3件目','本文')->>'reason'), 'daily_cap', 'daily cap enforced');
update app_config set value = '5'::jsonb where key = 'inquiry_daily_cap';

-- ---------- 運営の回答 ----------
select test.eq(
  (select public.answer_inquiry(
     (select id from inquiries where subject='ポイントが反映されない'),
     '確認したところ、提携先からの連絡待ちです。')->>'status'),
  'ok', 'staff answered');
select test.eq((select status from inquiries where subject='ポイントが反映されない'), 'answered', 'status becomes answered');
-- 運営の返信は担当者個人を露出しない
select test.eq((select author_id from inquiry_messages where is_staff order by created_at desc limit 1), null, 'staff reply has no author');
-- ユーザーに通知が飛ぶ
select test.eq((select count(*)::int from notifications
                 where user_id='aaaa0000-0000-0000-0000-000000000001' and type='inquiry_answered'), 1, 'user notified');

-- ---------- ユーザーの返信 ----------
select test.set_uid('aaaa0000-0000-0000-0000-000000000001');
select test.eq((select public.reply_to_inquiry((select id from inquiries where subject='ポイントが反映されない'), 'いつ頃わかりますか？')->>'status'),
               'ok', 'user replied');
-- 回答済みのまま埋もれないよう open に戻る
select test.eq((select status from inquiries where subject='ポイントが反映されない'), 'open', 'reopens on user reply');

-- 他人の問い合わせには返信できない
select test.set_uid('aaaa0000-0000-0000-0000-000000000002');
select test.eq((select public.reply_to_inquiry((select id from inquiries where subject='ポイントが反映されない'), '横入り')->>'reason'),
               'not_found', 'cannot reply to someone else inquiry');

-- ---------- 解決とクローズ ----------
select test.eq((select (public.answer_inquiry((select id from inquiries where subject='ポイントが反映されない'),
                                              '付与を確認しました。', true)->>'resolved')::boolean),
               true, 'resolved by staff');
select test.eq((select status from inquiries where subject='ポイントが反映されない'), 'resolved', 'status resolved');
select test.ok((select resolved_at is not null from inquiries where subject='ポイントが反映されない'), 'resolved_at set');

select public.close_inquiry((select id from inquiries where subject='ポイントが反映されない'));
select test.eq((select status from inquiries where subject='ポイントが反映されない'), 'closed', 'status closed');
-- クローズ後は返信できない
select test.set_uid('aaaa0000-0000-0000-0000-000000000001');
select test.eq((select public.reply_to_inquiry((select id from inquiries where subject='ポイントが反映されない'), '追加で…')->>'reason'),
               'closed', 'cannot reply after close');

-- ---------- 対応に必要な情報が1発で引けること ----------
select test.set_uid(null);
select public.apply_points('aaaa0000-0000-0000-0000-000000000001', 3000, 'mission');
select test.eq(((public.support_user_context('aaaa0000-0000-0000-0000-000000000001')->>'balance')::bigint), 3000::bigint, 'context carries balance');
select test.ok((select jsonb_array_length(public.support_user_context('aaaa0000-0000-0000-0000-000000000001')->'recent_ledger') > 0), 'context carries recent ledger');
select test.eq((public.support_user_context('aaaa0000-0000-0000-0000-000000000001')->>'moderation_state'), 'active', 'context carries moderation state');
-- 未確定オファー（「反映されない」の最頻原因）が拾えること
insert into offer_completions(user_id, network_id, network_txn_id, status, reward_points)
  select 'aaaa0000-0000-0000-0000-000000000001', n.id, 'txn-pending-1', 'pending', 5000 from ad_networks n limit 1;
select test.eq((select jsonb_array_length(public.support_user_context('aaaa0000-0000-0000-0000-000000000001')->'pending_offers')), 1, 'pending offers surfaced');
-- 未解決の不正フラグ（付与が止まる理由）が拾えること
select public.raise_fraud_flag('aaaa0000-0000-0000-0000-000000000001','velocity','medium','{}'::jsonb);
select test.eq((select jsonb_array_length(public.support_user_context('aaaa0000-0000-0000-0000-000000000001')->'open_fraud_flags')), 1, 'open fraud flags surfaced');
-- 退会申請中かどうかも見える
select test.eq((public.support_user_context('aaaa0000-0000-0000-0000-000000000002')->>'deletion_status'), null, 'no deletion status when none');

-- ---------- 運営ビュー ----------
select test.ok((select count(*)::int from admin_inquiry_rows) >= 1, 'admin view lists inquiries');
select test.eq((select last_from_staff from admin_inquiry_rows where subject='ポイントが反映されない'), true, 'view shows who spoke last');
select test.ok((select message_count from admin_inquiry_rows where subject='ポイントが反映されない') >= 3, 'view counts the thread');

-- ---------- 権限 ----------
select test.eq(has_function_privilege('authenticated', 'public.create_inquiry(text,text,text)', 'execute'), true, 'users can create inquiries');
select test.eq(has_function_privilege('anon', 'public.create_inquiry(text,text,text)', 'execute'), false, 'anon cannot');
select test.eq(has_function_privilege('authenticated', 'public.answer_inquiry(uuid,text,boolean)', 'execute'), false, 'answering is staff only');
select test.eq(has_function_privilege('authenticated', 'public.close_inquiry(uuid)', 'execute'), false, 'closing is staff only');
select test.eq(has_function_privilege('authenticated', 'public.support_user_context(uuid)', 'execute'), false, 'support context is staff only');
select test.eq(has_table_privilege('authenticated', 'public.admin_inquiry_rows', 'select'), false, 'admin view hidden from users');
select test.eq((select relrowsecurity from pg_class where relname='inquiries'), true, 'inquiries RLS enabled');
select test.eq((select relrowsecurity from pg_class where relname='inquiry_messages'), true, 'inquiry_messages RLS enabled');

rollback;
