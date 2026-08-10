-- ============================================================
-- MasterGame — テストハーネス
--   - Supabase 環境の最小 shim（auth スキーマ/ロール/auth.uid）を「無ければ」用意する。
--     ローカル/CI の素の Postgres でも、Supabase 上でも動くよう冪等に書く。
--   - テスト用のアサーションヘルパと、ログインユーザーを切り替える set_uid() を提供。
-- 本ファイルはマイグレーション適用「後」に流す（本番マイグレーションには含めない）。
-- ============================================================

create extension if not exists pgcrypto;

-- ロール（Supabase では既に存在）
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- ---- Supabase の既定権限を再現する ----
-- Supabase は public スキーマのテーブル/関数に対し anon・authenticated へ既定で権限を付与する
-- （だから RLS が必須になる）。これを再現しないと:
--   1) RLS ポリシーが「権限が無いから弾かれている」だけで、実効性が検証できない
--   2) マイグレーション中の `revoke ... from anon, authenticated` が
--      「元から権限が無い」ため素通りし、剥奪できているかを検証できない
-- ALTER DEFAULT PRIVILEGES にすることで、この後のマイグレーションで作られる
-- テーブルにも本番と同じように権限が付く。
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- auth スキーマ/テーブル/uid（Supabase では既に存在するので存在チェックで分岐）
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema='auth' and table_name='users') then
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

-- 実 Supabase では anon/authenticated が auth スキーマを使えるため、
-- RLS ポリシー内の auth.uid() が評価できる。これを再現しないとポリシーが
-- 「関数を呼べずに」失敗し、実効性を検証できない。
grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- ---- テスト用ヘルパ ----
create schema if not exists test;
-- RLS の実効性テスト（98_rls_test）は set role authenticated / anon に切り替えて
-- アサーションを行うため、それらのロールからもヘルパを呼べるようにする。
grant usage on schema test to anon, authenticated, service_role;
alter default privileges in schema test
  grant execute on functions to anon, authenticated, service_role;

-- ログインユーザーを切り替える（RPC の auth.uid() を差し替える）
create or replace function test.set_uid(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false); select null::void;
$$;

-- 真でなければ即座に失敗（テスト打ち切り）
create or replace function test.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERT FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;

create or replace function test.eq(a anyelement, b anyelement, label text) returns void language plpgsql as $$
begin
  if a is distinct from b then
    raise exception 'ASSERT FAILED: % (got=% want=%)', label, a, b;
  end if;
  raise notice 'ok - %', label;
end $$;

-- 例外を投げるべき式が実際に投げるか（RPC のガード検証用）
create or replace function test.raises(p_sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - % (raised: %)', label, sqlerrm;
    return;
  end;
  raise exception 'ASSERT FAILED: % — expected an error but none was raised', label;
end $$;

-- テストユーザーを作る（handle 衝突を避けるためユニークな uuid を要求）
create or replace function test.new_user(p_id uuid, p_email text default null) returns uuid language plpgsql as $$
begin
  insert into auth.users(id, email) values (p_id, coalesce(p_email, p_id::text || '@test'));
  return p_id;
end $$;

-- auth.uid() を各ロールから実行できるようにする（Supabase 相当）
grant execute on function auth.uid() to anon, authenticated, service_role;
