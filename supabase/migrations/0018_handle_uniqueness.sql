-- ============================================================
-- MasterGame — 0018 handle 生成の衝突耐性
-- handle_new_user は handle を UUID 先頭8桁から作っていたため、先頭8桁が一致する
-- 2ユーザーが同時に存在できず（handle UNIQUE 違反で signup が中断）。
-- id（PK＝一意）由来の全桁を使い、既定 handle を確実に一意にする。
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, handle)
    values (new.id, coalesce(new.raw_user_meta_data->>'username','Player'),
            'player_' || translate(new.id::text, '-', ''));  -- id 由来で一意
  insert into public.point_wallets (user_id) values (new.id);
  return new;
end $$;
