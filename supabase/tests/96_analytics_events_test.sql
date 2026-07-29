-- ============================================================
-- 行動イベント計測（0028）
--   - record_events: バッチ送信・件数上限・イベント名の形式検証
--   - analytics_daily: 欠測日を埋める
--   - mission_funnel: ユーザー数ベースの転換率（連打で歪まない）
--   - retention_cohorts: D1/D7 の算出
--   - purge_app_events: 保持期間・dry run
--   - 権限（生ログは誰も直接読めない）
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('bbbb0000-0000-0000-0000-000000000001');
select test.new_user('bbbb0000-0000-0000-0000-000000000002');

-- ---------- 送信 ----------
select test.set_uid('bbbb0000-0000-0000-0000-000000000001');
select test.eq(
  (select (public.record_events('[{"name":"app_open","platform":"ios","session_id":"s1"},
                                  {"name":"mission_list_view","session_id":"s1"}]'::jsonb)->>'recorded')::int),
  2, 'batch recorded');
select test.eq((select count(*)::int from app_events where user_id='bbbb0000-0000-0000-0000-000000000001'), 2, 'rows inserted');
select test.eq((select platform from app_events where name='app_open'), 'ios', 'platform stored');
select test.eq((select params from app_events where name='app_open'), '{}'::jsonb, 'params defaults to empty object');

-- params を渡せる
select public.record_events('[{"name":"mission_claim_tap","params":{"mission_id":"m1"}}]'::jsonb);
select test.eq((select params->>'mission_id' from app_events where name='mission_claim_tap'), 'm1', 'params stored');

-- ---------- イベント名の形式検証 ----------
-- 想定外の名前は記録せず、件数にも数えない（テーブルを汚さない）
select test.eq(
  (select (public.record_events('[{"name":"BadName"},{"name":"x"},{"name":"has space"},
                                  {"name":"ok_event"}]'::jsonb)->>'recorded')::int),
  1, 'only well-formed names are recorded');
select test.eq((select count(*)::int from app_events where name in ('BadName','x','has space')), 0, 'malformed names not stored');
select test.eq((select count(*)::int from app_events where name='ok_event'), 1, 'valid name stored');

-- ---------- 件数上限 ----------
update app_config set value = '2'::jsonb where key = 'event_batch_max';
select test.eq(
  (select public.record_events('[{"name":"a_event"},{"name":"b_event"},{"name":"c_event"}]'::jsonb)->>'reason'),
  'batch_too_large', 'oversized batch rejected');
-- 上限を超えたバッチは1件も入らない（部分適用しない）
select test.eq((select count(*)::int from app_events where name in ('a_event','b_event','c_event')), 0, 'rejected batch inserts nothing');
update app_config set value = '50'::jsonb where key = 'event_batch_max';

-- 配列以外は拒否
select test.raises($$select public.record_events('{"name":"x_event"}'::jsonb)$$, 'non-array rejected');

-- ---------- 日次 ----------
select test.eq((select count(*)::int from analytics_daily), 60, 'daily view spans 60 days');
select test.ok((select active_users from analytics_daily where day = current_date) >= 1, 'today has active users');
-- 取引ゼロの日も 0 で埋まる（グラフが日付をスキップしない）
select test.eq((select active_users from analytics_daily where day = current_date - 5), 0::bigint, 'quiet day is zero, not missing');

-- ---------- ミッションのファネル ----------
-- user1: 表示・タップ済み。user2: 表示のみ
select test.set_uid('bbbb0000-0000-0000-0000-000000000002');
select public.record_events('[{"name":"mission_list_view"}]'::jsonb);
select test.eq((select viewed from mission_funnel), 2::bigint, 'two users viewed');
select test.eq((select tapped from mission_funnel), 1::bigint, 'one user tapped');
select test.eq((select claimed from mission_funnel), 0::bigint, 'nobody claimed yet');
select test.eq((select view_to_tap_pct from mission_funnel), 50.0::numeric, 'view to tap rate');

-- 連打しても「ユーザー数ベース」なので転換率は歪まない
select test.set_uid('bbbb0000-0000-0000-0000-000000000001');
select public.record_events('[{"name":"mission_claim_tap"},{"name":"mission_claim_tap"},{"name":"mission_claim_tap"}]'::jsonb);
select test.eq((select tapped from mission_funnel), 1::bigint, 'repeat taps still count as one user');
select test.eq((select view_to_tap_pct from mission_funnel), 50.0::numeric, 'rate unchanged by repeats');

-- 達成まで進める
select public.record_events('[{"name":"mission_claimed"}]'::jsonb);
select test.eq((select claimed from mission_funnel), 1::bigint, 'one user claimed');
select test.eq((select tap_to_claim_pct from mission_funnel), 100.0::numeric, 'tap to claim rate');

-- 何も無い状態でもゼロ除算しない
select test.ok((select overall_pct from mission_funnel) >= 0, 'overall percentage computed');

-- ---------- リテンション ----------
-- user1 を「5日前に登録し、翌日も活動した」状態にする
update profiles set created_at = now() - interval '5 days' where id='bbbb0000-0000-0000-0000-000000000001';
update app_events set created_at = (current_date - 4)::timestamptz
  where user_id='bbbb0000-0000-0000-0000-000000000001' and name='app_open';
select test.eq((select cohort_size from retention_cohorts where cohort_date = current_date - 5), 1::bigint, 'cohort counted');
select test.eq((select d1 from retention_cohorts where cohort_date = current_date - 5), 1::bigint, 'D1 return detected');
select test.eq((select d1_pct from retention_cohorts where cohort_date = current_date - 5), 100.0::numeric, 'D1 rate');
-- D7 はまだ到来していないので 0
select test.eq((select d7 from retention_cohorts where cohort_date = current_date - 5), 0::bigint, 'D7 not yet reached');

-- ---------- 保持期間 ----------
select test.eq((select (public.purge_app_events(true)->>'deleted')::bigint), 0::bigint, 'nothing to purge yet');
-- 100日前のイベントを作る
insert into app_events(user_id, name, created_at)
  values ('bbbb0000-0000-0000-0000-000000000001','old_event', now() - interval '100 days');
select test.eq((select (public.purge_app_events(true)->>'deleted')::bigint), 1::bigint, 'dry run finds the old event');
select test.eq((select count(*)::int from app_events where name='old_event'), 1, 'dry run does not delete');
select test.eq((select (public.purge_app_events(false)->>'deleted')::bigint), 1::bigint, 'purge executed');
select test.eq((select count(*)::int from app_events where name='old_event'), 0, 'old event deleted');
-- 新しいイベントは消えない
select test.ok((select count(*)::int from app_events) > 0, 'recent events retained');

-- ---------- 権限 ----------
select test.eq(has_function_privilege('authenticated', 'public.record_events(jsonb)', 'execute'), true, 'users can send events');
select test.eq(has_function_privilege('anon', 'public.record_events(jsonb)', 'execute'), false, 'anon cannot send events');
select test.eq(has_function_privilege('authenticated', 'public.purge_app_events(boolean)', 'execute'), false, 'purge is service_role only');
select test.eq(has_table_privilege('authenticated', 'public.app_events', 'select'), false, 'raw events not readable by users');
select test.eq(has_table_privilege('authenticated', 'public.analytics_daily', 'select'), false, 'analytics hidden from users');
select test.eq(has_table_privilege('authenticated', 'public.retention_cohorts', 'select'), false, 'retention hidden from users');
select test.eq((select relrowsecurity from pg_class where relname='app_events'), true, 'app_events RLS enabled');

rollback;
