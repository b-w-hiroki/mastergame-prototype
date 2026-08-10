-- ============================================================
-- RLS の実効性（0030 / ハーネス修正で初めて検証可能になった領域）
--
-- ■ なぜこのテストが必要か
-- 他のテストは superuser で実行されるため **RLS が完全にバイパス**される。
-- つまり「ポリシーが実際に行を絞れているか」は一度も検証されていなかった。
-- ここでは `set role authenticated` / `set role anon` に切り替えて、
-- **本番と同じ経路（PostgREST が使うロール）** で行が絞られることを確認する。
--
-- ハーネスは Supabase の既定権限（anon/authenticated への付与）を再現しているので、
-- 「権限が無いから読めない」ではなく「ポリシーが効いているから読めない」ことを見ている。
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('dddd0000-0000-0000-0000-00000000000a'); -- userA
select test.new_user('dddd0000-0000-0000-0000-00000000000b'); -- userB

-- userA のデータを一式作る（superuser で作成＝RLS を通さずに投入）
select public.apply_points('dddd0000-0000-0000-0000-00000000000a', 5000, 'mission');
insert into inquiries(user_id, category, subject) values
  ('dddd0000-0000-0000-0000-00000000000a','points','Aの問い合わせ');
insert into inquiry_messages(inquiry_id, author_id, is_staff, body)
  select id, 'dddd0000-0000-0000-0000-00000000000a', false, 'Aの本文' from inquiries where subject='Aの問い合わせ';
insert into user_devices(user_id, device_id) values ('dddd0000-0000-0000-0000-00000000000a','devA');
insert into user_streaks(user_id, current_streak) values ('dddd0000-0000-0000-0000-00000000000a', 3);
insert into notifications(user_id, type) values ('dddd0000-0000-0000-0000-00000000000a','test');
insert into user_games(user_id, game_id) select 'dddd0000-0000-0000-0000-00000000000a', id from games limit 1;
insert into account_deletions(user_id, scheduled_at) values ('dddd0000-0000-0000-0000-00000000000a', now() + interval '7 days');
insert into legal_acceptances(user_id, slug, version) values ('dddd0000-0000-0000-0000-00000000000a','terms','2026-07-01');
insert into push_tokens(token, user_id, platform) values ('ExpoTok[A]','dddd0000-0000-0000-0000-00000000000a','ios');

-- ============================================================
-- 1) 他人のデータが見えないこと（本人限定ポリシーの実効性）
-- ============================================================
select test.set_uid('dddd0000-0000-0000-0000-00000000000b');
set local role authenticated;

-- 注: handle_new_user トリガで B 自身の wallet / profile は自動作成される。
-- よって「0件」ではなく「**A の行が見えないこと**」を名指しで確認する。
select test.eq((select count(*)::int from point_wallets
                 where user_id='dddd0000-0000-0000-0000-00000000000a'), 0, 'B cannot see A wallet');
select test.eq((select count(*)::int from point_wallets), 1, 'B sees only their own wallet');
select test.eq((select count(*)::int from point_ledger),      0, 'B cannot see A ledger');
select test.eq((select count(*)::int from inquiries),         0, 'B cannot see A inquiries');
select test.eq((select count(*)::int from inquiry_messages),  0, 'B cannot see A inquiry messages');
select test.eq((select count(*)::int from user_devices),      0, 'B cannot see A devices');
select test.eq((select count(*)::int from user_streaks),      0, 'B cannot see A streak');
select test.eq((select count(*)::int from notifications),     0, 'B cannot see A notifications');
select test.eq((select count(*)::int from user_games),        0, 'B cannot see A game follows');
select test.eq((select count(*)::int from account_deletions), 0, 'B cannot see A deletion request');
select test.eq((select count(*)::int from legal_acceptances), 0, 'B cannot see A consent records');
select test.eq((select count(*)::int from push_tokens),       0, 'B cannot see A push tokens');
select test.eq((select count(*)::int from profiles
                 where id='dddd0000-0000-0000-0000-00000000000a'), 0, 'B cannot see A profile');
select test.eq((select count(*)::int from profiles), 1, 'B sees only their own profile');

reset role;

-- ============================================================
-- 2) 本人のデータは見えること（絞りすぎていないこと）
-- ============================================================
select test.set_uid('dddd0000-0000-0000-0000-00000000000a');
set local role authenticated;

select test.eq((select count(*)::int from point_wallets),     1, 'A sees own wallet');
select test.eq((select balance from point_wallets),    5000::bigint, 'A sees own balance');
select test.eq((select count(*)::int from point_ledger),      1, 'A sees own ledger');
select test.eq((select count(*)::int from inquiries),         1, 'A sees own inquiries');
select test.eq((select count(*)::int from inquiry_messages),  1, 'A sees own inquiry messages');
select test.eq((select count(*)::int from user_devices),      1, 'A sees own devices');
select test.eq((select count(*)::int from user_streaks),      1, 'A sees own streak');
select test.eq((select count(*)::int from notifications),     1, 'A sees own notifications');
select test.eq((select count(*)::int from user_games),        1, 'A sees own follows');
select test.eq((select count(*)::int from account_deletions), 1, 'A sees own deletion request');
select test.eq((select count(*)::int from legal_acceptances), 1, 'A sees own consent records');
select test.eq((select count(*)::int from push_tokens),       1, 'A sees own push tokens');
select test.eq((select count(*)::int from profiles),          1, 'A sees own profile');

reset role;

-- ============================================================
-- 3) 直接書き込みができないこと（付与は RPC 経由のみ）
-- ============================================================
select test.set_uid('dddd0000-0000-0000-0000-00000000000b');
set local role authenticated;

-- 台帳・残高を自分で書ければポイントを鋳造できてしまう
select test.raises($$insert into point_ledger(user_id, delta, reason)
                     values ('dddd0000-0000-0000-0000-00000000000b', 999999, 'hack')$$,
                   'user cannot insert into the ledger directly');
select test.raises($$insert into point_wallets(user_id, balance)
                     values ('dddd0000-0000-0000-0000-00000000000b', 999999)$$,
                   'user cannot create a wallet with a balance');
-- RLS は UPDATE/DELETE では例外を投げず、**対象行を0件に絞る**（例外を投げるのは INSERT）。
-- したがって「エラーになること」ではなく「**データが変わらないこと**」で検証する。
update point_wallets set balance = 999999;
select test.eq((select balance from point_wallets), 0::bigint, 'user cannot raise their own balance');
update point_wallets set balance = 999999
  where user_id = 'dddd0000-0000-0000-0000-00000000000a';
reset role;
select test.eq((select balance from point_wallets where user_id='dddd0000-0000-0000-0000-00000000000a'),
               5000::bigint, 'user cannot alter another user balance');
set local role authenticated;
-- 他人の問い合わせに運営を騙って返信できない。
-- 注: B からは A の問い合わせが見えないため `select ... from inquiries` だと対象0件で
-- 例外にならず**アサーションが空振りする**。ID を名指しして本当に試す。
reset role;
select set_config('test.inq_id',
                  (select id::text from inquiries where subject='Aの問い合わせ'), false);
set local role authenticated;
select test.raises($$insert into inquiry_messages(inquiry_id, is_staff, body)
                     values (current_setting('test.inq_id')::uuid, true, 'なりすまし')$$,
                   'user cannot post a staff message into another user thread');
-- 自分名義でも直接は書けない（返信は reply_to_inquiry RPC 経由のみ）
select test.raises($$insert into inquiry_messages(inquiry_id, is_staff, body)
                     values (current_setting('test.inq_id')::uuid, false, '直接書き込み')$$,
                   'direct writes to inquiry threads are blocked');
-- ストリークを自分で進められない（INSERT はポリシー不在で例外）
select test.raises($$insert into user_streaks(user_id, current_streak)
                     values ('dddd0000-0000-0000-0000-00000000000b', 99)$$,
                   'user cannot write their own streak');
-- 既存のストリークも書き換えられない（UPDATE は0件に絞られる）
update user_streaks set current_streak = 99;
reset role;
select test.eq((select current_streak from user_streaks
                 where user_id='dddd0000-0000-0000-0000-00000000000a'), 3, 'user cannot inflate a streak');
set local role authenticated;
-- 不正フラグには触れない（0030 で権限も剥奪済み＝例外）
select test.raises($$delete from fraud_flags$$, 'user cannot touch fraud flags');
select test.raises($$select count(*) from fraud_flags$$, 'user cannot even read fraud flags');

reset role;

-- ============================================================
-- 4) 未ログイン（anon）から見えるのは登録前に必要なものだけ
-- ============================================================
select test.set_uid(null);
set local role anon;

-- 見せるもの: どんなゲームがあるか / 規約類
select test.ok((select count(*)::int from games) > 0, 'anon can browse games before signup');
select test.ok((select count(*)::int from legal_documents) > 0, 'anon can read the terms before signup');

-- 見せないもの
select test.raises($$select count(*) from profiles$$,      'anon cannot read profiles');
select test.raises($$select count(*) from point_wallets$$, 'anon cannot read wallets');
select test.raises($$select count(*) from inquiries$$,     'anon cannot read inquiries');
select test.raises($$select count(*) from user_games$$,    'anon cannot read follows');
select test.raises($$select count(*) from missions$$,      'anon cannot read missions');
select test.raises($$select count(*) from topics$$,        'anon cannot read community topics');

reset role;

-- ============================================================
-- 5) 運用設定・収益情報がクライアントに漏れないこと
-- ============================================================
-- app_config は粗利構造（payout_ratio / redemption_mix）と不正対策の閾値
-- （daily_offer_cap / referral_referrer_daily_cap）を含む。
-- 0030 以前は `using (true)` のポリシーで誰でも読めた。
select test.set_uid('dddd0000-0000-0000-0000-00000000000a');
set local role authenticated;

select test.raises($$select count(*) from app_config$$,          'operational config is not client-readable');
select test.raises($$select count(*) from fraud_settings$$,      'fraud thresholds are not client-readable');
select test.raises($$select count(*) from revenue_benchmarks$$,  'revenue per action is not client-readable');
select test.raises($$select count(*) from ad_partners$$,         'partner secrets are not client-readable');
select test.raises($$select count(*) from app_events$$,          'raw event logs are not client-readable');
select test.raises($$select count(*) from fraud_flags$$,         'fraud flags are not client-readable');
select test.raises($$select count(*) from user_roles$$,          'role assignments are not client-readable');

-- 運営ビューも同様
select test.raises($$select count(*) from admin_overview$$,        'admin views are not client-readable');
select test.raises($$select count(*) from admin_economy_summary$$, 'economy summary is not client-readable');
select test.raises($$select count(*) from admin_fraud_rows$$,      'fraud review is not client-readable');
select test.raises($$select count(*) from retention_cohorts$$,     'retention data is not client-readable');

reset role;

-- ============================================================
-- 6) コミュニティは「見える範囲」が正しいこと
-- ============================================================
insert into topics(forum_id, author_id, kind, title, moderation_state)
  select f.id, 'dddd0000-0000-0000-0000-00000000000a', 'chat', '非表示トピック', 'hidden'
    from forums f limit 1;
insert into topics(forum_id, author_id, kind, title, moderation_state)
  select f.id, 'dddd0000-0000-0000-0000-00000000000a', 'chat', '公開トピック', 'visible'
    from forums f limit 1;

select test.set_uid('dddd0000-0000-0000-0000-00000000000b');
set local role authenticated;
-- 他人の投稿でも公開されているものは見える（コミュニティとして正しい）
select test.eq((select count(*)::int from topics where title='公開トピック'), 1, 'visible topics are readable by others');
-- モデレーションで隠したものは見えない
select test.eq((select count(*)::int from topics where title='非表示トピック'), 0, 'hidden topics are filtered by RLS');
reset role;

rollback;
