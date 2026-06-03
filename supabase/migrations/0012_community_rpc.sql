-- ============================================================
-- MasterGame — 0012 community write RPCs
-- Topic creation / reply / reaction / best answer (+ bounty escrow).
-- All writes flow through SECURITY DEFINER functions (RLS allows read only).
-- Reflects docs/specs/community-guild.md
-- ============================================================

-- 新規トピック作成（OP投稿を同時作成。任意でポイントを賭けてエスクロー）
create or replace function public.create_topic(
  p_forum_id uuid, p_kind text, p_title text, p_body text, p_bounty_amount integer default 0
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_forum  forums;
  v_topic  uuid;
  v_post   uuid;
  v_bal    bigint;
  v_ledger uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('request','question','chat') then raise exception 'invalid kind'; end if;
  if coalesce(btrim(p_title),'') = '' then raise exception 'title required'; end if;
  if char_length(p_title) > 120 then raise exception 'title too long'; end if;
  if coalesce(btrim(p_body),'') = '' then raise exception 'body required'; end if;
  if p_bounty_amount < 0 then raise exception 'invalid bounty amount'; end if;

  select * into v_forum from forums
    where id = p_forum_id and deleted_at is null and visibility <> 'archived';
  if not found then raise exception 'forum not found'; end if;
  if not v_forum.is_open then raise exception 'forum closed'; end if;
  if p_bounty_amount > 0 and p_kind <> 'question' then
    raise exception 'bounty is only for questions';
  end if;

  insert into topics(forum_id, author_id, kind, title, has_bounty)
    values (p_forum_id, v_uid, p_kind, btrim(p_title), p_bounty_amount > 0)
    returning id into v_topic;

  insert into posts(topic_id, author_id, body, is_op)
    values (v_topic, v_uid, p_body, true)
    returning id into v_post;

  -- 賭け：作成時点で残高から出金しエスクロー
  if p_bounty_amount > 0 then
    select balance into v_bal from point_wallets where user_id = v_uid for update;
    if v_bal is null or v_bal < p_bounty_amount then
      raise exception 'insufficient points for bounty';
    end if;
    v_ledger := apply_points(v_uid, -p_bounty_amount, 'bounty_escrow', 'topic', v_topic);
    insert into bounty_questions(topic_id, amount, escrow_ledger_id, state)
      values (v_topic, p_bounty_amount, v_ledger, 'escrowed');
  end if;

  update profiles set xp = xp + 5 where id = v_uid;   -- 活動でXP

  return jsonb_build_object('ok', true, 'topic_id', v_topic, 'post_id', v_post);
end $$;

-- 返信（reply_count / last_activity を更新し、作者へ通知）
create or replace function public.add_reply(p_topic_id uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_topic topics;
  v_post  uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce(btrim(p_body),'') = '' then raise exception 'body required'; end if;

  select * into v_topic from topics where id = p_topic_id;
  if not found then raise exception 'topic not found'; end if;
  if v_topic.status in ('closed','removed') then raise exception 'topic is closed'; end if;
  if v_topic.moderation_state <> 'visible' then raise exception 'topic unavailable'; end if;

  insert into posts(topic_id, author_id, body, is_op)
    values (p_topic_id, v_uid, p_body, false)
    returning id into v_post;

  update topics set reply_count = reply_count + 1, last_activity_at = now()
    where id = p_topic_id;

  if v_topic.author_id <> v_uid then
    insert into notifications(user_id, type, payload)
      values (v_topic.author_id, 'reply',
        jsonb_build_object('topic_id', p_topic_id, 'post_id', v_post));
  end if;

  update profiles set xp = xp + 2 where id = v_uid;

  return jsonb_build_object('ok', true, 'post_id', v_post);
end $$;

-- リアクション（押下でトグル）。新規付与時のみ作者へ通知。
create or replace function public.toggle_reaction(p_post_id uuid, p_kind text default 'like')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_post     posts;
  v_existing uuid;
  v_reacted  boolean;
  v_count    integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_kind not in ('like','spotlight') then raise exception 'invalid kind'; end if;

  select * into v_post from posts where id = p_post_id and deleted_at is null;
  if not found then raise exception 'post not found'; end if;

  select id into v_existing from reactions
    where post_id = p_post_id and user_id = v_uid and kind = p_kind;

  if v_existing is not null then
    delete from reactions where id = v_existing;
    v_reacted := false;
  else
    insert into reactions(post_id, user_id, kind) values (p_post_id, v_uid, p_kind);
    v_reacted := true;
    if v_post.author_id <> v_uid then
      insert into notifications(user_id, type, payload)
        values (v_post.author_id, 'reaction',
          jsonb_build_object('post_id', p_post_id, 'kind', p_kind));
    end if;
  end if;

  select count(*) into v_count from reactions where post_id = p_post_id and kind = p_kind;
  return jsonb_build_object('ok', true, 'reacted', v_reacted, 'count', v_count);
end $$;

-- ベストアンサー確定（作者のみ）。賭けがあればエスクローを回答者へ付与。
create or replace function public.set_best_answer(p_topic_id uuid, p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_topic  topics;
  v_post   posts;
  v_bounty bounty_questions;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_topic from topics where id = p_topic_id;
  if not found then raise exception 'topic not found'; end if;
  if v_topic.author_id <> v_uid then
    raise exception 'only the topic author can pick the best answer';
  end if;

  select * into v_post from posts
    where id = p_post_id and topic_id = p_topic_id and deleted_at is null;
  if not found then raise exception 'post not found in topic'; end if;
  if v_post.is_op then raise exception 'cannot pick the original post'; end if;

  update topics set best_answer_post_id = p_post_id, status = 'resolved'
    where id = p_topic_id;

  -- 賭け質問：エスクローから賞金を回答者へ
  select * into v_bounty from bounty_questions where topic_id = p_topic_id;
  if found and v_bounty.state = 'escrowed' then
    perform apply_points(v_post.author_id, v_bounty.amount, 'bounty_award', 'topic', p_topic_id);
    update bounty_questions
      set state = 'awarded', awarded_post_id = p_post_id, resolved_at = now()
      where topic_id = p_topic_id;
  end if;

  if v_post.author_id <> v_uid then
    insert into notifications(user_id, type, payload)
      values (v_post.author_id, 'best_answer',
        jsonb_build_object('topic_id', p_topic_id, 'post_id', p_post_id));
  end if;

  return jsonb_build_object('ok', true, 'best_answer_post_id', p_post_id);
end $$;

grant execute on function public.create_topic(uuid, text, text, text, integer) to authenticated;
grant execute on function public.add_reply(uuid, text)                          to authenticated;
grant execute on function public.toggle_reaction(uuid, text)                    to authenticated;
grant execute on function public.set_best_answer(uuid, uuid)                    to authenticated;
