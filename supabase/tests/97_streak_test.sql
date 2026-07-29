-- ============================================================
-- 連続ログイン（0029）
--   - 初回は1日目・連続で加算・一巡したら1日目に戻る
--   - 同日の2回目は duplicate（連打で二重付与されない）
--   - **冪等キーが日付ベースなので、ストリーク行を改竄しても同日に二重付与できない**
--   - 途切れたら1日目にリセット（最長記録は保持）
--   - BAN/凍結/退会は対象外
--   - my_streak が「今日受け取れるか」「次の報酬」を返す
--
-- 「日をまたぐ」検証は service_today() を動かせないため、各段階ごとに別ユーザーを
-- 用意して user_streaks を事前状態としてセットする方式で行う。
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('cccc0000-0000-0000-0000-000000000001'); -- 初回
select test.new_user('cccc0000-0000-0000-0000-000000000002'); -- 2日目
select test.new_user('cccc0000-0000-0000-0000-000000000003'); -- 7日目（最終段）
select test.new_user('cccc0000-0000-0000-0000-000000000004'); -- 一巡後
select test.new_user('cccc0000-0000-0000-0000-000000000005'); -- 途切れ
select test.new_user('cccc0000-0000-0000-0000-000000000006'); -- 凍結

-- 事前状態をセットするヘルパ（「昨日 n 日目まで受け取った」状態）
create or replace function pg_temp.seed_streak(p_user uuid, p_streak int, p_days_ago int)
returns void language sql as $$
  insert into user_streaks(user_id, current_streak, longest_streak, last_claim_on, total_claims)
    values (p_user, p_streak, p_streak, public.service_today() - p_days_ago, p_streak)
  on conflict (user_id) do update
    set current_streak = excluded.current_streak,
        longest_streak = excluded.longest_streak,
        last_claim_on  = excluded.last_claim_on,
        total_claims   = excluded.total_claims;
$$;

-- ---------- 初回 ----------
select test.set_uid('cccc0000-0000-0000-0000-000000000001');
select test.eq((select (public.my_streak()->>'current_streak')::int), 0, 'starts at zero');
select test.eq((select (public.my_streak()->>'claimed_today')::boolean), false, 'not claimed yet');
select test.eq((select (public.my_streak()->>'next_day_index')::int), 1, 'next is day 1');
select test.eq((select (public.my_streak()->>'next_reward')::int), 1000, 'next reward shown before claiming');

select test.eq((select public.claim_daily_streak()->>'status'), 'ok', 'first claim ok');
select test.eq((select current_streak from user_streaks where user_id='cccc0000-0000-0000-0000-000000000001'), 1, 'streak is 1');
select test.eq((select balance from point_wallets where user_id='cccc0000-0000-0000-0000-000000000001'), 1000::bigint, 'day1 reward granted');
select test.eq((select (public.my_streak()->>'claimed_today')::boolean), true, 'claimed_today is true');

-- ---------- 同日の2回目は duplicate ----------
select test.eq((select public.claim_daily_streak()->>'status'), 'duplicate', 'same day is duplicate');
select test.eq((select (public.claim_daily_streak()->>'current_streak')::int), 1, 'duplicate reports the current streak');
select test.eq((select balance from point_wallets where user_id='cccc0000-0000-0000-0000-000000000001'), 1000::bigint, 'no double grant on repeat');
select test.eq((select total_claims from user_streaks where user_id='cccc0000-0000-0000-0000-000000000001'), 1, 'claim count not inflated');

-- ---------- 行を改竄しても同日に二重付与できない ----------
-- 冪等キーが「ユーザー＋サービス日付」なので、last_claim_on を偽っても付与は増えない。
-- ストリーク行を書き換えてポイントを増やす、という抜け道を塞いでいることの確認。
update user_streaks set last_claim_on = public.service_today() - 1
  where user_id='cccc0000-0000-0000-0000-000000000001';
select test.eq((select public.claim_daily_streak()->>'status'), 'ok', 'claim proceeds after tampering');
select test.eq((select balance from point_wallets where user_id='cccc0000-0000-0000-0000-000000000001'), 1000::bigint,
               'idempotency key blocks a second grant on the same calendar day');
select test.eq(
  (select count(*)::int from point_ledger
    where reason='streak' and user_id='cccc0000-0000-0000-0000-000000000001'),
  1, 'exactly one streak ledger entry for the day');

-- ---------- 2日目 ----------
select pg_temp.seed_streak('cccc0000-0000-0000-0000-000000000002', 1, 1);
select test.set_uid('cccc0000-0000-0000-0000-000000000002');
select test.eq((select (public.my_streak()->>'next_day_index')::int), 2, 'next is day 2 when yesterday claimed');
select test.eq((select (public.my_streak()->>'next_reward')::int), 1500, 'day2 reward previewed');
select test.eq((select (public.claim_daily_streak()->>'streak')::int), 2, 'streak advances to 2');
select test.eq((select balance from point_wallets where user_id='cccc0000-0000-0000-0000-000000000002'), 1500::bigint, 'day2 reward granted');
select test.eq((select longest_streak from user_streaks where user_id='cccc0000-0000-0000-0000-000000000002'), 2, 'longest updated');

-- ---------- 最終段（7日目） ----------
select pg_temp.seed_streak('cccc0000-0000-0000-0000-000000000003', 6, 1);
select test.set_uid('cccc0000-0000-0000-0000-000000000003');
select test.eq((select (public.my_streak()->>'next_reward')::int), 10000, 'day7 is the big reward');
select test.eq((select (public.claim_daily_streak()->>'completed')::boolean), true, 'completing the ladder is reported');
select test.eq((select balance from point_wallets where user_id='cccc0000-0000-0000-0000-000000000003'), 10000::bigint, 'day7 reward granted');
select test.eq((select current_streak from user_streaks where user_id='cccc0000-0000-0000-0000-000000000003'), 7, 'streak is 7');

-- ---------- 一巡したら1日目に戻る ----------
select pg_temp.seed_streak('cccc0000-0000-0000-0000-000000000004', 7, 1);
select test.set_uid('cccc0000-0000-0000-0000-000000000004');
select test.eq((select (public.my_streak()->>'next_day_index')::int), 1, 'wraps back to day 1 after the last tier');
select test.eq((select (public.claim_daily_streak()->>'streak')::int), 1, 'claim restarts the ladder');
select test.eq((select balance from point_wallets where user_id='cccc0000-0000-0000-0000-000000000004'), 1000::bigint, 'day1 reward again after wrap');
-- 最長記録は保持される
select test.eq((select longest_streak from user_streaks where user_id='cccc0000-0000-0000-0000-000000000004'), 7, 'longest streak preserved after wrap');

-- ---------- 途切れたらリセット ----------
select pg_temp.seed_streak('cccc0000-0000-0000-0000-000000000005', 5, 3);  -- 3日前が最後
select test.set_uid('cccc0000-0000-0000-0000-000000000005');
select test.eq((select (public.my_streak()->>'next_day_index')::int), 1, 'broken streak restarts at day 1');
select test.eq((select (public.my_streak()->>'broken')::boolean), true, 'broken flag exposed for the UI');
select test.eq((select (public.claim_daily_streak()->>'streak')::int), 1, 'claim restarts at 1');
select test.eq((select balance from point_wallets where user_id='cccc0000-0000-0000-0000-000000000005'), 1000::bigint, 'day1 reward after reset');
select test.eq((select longest_streak from user_streaks where user_id='cccc0000-0000-0000-0000-000000000005'), 5, 'longest streak preserved after break');

-- ---------- BAN/凍結/退会は対象外 ----------
insert into user_moderation_state(user_id, state, reason)
  values ('cccc0000-0000-0000-0000-000000000006','frozen','test')
  on conflict (user_id) do update set state='frozen';
select test.set_uid('cccc0000-0000-0000-0000-000000000006');
select test.eq((select public.claim_daily_streak()->>'reason'), 'user_frozen', 'frozen user cannot claim');
select test.eq((select coalesce(balance,0) from point_wallets where user_id='cccc0000-0000-0000-0000-000000000006'), 0::bigint, 'no points for frozen user');
select test.eq((select count(*)::int from user_streaks where user_id='cccc0000-0000-0000-0000-000000000006'), 0, 'no streak row created for blocked user');

update user_moderation_state set state='deleted' where user_id='cccc0000-0000-0000-0000-000000000006';
select test.eq((select public.claim_daily_streak()->>'reason'), 'user_deleted', 'deleted user cannot claim');

update user_moderation_state set state='banned' where user_id='cccc0000-0000-0000-0000-000000000006';
select test.eq((select public.claim_daily_streak()->>'reason'), 'user_banned', 'banned user cannot claim');

-- ---------- 台帳への記録 ----------
select test.set_uid(null);
select test.ok((select count(*)::int from point_ledger where reason='streak') >= 5, 'streak grants recorded in the ledger');
select test.eq(
  (select idempotency_key from point_ledger
    where reason='streak' and user_id='cccc0000-0000-0000-0000-000000000002'),
  'streak:cccc0000-0000-0000-0000-000000000002:' || public.service_today()::text,
  'idempotency key is scoped to user and service date');

-- ---------- 段階報酬はユーザーに見せる（継続の動機になる） ----------
select test.eq(has_table_privilege('authenticated', 'public.streak_rewards', 'select'), true, 'reward ladder visible to users');
select test.eq((select count(*)::int from streak_rewards), 7, 'seven tiers seeded');
-- 段階は単調増加（後半のほうが得、でないと続ける動機にならない）
select test.eq(
  (select count(*)::int from (
     select reward_points, lag(reward_points) over (order by day_index) as prev
     from streak_rewards) t
   where prev is not null and reward_points <= prev),
  0, 'rewards increase monotonically across the ladder');

-- ---------- 運営の集計 ----------
select test.ok((select users_with_streak from admin_streak_summary) >= 5, 'summary counts users');
select test.ok((select claimed_today from admin_streak_summary) >= 5, 'summary counts today claims');
select test.ok((select best_streak from admin_streak_summary) >= 7, 'summary reports best streak');
select test.ok((select streak_7plus from admin_streak_summary) >= 1, 'summary counts 7-day streaks');

-- ---------- サービス日付 ----------
-- 端末の時計ではなくサーバ側の日付で判定していること（改竄でボーナスを取り放題にしない）
select test.ok((select public.service_today()) is not null, 'service_today resolves');
select test.eq(has_function_privilege('anon', 'public.service_today()', 'execute'), false, 'service_today not exposed to anon');

-- ---------- 権限 ----------
select test.eq(has_function_privilege('authenticated', 'public.claim_daily_streak()', 'execute'), true, 'users can claim');
select test.eq(has_function_privilege('anon', 'public.claim_daily_streak()', 'execute'), false, 'anon cannot claim');
select test.eq(has_function_privilege('authenticated', 'public.my_streak()', 'execute'), true, 'users can read their streak');
select test.eq(has_table_privilege('authenticated', 'public.admin_streak_summary', 'select'), false, 'admin summary hidden from users');
select test.eq((select relrowsecurity from pg_class where relname='user_streaks'), true, 'user_streaks RLS enabled');

rollback;
