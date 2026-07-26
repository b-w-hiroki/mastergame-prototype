-- ============================================================
-- プッシュ通知トークン（0020）
--   - register_push_token: 本人の端末を upsert、別アカウント再登録で付け替え
--   - remove_push_token: 本人のみ削除
--   - RPC は authenticated 限定
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('33333333-0000-0000-0000-000000000001');
select test.new_user('33333333-0000-0000-0000-000000000002');

-- user1 が端末を登録
select test.set_uid('33333333-0000-0000-0000-000000000001');
select public.register_push_token('ExpoTok[abc]', 'ios');
select test.eq((select user_id from push_tokens where token='ExpoTok[abc]'), '33333333-0000-0000-0000-000000000001'::uuid, 'token owned by user1');
select test.eq((select count(*)::int from push_tokens where token='ExpoTok[abc]'), 1, 'single row');

-- 同じ token を再登録しても増えない（upsert）
select public.register_push_token('ExpoTok[abc]', 'android');
select test.eq((select count(*)::int from push_tokens where token='ExpoTok[abc]'), 1, 'upsert keeps single row');
select test.eq((select platform from push_tokens where token='ExpoTok[abc]'), 'android', 'platform updated');

-- user2 が同じ端末を登録 → 付け替え
select test.set_uid('33333333-0000-0000-0000-000000000002');
select public.register_push_token('ExpoTok[abc]', 'ios');
select test.eq((select user_id from push_tokens where token='ExpoTok[abc]'), '33333333-0000-0000-0000-000000000002'::uuid, 'token reassigned to user2');

-- user1 は user2 のトークンを削除できない（本人のみ）
select test.set_uid('33333333-0000-0000-0000-000000000001');
select public.remove_push_token('ExpoTok[abc]');
select test.eq((select count(*)::int from push_tokens where token='ExpoTok[abc]'), 1, 'user1 cannot delete user2 token');

-- user2 は自分のトークンを削除できる
select test.set_uid('33333333-0000-0000-0000-000000000002');
select public.remove_push_token('ExpoTok[abc]');
select test.eq((select count(*)::int from push_tokens where token='ExpoTok[abc]'), 0, 'user2 deleted own token');

-- 不正 platform は拒否
select test.raises($$ select public.register_push_token('t2','desktop') $$, 'invalid platform rejected');

-- 権限：anon 実行不可
select test.ok(not has_function_privilege('anon','public.register_push_token(text,text)','execute'), 'register_push_token not executable by anon');
select test.ok(has_function_privilege('authenticated','public.register_push_token(text,text)','execute'), 'register_push_token executable by authenticated');

rollback;
