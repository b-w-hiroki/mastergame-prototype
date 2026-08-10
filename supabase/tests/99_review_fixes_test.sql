-- ============================================================
-- コードレビューで検出した不具合の回帰テスト（0031）
-- いずれも既存テストでは捕捉できていなかったもの。
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('eeee0000-0000-0000-0000-000000000001'); -- 通常
select test.new_user('eeee0000-0000-0000-0000-000000000002'); -- 凍結
select test.new_user('eeee0000-0000-0000-0000-000000000003'); -- 退会済み
select test.new_user('eeee0000-0000-0000-0000-000000000004'); -- offer 用

-- ============================================================
-- 1) claim_mission に処分ガードがある（BAN/凍結/退会はポイントを鋳造できない）
-- ============================================================
insert into user_moderation_state(user_id, state, reason)
  values ('eeee0000-0000-0000-0000-000000000002','frozen','test')
  on conflict (user_id) do update set state='frozen';
insert into user_moderation_state(user_id, state, reason)
  values ('eeee0000-0000-0000-0000-000000000003','deleted','test')
  on conflict (user_id) do update set state='deleted';

select test.set_uid('eeee0000-0000-0000-0000-000000000002');
select test.eq((select public.claim_mission((select id from missions where type='daily' limit 1))->>'reason'),
               'user_frozen', 'frozen user cannot claim a mission');
select test.eq((select coalesce(balance,0) from point_wallets where user_id='eeee0000-0000-0000-0000-000000000002'),
               0::bigint, 'frozen user earns nothing');

select test.set_uid('eeee0000-0000-0000-0000-000000000003');
select test.eq((select public.claim_mission((select id from missions where type='daily' limit 1))->>'reason'),
               'user_deleted', 'deleted user cannot claim a mission');
select test.eq((select coalesce(balance,0) from point_wallets where user_id='eeee0000-0000-0000-0000-000000000003'),
               0::bigint, 'deleted user cannot mint points');

-- 通常ユーザーは従来どおり受け取れる（絞りすぎていないこと）
select test.set_uid('eeee0000-0000-0000-0000-000000000001');
select test.eq((select (public.claim_mission((select id from missions where type='daily' limit 1))->>'ok')::boolean),
               true, 'normal user can still claim');
select test.ok((select balance from point_wallets where user_id='eeee0000-0000-0000-0000-000000000001') > 0,
               'normal user is rewarded');

-- ============================================================
-- 7) 日付境界がストリークと揃っている（デイリーが UTC、ストリークが JST ではない）
-- ============================================================
select test.eq((select period_key from mission_completions
                 where user_id='eeee0000-0000-0000-0000-000000000001' limit 1),
               to_char(public.service_today(), 'YYYY-MM-DD'),
               'daily period key uses the service timezone');

-- ============================================================
-- 2) confirm_offer: オファー未指定 + moderation 行ありでも落ちない
--    （FOUND の誤参照で reward が NULL になっていた）
-- ============================================================
-- moderation 行を作る（0021/0026 では自動で作られるため本番でも普通に起きる状態）
insert into user_moderation_state(user_id, state, reason)
  values ('eeee0000-0000-0000-0000-000000000004','active','test')
  on conflict (user_id) do update set state='active';

select test.eq(
  (select public.confirm_offer('applovin','txn-no-offer-id','eeee0000-0000-0000-0000-000000000004', null, 1200)->>'status'),
  'accepted', 'offer confirms without an external offer id');
select test.eq((select balance from point_wallets where user_id='eeee0000-0000-0000-0000-000000000004'),
               1200::bigint, 'override reward is granted');
select test.eq((select offer_id from offer_completions where network_txn_id='txn-no-offer-id'), null,
               'completion has no offer linked');

-- 存在しない external_id を渡した場合も override で通る
select test.eq(
  (select public.confirm_offer('applovin','txn-unknown-ext','eeee0000-0000-0000-0000-000000000004','no-such-offer', 300)->>'status'),
  'accepted', 'unknown external id falls back to the override');

-- ============================================================
-- 3) game_hub_rows が未ログインから読める（0030 の revoke で壊れていた）
-- ============================================================
select test.set_uid(null);
set local role anon;
select test.ok((select count(*)::int from game_hub_rows) > 0, 'anon can read the game hub');
select test.ok((select followers is not null from game_hub_rows limit 1), 'follower counts are computed for anon');
reset role;
-- フォロー情報そのものは引き続き anon に見せない
set local role anon;
select test.raises($$select count(*) from user_games$$, 'anon still cannot read raw follows');
reset role;

-- 非表示トピックが集計に混ざらないこと（定義者権限にしても条件は効いている）
insert into topics(forum_id, author_id, kind, title, moderation_state)
  select f.id, 'eeee0000-0000-0000-0000-000000000001', 'chat', '非表示', 'hidden'
    from forums f join games g on g.id=f.game_id where g.slug='eldia';
select test.eq((select topic_count from game_hub_rows where slug='eldia'), 0::bigint,
               'hidden topics are excluded from the public count');

-- ============================================================
-- 4) wallet_expiry が authenticated から読める（legal_config の権限で落ちていた）
-- ============================================================
select test.set_uid('eeee0000-0000-0000-0000-000000000001');
set local role authenticated;
select test.eq((select count(*)::int from wallet_expiry), 1, 'user can read their own expiry row');
select test.ok((select expires_on from wallet_expiry) > current_date, 'expiry date is computed');
-- 運用設定そのものは引き続き読めない
select test.raises($$select public.legal_config('payout_ratio_bps', 0)$$, 'config reader stays service_role only');
reset role;

-- ============================================================
-- 5) my_streak: 受け取り後は「明日の段」を返す（常に1日目/1000P ではない）
-- ============================================================
select test.set_uid('eeee0000-0000-0000-0000-000000000001');
insert into user_streaks(user_id, current_streak, longest_streak, last_claim_on, total_claims)
  values ('eeee0000-0000-0000-0000-000000000001', 3, 3, public.service_today(), 3)
on conflict (user_id) do update
  set current_streak=3, longest_streak=3, last_claim_on=public.service_today(), total_claims=3;

select test.eq((select (public.my_streak()->>'claimed_today')::boolean), true, 'claimed today');
select test.eq((select (public.my_streak()->>'next_day_index')::int), 4, 'next tier is tomorrow, not day 1');
select test.eq((select (public.my_streak()->>'next_reward')::int), 2500, 'next reward matches the tier');

-- 最終段まで受け取っていれば翌日は1日目に戻る
update user_streaks set current_streak = 7 where user_id='eeee0000-0000-0000-0000-000000000001';
select test.eq((select (public.my_streak()->>'next_day_index')::int), 1, 'wraps to day 1 after the final tier');

-- ============================================================
-- 6) 退会確定でセッション失効の処理が呼ばれる（素のPGでは対象表が無くても落ちない）
-- ============================================================
select test.set_uid(null);
insert into account_deletions(user_id, status, scheduled_at)
  values ('eeee0000-0000-0000-0000-000000000004','pending', now() - interval '1 day')
on conflict (user_id) do update set status='pending', scheduled_at=now() - interval '1 day';
select test.eq((select (public.process_account_deletions(false)->>'accounts')::int), 1,
               'deletion completes even without auth session tables');
select test.eq((select state from user_moderation_state where user_id='eeee0000-0000-0000-0000-000000000004'),
               'deleted', 'user marked deleted');

-- ============================================================
-- 9) record_events: 巨大な params は捨てるがイベントは記録する
-- ============================================================
select test.set_uid('eeee0000-0000-0000-0000-000000000001');
select test.eq(
  (select (public.record_events(
     jsonb_build_array(jsonb_build_object(
       'name','big_event',
       'params', jsonb_build_object('blob', repeat('x', 5000))))
   )->>'recorded')::int),
  1, 'oversized params still records the event');
select test.eq((select params->>'_truncated' from app_events where name='big_event'), 'true',
               'oversized params are replaced with a marker');
-- 通常サイズの params はそのまま入る
select public.record_events('[{"name":"small_event","params":{"k":"v"}}]'::jsonb);
select test.eq((select params->>'k' from app_events where name='small_event'), 'v', 'normal params are kept');

-- ============================================================
-- 8) retention_cohorts が期間で絞られている（全期間走査でない）
-- ============================================================
select test.ok(
  (select pg_get_viewdef('public.retention_cohorts'::regclass)
          like '%FROM app_events%CURRENT_DATE%'),
  'retention view bounds the activity scan by date');

rollback;
