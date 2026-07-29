-- ============================================================
-- 0025: ゲームハブ（タイトル軸のコミュニティ）
--
-- 「MasterGame」という名前でありながら、コミュニティは汎用のトピック/投稿でしかなく、
-- 「ゲーマー向け」である必然性がプロダクトに出ていなかった。ポイ活アプリは無数にあるので、
-- 差別化はここでしか作れない：**ゲームタイトルを軸にコミュニティを構造化する**。
--
-- forums にはもともと type='game' と game_id 列があったのに使われていなかった
-- （seed の 'eldia-guild' も game_id が NULL のまま）。その設計を実際に動かす。
--
--   1) games の拡充     … プラットフォーム/リリース日/公式サイト等のメタ
--   2) ensure_game_forum … タイトルごとの掲示板を自動で用意し forums.game_id で紐づける
--   3) user_games       … タイトルのフォロー（＝関心の明示。フィードの素になる）
--   4) game_hub_rows    … 一覧用（フォロワー数・トピック数つき）
--   5) my_game_feed     … フォロー中タイトルのトピックだけを流すフィード
-- ============================================================

-- ---------- 1) games の拡充 ----------
alter table public.games add column if not exists description  text;
alter table public.games add column if not exists cover_url    text;
alter table public.games add column if not exists publisher    text;
alter table public.games add column if not exists platforms    text[] not null default '{}';
alter table public.games add column if not exists released_on  date;
alter table public.games add column if not exists is_featured  boolean not null default false;

-- 一覧は「注目 → 名前順」で出すことが多い
create index if not exists idx_games_featured on public.games(is_featured desc, name)
  where is_active;

-- games は公開情報。未ログインでも見られてよい（登録前に「どんなゲームがあるか」を見せたい）
alter table public.games enable row level security;
drop policy if exists games_public_read on public.games;
create policy games_public_read on public.games for select using (is_active);
grant select on public.games to anon, authenticated;

-- ---------- 2) タイトルごとの掲示板 ----------
-- 1タイトル1掲示板。既にあれば作らない（冪等）。
create unique index if not exists idx_forums_game on public.forums(game_id)
  where game_id is not null and deleted_at is null;

create or replace function public.ensure_game_forum(p_game_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_game games; v_forum uuid;
begin
  select * into v_game from games where id = p_game_id;
  if not found then raise exception 'game not found'; end if;

  select id into v_forum from forums
   where game_id = p_game_id and deleted_at is null;
  if found then return v_forum; end if;

  insert into forums(slug, name, description, type, game_id, visibility, is_open)
    values ('game-' || v_game.slug,
            v_game.name,
            v_game.name || ' の攻略・質問・パーティ募集',
            'game', p_game_id, 'listed', true)
  on conflict (slug) do update set game_id = excluded.game_id  -- 既存 slug があれば紐づけ直す
  returning id into v_forum;

  return v_forum;
end $$;
revoke all on function public.ensure_game_forum(uuid) from public, anon, authenticated;

-- 既存タイトルぶんを用意し、seed の 'eldia-guild'（game_id が NULL のまま放置されていた）を紐づける
update public.forums f
   set game_id = g.id
  from public.games g
 where f.slug = 'eldia-guild' and f.game_id is null and g.slug = 'eldia';

do $$ declare r record; begin
  for r in select id from public.games where is_active loop
    perform public.ensure_game_forum(r.id);
  end loop;
end $$;

-- 新しいタイトルを追加したら掲示板も自動で用意する
create or replace function public.tg_game_forum() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_active then perform ensure_game_forum(new.id); end if;
  return new;
end $$;

drop trigger if exists trg_game_forum on public.games;
create trigger trg_game_forum after insert on public.games
  for each row execute function public.tg_game_forum();

-- ---------- 3) タイトルのフォロー ----------
create table if not exists public.user_games (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_id     uuid not null references public.games(id) on delete cascade,
  followed_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists idx_user_games_game on public.user_games(game_id);

alter table public.user_games enable row level security;
drop policy if exists ug_self_all on public.user_games;
-- 自分のフォローは自分で読み書きできる（ポイントが動かないので RPC 必須にはしない）
create policy ug_self_all on public.user_games
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, delete on public.user_games to authenticated;

-- ---------- 4) 一覧用ビュー ----------
create or replace view public.game_hub_rows
with (security_invoker = on) as
select
  g.id, g.slug, g.name, g.genre, g.description, g.icon_url, g.cover_url,
  g.publisher, g.platforms, g.released_on, g.is_featured,
  f.id as forum_id,
  (select count(*) from user_games ug where ug.game_id = g.id)          as followers,
  (select count(*) from topics t
     where t.forum_id = f.id and t.moderation_state = 'visible')        as topic_count,
  (select max(t.last_activity_at) from topics t where t.forum_id = f.id) as last_activity_at
from public.games g
left join public.forums f on f.game_id = g.id and f.deleted_at is null
where g.is_active;
grant select on public.game_hub_rows to anon, authenticated;

-- ---------- 5) フォロー中タイトルのフィード ----------
-- 「自分が関心を示したタイトルの動き」だけを流す。汎用の新着一覧との差はここ。
create or replace function public.my_game_feed(p_limit int default 30)
returns table (
  topic_id uuid, forum_id uuid, game_id uuid, game_name text,
  kind text, title text, reply_count int, has_bounty boolean, last_activity_at timestamptz
) language sql stable security definer set search_path = public as $$
  select t.id, t.forum_id, g.id, g.name,
         t.kind, t.title, t.reply_count, t.has_bounty, t.last_activity_at
    from user_games ug
    join games g   on g.id = ug.game_id and g.is_active
    join forums f  on f.game_id = g.id and f.deleted_at is null
    join topics t  on t.forum_id = f.id and t.moderation_state = 'visible'
   where ug.user_id = auth.uid()
   order by t.last_activity_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;
revoke all on function public.my_game_feed(int) from public, anon;
grant execute on function public.my_game_feed(int) to authenticated;

-- ---------- 既存タイトルのメタを埋める ----------
-- 既に seed 済みのDB向けの backfill。新規環境では seed.sql 側が最初から値を持つ
-- （run.sh は migrations → seed の順なので、ここでの UPDATE は新規環境では 0 行になる）。
-- 実在タイトルではなくプロトタイプ用の作例。運営が管理画面から差し替える前提。
update public.games set
  description = case slug
    when 'eldia'          then '王道ファンタジーRPG。パーティ編成と属性相性が肝。'
    when 'monster'        then 'モンスターを育てて競う対戦ストラテジー。'
    when 'starfall'       then '爽快な弾幕シューティング。週替りのランキング戦。'
    when 'puzzle-kingdom' then '連鎖を繋ぐパズル。デイリーの詰めパズルが人気。'
    when 'sengoku'        then '戦国武将を集めて領地を広げるシミュレーション。'
    else description end,
  platforms = case slug
    when 'eldia'          then array['ios','android']
    when 'monster'        then array['ios','android','pc']
    when 'starfall'       then array['ios','android']
    when 'puzzle-kingdom' then array['ios','android']
    when 'sengoku'        then array['ios','android','pc']
    else platforms end,
  is_featured = slug in ('eldia', 'monster')
where slug in ('eldia','monster','starfall','puzzle-kingdom','sengoku');
