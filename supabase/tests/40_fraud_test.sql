-- ============================================================
-- 不正検知（0021）
--   - register_device: 端末登録・upsert・多重アカウント検知・自動 marked
--   - emulator 検知
--   - raise_fraud_flag の重複抑制（cooldown）
--   - check_velocity: apply_points 経由で自動起票され、付与自体は壊さない
--   - resolve_fraud_flag: dismiss / freeze / ban
--   - 権限: 内部関数は authenticated から呼べない
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('44444444-0000-0000-0000-000000000001');
select test.new_user('44444444-0000-0000-0000-000000000002');
select test.new_user('44444444-0000-0000-0000-000000000003');
select test.new_user('44444444-0000-0000-0000-000000000004');
select test.new_user('44444444-0000-0000-0000-000000000005');

-- ---------- 端末登録 ----------
select test.set_uid('44444444-0000-0000-0000-000000000001');
select public.register_device('dev-A', 'ios', 'iPhone15,2', '17.2', false);
select test.eq((select count(*)::int from user_devices where device_id='dev-A'), 1, 'device registered');
select test.eq((select platform from user_devices where device_id='dev-A' and user_id='44444444-0000-0000-0000-000000000001'), 'ios', 'platform stored');

-- 同一ユーザーの再登録は upsert（行は増えない・last_seen 更新）
select public.register_device('dev-A', 'ios', 'iPhone15,2', '17.4', false);
select test.eq((select count(*)::int from user_devices where device_id='dev-A'), 1, 'upsert keeps single row');
select test.eq((select os_version from user_devices where device_id='dev-A' and user_id='44444444-0000-0000-0000-000000000001'), '17.4', 'os_version updated');

-- 空の device_id は拒否
select test.raises($$select public.register_device('   ')$$, 'blank device_id rejected');

-- ---------- 多重アカウント検知 ----------
-- 2アカウント目までは閾値(3)未満なので起票しない
select test.set_uid('44444444-0000-0000-0000-000000000002');
select public.register_device('dev-A', 'ios', 'iPhone15,2', '17.4', false);
select test.eq((select count(*)::int from fraud_flags where flag_type='multi_account'), 0, 'no flag under threshold');

-- 3アカウント目で multi_account を起票
select test.set_uid('44444444-0000-0000-0000-000000000003');
select public.register_device('dev-A', 'ios', 'iPhone15,2', '17.4', false);
select test.eq((select count(*)::int from fraud_flags where flag_type='multi_account' and user_id='44444444-0000-0000-0000-000000000003'), 1, 'multi_account flagged at threshold');
select test.eq((select severity from fraud_flags where flag_type='multi_account' and user_id='44444444-0000-0000-0000-000000000003'), 'medium', 'medium severity below mark threshold');
select test.eq((select (detail->>'accounts')::int from fraud_flags where flag_type='multi_account' and user_id='44444444-0000-0000-0000-000000000003'), 3, 'account count recorded');

-- 同一ユーザーの再登録では重複起票しない（cooldown）
select public.register_device('dev-A', 'ios', 'iPhone15,2', '17.4', false);
select test.eq((select count(*)::int from fraud_flags where flag_type='multi_account' and user_id='44444444-0000-0000-0000-000000000003'), 1, 'cooldown suppresses duplicate flag');

-- この時点ではまだ marked にならない（mark 閾値は 5）
select test.eq((select count(*)::int from user_moderation_state where user_id='44444444-0000-0000-0000-000000000003' and state='marked'), 0, 'not marked below mark threshold');

-- 5アカウント目 → high + 自動 marked
select test.set_uid('44444444-0000-0000-0000-000000000004');
select public.register_device('dev-A');
select test.set_uid('44444444-0000-0000-0000-000000000005');
select public.register_device('dev-A');
select test.eq((select severity from fraud_flags where flag_type='multi_account' and user_id='44444444-0000-0000-0000-000000000005'), 'high', 'high severity at mark threshold');
select test.eq((select state from user_moderation_state where user_id='44444444-0000-0000-0000-000000000005'), 'marked', 'auto-marked at mark threshold');

-- marked は獲得をブロックしない（レビュー目印であってペナルティではない）
select test.eq((select public.apply_points('44444444-0000-0000-0000-000000000005', 10, 'test') is not null), true, 'marked user can still earn');

-- 既に banned のユーザーは marked に降格されない
insert into user_moderation_state(user_id, state, reason)
  values ('44444444-0000-0000-0000-000000000002', 'banned', 'manual')
  on conflict (user_id) do update set state='banned';
select test.set_uid('44444444-0000-0000-0000-000000000002');
select public.register_device('dev-A');
select test.eq((select state from user_moderation_state where user_id='44444444-0000-0000-0000-000000000002'), 'banned', 'banned state not downgraded to marked');

-- ---------- エミュレータ検知 ----------
select test.set_uid('44444444-0000-0000-0000-000000000001');
select public.register_device('dev-EMU', 'android', 'sdk_gphone64', '14', true);
select test.eq((select count(*)::int from fraud_flags where flag_type='emulator' and user_id='44444444-0000-0000-0000-000000000001'), 1, 'emulator flagged');
select test.eq((select is_emulator from user_devices where device_id='dev-EMU'), true, 'is_emulator stored');

-- ---------- 速度検知（apply_points 経由で自動発火） ----------
-- 閾値を下げて確実に踏ませる
update fraud_settings set value = 3 where key = 'velocity_count_1h';
update fraud_settings set value = 1000000 where key = 'velocity_points_1h';

select test.set_uid(null);
select public.apply_points('44444444-0000-0000-0000-000000000004', 5, 'test-velocity');
select public.apply_points('44444444-0000-0000-0000-000000000004', 5, 'test-velocity');
select test.eq((select count(*)::int from fraud_flags where flag_type='velocity' and user_id='44444444-0000-0000-0000-000000000004'), 0, 'no velocity flag under threshold');
select public.apply_points('44444444-0000-0000-0000-000000000004', 5, 'test-velocity');
select test.eq((select count(*)::int from fraud_flags where flag_type='velocity' and user_id='44444444-0000-0000-0000-000000000004'), 1, 'velocity flagged at count threshold');
select test.eq((select severity from fraud_flags where flag_type='velocity' and user_id='44444444-0000-0000-0000-000000000004'), 'medium', 'count breach is medium');

-- 付与そのものは壊れていない（検知は非破壊）
select test.eq((select balance from point_wallets where user_id='44444444-0000-0000-0000-000000000004'), 15::bigint, 'points still applied while flagging');

-- 獲得ポイント額での high 判定
update fraud_settings set value = 20 where key = 'velocity_points_1h';
select public.apply_points('44444444-0000-0000-0000-000000000001', 9999, 'test-velocity-high');
select test.eq((select severity from fraud_flags where flag_type='velocity' and user_id='44444444-0000-0000-0000-000000000001'), 'high', 'points breach is high');

-- 消費（マイナス）では検知しない
select test.eq((select count(*)::int from fraud_flags where flag_type='velocity' and user_id='44444444-0000-0000-0000-000000000002'), 0, 'no flag for user2 yet');
select public.apply_points('44444444-0000-0000-0000-000000000002', 10, 'test-seed'); -- 消費の原資（閾値未満）
select public.apply_points('44444444-0000-0000-0000-000000000002', -5, 'test-spend');
select test.eq((select count(*)::int from fraud_flags where flag_type='velocity' and user_id='44444444-0000-0000-0000-000000000002'), 0, 'spending does not trigger velocity');

-- ---------- 運営の処理 ----------
-- dismiss: 解決済みになるが状態は変わらない
select test.eq(
  (select public.resolve_fraud_flag(
     (select id from fraud_flags where flag_type='emulator' and user_id='44444444-0000-0000-0000-000000000001' limit 1),
     'dismiss', 'false positive')->>'status'),
  'resolved', 'dismiss resolves the flag');
select test.eq((select count(*)::int from fraud_flags where flag_type='emulator' and resolved_at is null), 0, 'flag marked resolved');

-- 二重処理は duplicate
select test.eq(
  (select public.resolve_fraud_flag(
     (select id from fraud_flags where flag_type='emulator' and user_id='44444444-0000-0000-0000-000000000001' limit 1),
     'dismiss')->>'status'),
  'duplicate', 'second resolve is duplicate');

-- 不正なアクションは拒否
select test.raises(
  $$select public.resolve_fraud_flag((select id from fraud_flags limit 1), 'nuke')$$,
  'invalid action rejected');

-- ban: moderation_state が banned になる
select test.eq(
  (select public.resolve_fraud_flag(
     (select id from fraud_flags where flag_type='multi_account' and user_id='44444444-0000-0000-0000-000000000005' limit 1),
     'ban', 'confirmed fraud')->>'status'),
  'resolved', 'ban resolves the flag');
select test.eq((select state from user_moderation_state where user_id='44444444-0000-0000-0000-000000000005'), 'banned', 'user banned by resolution');

-- freeze
select test.eq(
  (select public.resolve_fraud_flag(
     (select id from fraud_flags where flag_type='velocity' and user_id='44444444-0000-0000-0000-000000000004' limit 1),
     'freeze')->>'status'),
  'resolved', 'freeze resolves the flag');
select test.eq((select state from user_moderation_state where user_id='44444444-0000-0000-0000-000000000004'), 'frozen', 'user frozen by resolution');

-- ---------- 権限 ----------
-- 内部関数・運営関数はクライアントロールから実行不可
select test.eq(has_function_privilege('authenticated', 'public.raise_fraud_flag(uuid,text,text,jsonb)', 'execute'), false, 'raise_fraud_flag not executable by authenticated');
select test.eq(has_function_privilege('authenticated', 'public.check_velocity(uuid)', 'execute'), false, 'check_velocity not executable by authenticated');
select test.eq(has_function_privilege('authenticated', 'public.resolve_fraud_flag(uuid,text,text)', 'execute'), false, 'resolve_fraud_flag not executable by authenticated');
select test.eq(has_function_privilege('anon', 'public.register_device(text,text,text,text,boolean)', 'execute'), false, 'register_device not executable by anon');
select test.eq(has_function_privilege('authenticated', 'public.register_device(text,text,text,text,boolean)', 'execute'), true, 'register_device executable by authenticated');

-- 管理ビューはクライアントロールから参照不可
select test.eq(has_table_privilege('authenticated', 'public.admin_fraud_rows', 'select'), false, 'admin_fraud_rows hidden from authenticated');
select test.eq(has_table_privilege('anon', 'public.admin_fraud_rows', 'select'), false, 'admin_fraud_rows hidden from anon');

-- user_devices は RLS 有効
select test.eq((select relrowsecurity from pg_class where relname='user_devices'), true, 'user_devices RLS enabled');

rollback;
