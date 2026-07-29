-- ============================================================
-- ゲームハブ（0025）
--   - タイトルごとの掲示板が自動で用意され forums.game_id で紐づく（冪等・新規追加も自動）
--   - seed の 'eldia-guild'（game_id が NULL のまま放置されていた）が紐づく
--   - user_games のフォローは本人のみ（RLS）
--   - game_hub_rows の集計、my_game_feed がフォロー中タイトルだけを返す
--   - 権限
-- ============================================================
\set ON_ERROR_STOP on
begin;

select test.new_user('88888888-0000-0000-0000-000000000001');
select test.new_user('88888888-0000-0000-0000-000000000002');

-- ---------- 掲示板の自動生成 ----------
-- seed の全タイトルに掲示板がある
select test.eq(
  (select count(*)::int from games g where g.is_active
     and not exists (select 1 from forums f where f.game_id = g.id and f.deleted_at is null)),
  0, 'every active game has a forum');

-- 1タイトル1掲示板（seed が手で作っていた分と自動生成で二重にならないこと）
select test.eq((select count(*)::int from forums f join games g on g.id=f.game_id
                 where g.slug='eldia' and f.deleted_at is null), 1, 'exactly one forum per game');
-- game_id への UNIQUE 制約が二重紐づけを防ぐ
select test.raises(
  $$insert into forums(slug,name,type,game_id) values ('dup-eldia','重複','game',(select id from games where slug='eldia'))$$,
  'second forum for the same game rejected');

-- ensure_game_forum は冪等（二度呼んでも増えない）
select test.eq((select public.ensure_game_forum((select id from games where slug='monster'))),
               (select public.ensure_game_forum((select id from games where slug='monster'))),
               'ensure_game_forum is idempotent');

-- 新しいタイトルを足すと掲示板も自動でできる（トリガ）
insert into games(slug, name, genre) values ('newgame','ニューゲーム','action');
select test.eq((select count(*)::int from forums f join games g on g.id=f.game_id where g.slug='newgame'), 1,
               'new game gets a forum automatically');
select test.eq((select type from forums f join games g on g.id=f.game_id where g.slug='newgame'), 'game',
               'generated forum is a game forum');

-- 非アクティブなタイトルには作らない
insert into games(slug, name, genre, is_active) values ('hidden','非公開','rpg', false);
select test.eq((select count(*)::int from forums f join games g on g.id=f.game_id where g.slug='hidden'), 0,
               'inactive game gets no forum');

-- ---------- フォロー ----------
select test.set_uid('88888888-0000-0000-0000-000000000001');
insert into user_games(user_id, game_id) values
  ('88888888-0000-0000-0000-000000000001', (select id from games where slug='eldia'));
select test.eq((select count(*)::int from user_games where user_id='88888888-0000-0000-0000-000000000001'), 1, 'follow recorded');

-- 同じタイトルの二重フォローは主キーで防がれる
select test.raises(
  $$insert into user_games(user_id, game_id) values ('88888888-0000-0000-0000-000000000001',(select id from games where slug='eldia'))$$,
  'duplicate follow rejected');

-- ---------- 集計ビュー ----------
select test.eq((select followers from game_hub_rows where slug='eldia'), 1::bigint, 'follower count');
select test.eq((select followers from game_hub_rows where slug='monster'), 0::bigint, 'zero followers is zero, not null');
select test.eq((select forum_id is not null from game_hub_rows where slug='starfall'), true, 'forum linked in the view');
select test.eq((select is_featured from game_hub_rows where slug='eldia'), true, 'featured flag exposed');
-- 非アクティブは一覧に出ない
select test.eq((select count(*)::int from game_hub_rows where slug='hidden'), 0, 'inactive game hidden from the hub');

-- ---------- フィード ----------
-- eldia の掲示板にトピックを作る
insert into topics(forum_id, author_id, kind, title)
  select f.id, '88888888-0000-0000-0000-000000000002', 'question', 'ボス攻略のコツは？'
    from forums f join games g on g.id = f.game_id where g.slug='eldia';
-- フォローしていない monster にもトピックを作る
insert into topics(forum_id, author_id, kind, title)
  select f.id, '88888888-0000-0000-0000-000000000002', 'chat', '雑談スレ'
    from forums f join games g on g.id = f.game_id where g.slug='monster';

select test.eq((select topic_count from game_hub_rows where slug='eldia'), 1::bigint, 'topic count per game');

-- フォロー中のタイトルのトピックだけが流れる（ここが汎用の新着一覧との差）
select test.eq((select count(*)::int from public.my_game_feed()), 1, 'feed only covers followed games');
select test.eq((select title from public.my_game_feed()), 'ボス攻略のコツは？', 'feed returns the followed title topic');
select test.eq((select game_name from public.my_game_feed()), 'エルディア戦記', 'feed carries the game name');

-- 何もフォローしていないユーザーのフィードは空
select test.set_uid('88888888-0000-0000-0000-000000000002');
select test.eq((select count(*)::int from public.my_game_feed()), 0, 'feed is empty without follows');

-- 非表示のトピックはフィードに出さない
select test.set_uid('88888888-0000-0000-0000-000000000001');
update topics set moderation_state = 'hidden' where title = 'ボス攻略のコツは？';
select test.eq((select count(*)::int from public.my_game_feed()), 0, 'hidden topics excluded from the feed');
select test.eq((select topic_count from game_hub_rows where slug='eldia'), 0::bigint, 'hidden topics excluded from counts');
update topics set moderation_state = 'visible' where title = 'ボス攻略のコツは？';

-- limit は範囲内に丸められる（過大な値でDBを引きずらない）
select test.eq((select count(*)::int from public.my_game_feed(99999)), 1, 'oversized limit is clamped, not rejected');
select test.eq((select count(*)::int from public.my_game_feed(0)), 1, 'zero limit falls back to at least one');

-- ---------- 権限 ----------
select test.eq(has_table_privilege('anon', 'public.games', 'select'), true, 'games readable before signup');
select test.eq(has_table_privilege('anon', 'public.game_hub_rows', 'select'), true, 'hub readable before signup');
select test.eq(has_table_privilege('anon', 'public.user_games', 'select'), false, 'follows not readable by anon');
select test.eq(has_function_privilege('anon', 'public.my_game_feed(int)', 'execute'), false, 'feed not callable by anon');
select test.eq(has_function_privilege('authenticated', 'public.my_game_feed(int)', 'execute'), true, 'feed callable by users');
select test.eq(has_function_privilege('authenticated', 'public.ensure_game_forum(uuid)', 'execute'), false, 'forum creation is internal only');
select test.eq((select relrowsecurity from pg_class where relname='user_games'), true, 'user_games RLS enabled');
select test.eq((select relrowsecurity from pg_class where relname='games'), true, 'games RLS enabled');

rollback;
