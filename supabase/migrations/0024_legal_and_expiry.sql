-- ============================================================
-- 0024: 法務・ストア審査対応（規約同意 / 年齢確認 / ポイント有効期限）
--
-- ポイ活はストア審査（特に iOS）と国内法規の両方が厳しい領域で、リリース前に
-- 必ず要る一式が揃っていなかった（マイページの「利用規約・プライバシー」は
-- Alert のプレースホルダのままだった）。
--
--   1) legal_documents    … 規約/PP/特商法を**DBで版管理**。改定時にアプリ再配布が要らず、
--                           「いつの版に同意したか」を記録できる（改定時の再同意に必要）
--   2) legal_acceptances  … 同意の記録（誰が・どの文書の・どの版に・いつ）
--   3) profiles.date_of_birth … 年齢確認。最低年齢未満は登録不可、未成年フラグを持つ
--   4) ポイント有効期限   … 最終利用から一定期間で失効。失効前に通知する
--
-- ⚠ 本マイグレーションが用意するのは**仕組みと雛形**であり、条文そのものは
--   〔 〕のプレースホルダを含む下書きです。**公開前に必ず弁護士の確認を受け、
--   運営者名・住所・連絡先を実際の値に置き換えてください。**
--   ポイントが資金決済法の前払式支払手段に該当するか、景品表示法上の表示が
--   適切か等は個別判断が必要です。
-- ============================================================

-- ---------- 設定 ----------
insert into public.app_config (key, value) values
  ('min_age',                  '13'::jsonb),  -- 登録可能な最低年齢
  ('adult_age',                '18'::jsonb),  -- 成人年齢（未成年は保護者同意の導線が要る）
  ('point_expiry_months',      '12'::jsonb),  -- 最終利用からこの月数で失効
  ('point_expiry_notice_days', '30'::jsonb)   -- 失効の何日前に通知するか
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.legal_config(p_key text, p_default bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::bigint from app_config where key = p_key), p_default);
$$;
revoke all on function public.legal_config(text, bigint) from public, anon, authenticated;

-- ---------- 1) 法務文書（版管理） ----------
create table if not exists public.legal_documents (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null check (slug in ('terms','privacy','tokushoho')),
  version      text not null,                    -- 例 '2026-07-01'
  title        text not null,
  body         text not null,
  requires_consent boolean not null default true, -- 特商法表記は同意対象ではなく掲示のみ
  published_at timestamptz not null default now(),
  unique (slug, version)
);
create index if not exists idx_legal_docs_slug on public.legal_documents(slug, published_at desc);

alter table public.legal_documents enable row level security;
-- 規約類は未ログインでも読めなければならない（登録前に確認する）。
-- RLS ポリシーだけでは足りず、テーブルへの SELECT 権限も要る。
drop policy if exists legal_public_read on public.legal_documents;
create policy legal_public_read on public.legal_documents for select using (true);
grant select on public.legal_documents to anon, authenticated;

-- 各 slug の最新版
create or replace view public.current_legal_documents
with (security_invoker = on) as
select distinct on (slug) slug, id, version, title, body, requires_consent, published_at
from public.legal_documents
order by slug, published_at desc;
grant select on public.current_legal_documents to anon, authenticated;

-- ---------- 2) 同意の記録 ----------
create table if not exists public.legal_acceptances (
  user_id     uuid not null references auth.users(id) on delete cascade,
  slug        text not null,
  version     text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, slug, version)   -- 同じ版への再同意は1行
);

alter table public.legal_acceptances enable row level security;
drop policy if exists la_self_read on public.legal_acceptances;
create policy la_self_read on public.legal_acceptances for select using (auth.uid() = user_id);

-- 同意を記録する。存在しない版には同意できない（改ざん防止）。
create or replace function public.accept_legal(p_slug text, p_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from legal_documents where slug = p_slug and version = p_version) then
    raise exception 'unknown legal document: % %', p_slug, p_version;
  end if;

  insert into legal_acceptances(user_id, slug, version)
    values (v_uid, p_slug, p_version)
  on conflict (user_id, slug, version) do nothing;

  return jsonb_build_object('ok', true, 'slug', p_slug, 'version', p_version);
end $$;
revoke all on function public.accept_legal(text, text) from public, anon;
grant execute on function public.accept_legal(text, text) to authenticated;

-- 未同意（未同意 or 改定により旧版のまま）の文書を返す。アプリ起動時に確認して同意画面を出す。
create or replace function public.pending_legal_consents()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_rows jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'version', c.version, 'title', c.title)), '[]'::jsonb)
    into v_rows
    from current_legal_documents c
   where c.requires_consent
     and not exists (
       select 1 from legal_acceptances a
        where a.user_id = v_uid and a.slug = c.slug and a.version = c.version
     );

  return v_rows;
end $$;
revoke all on function public.pending_legal_consents() from public, anon;
grant execute on function public.pending_legal_consents() to authenticated;

-- ---------- 3) 年齢確認 ----------
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists age_verified_at timestamptz;

-- 生年月日は本人が1度だけ設定できる（後から書き換えて年齢制限を回避させない）。
create or replace function public.set_date_of_birth(p_dob date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_existing date; v_age int; v_min int; v_adult int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_dob is null then raise exception 'date_of_birth required'; end if;
  if p_dob > current_date then raise exception 'date_of_birth cannot be in the future'; end if;
  if p_dob < current_date - interval '120 years' then raise exception 'invalid date_of_birth'; end if;

  select date_of_birth into v_existing from profiles where id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('status','rejected','reason','already_set');
  end if;

  v_age   := extract(year from age(current_date, p_dob))::int;
  v_min   := legal_config('min_age', 13)::int;
  v_adult := legal_config('adult_age', 18)::int;

  if v_age < v_min then
    -- 記録は残さない（最低年齢未満のデータを保持しない）
    return jsonb_build_object('status','rejected','reason','under_minimum_age','min_age', v_min);
  end if;

  update profiles set date_of_birth = p_dob, age_verified_at = now() where id = v_uid;

  return jsonb_build_object('status','ok','age', v_age, 'is_minor', v_age < v_adult);
end $$;
revoke all on function public.set_date_of_birth(date) from public, anon;
grant execute on function public.set_date_of_birth(date) to authenticated;

-- ---------- 4) ポイント有効期限 ----------
-- 最終ポイント利用（point_wallets.updated_at＝apply_points が更新）から一定期間で失効。
-- 台帳は追記専用なので、失効も「負の確定エントリ」として記録する（残高との整合を保つ）。

-- 失効予定日を持つビュー（アプリの残高表示・運営の確認に使う）
create or replace view public.wallet_expiry
with (security_invoker = on) as
select
  w.user_id,
  w.balance,
  w.updated_at as last_activity_at,
  (w.updated_at + make_interval(months => public.legal_config('point_expiry_months', 12)::int))::date as expires_on
from public.point_wallets w;
grant select on public.wallet_expiry to authenticated;  -- RLS は基表 point_wallets に従う（security_invoker）

-- 失効予告の通知。運営バッチ（pg_cron 等）から service_role で日次実行する。
create or replace function public.notify_expiring_points()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_notice int; v_months int; v_count int := 0; r record;
begin
  v_notice := legal_config('point_expiry_notice_days', 30)::int;
  v_months := legal_config('point_expiry_months', 12)::int;

  for r in
    select w.user_id, w.balance,
           (w.updated_at + make_interval(months => v_months))::date as expires_on
      from point_wallets w
     where w.balance > 0
       and w.updated_at + make_interval(months => v_months)
             <= now() + make_interval(days => v_notice)
       and w.updated_at + make_interval(months => v_months) > now()   -- まだ失効前
  loop
    -- 同じ失効日に対する重複通知を避ける
    if not exists (
      select 1 from notifications n
       where n.user_id = r.user_id and n.type = 'point_expiry_notice'
         and n.payload->>'expires_on' = r.expires_on::text
    ) then
      insert into notifications(user_id, type, payload)
        values (r.user_id, 'point_expiry_notice',
                jsonb_build_object('balance', r.balance, 'expires_on', r.expires_on));
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('notified', v_count);
end $$;
revoke all on function public.notify_expiring_points() from public, anon, authenticated;

-- 失効の実行。p_dry_run=true なら対象を数えるだけで失効させない（本番投入前の確認用）。
create or replace function public.expire_points(p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_months int; v_count int := 0; v_points bigint := 0; r record;
begin
  v_months := legal_config('point_expiry_months', 12)::int;

  for r in
    select w.user_id, w.balance
      from point_wallets w
     where w.balance > 0
       and w.updated_at + make_interval(months => v_months) <= now()
     for update
  loop
    v_count  := v_count + 1;
    v_points := v_points + r.balance;

    if not p_dry_run then
      -- 台帳は追記専用。失効も負の確定エントリとして残す（監査可能にする）。
      -- 冪等キーに失効月を含め、同月内の重複実行で二重計上しない。
      perform apply_points(r.user_id, -r.balance, 'expiry', 'wallet', null,
                           'expiry:' || r.user_id::text || ':' || to_char(now(), 'YYYY-MM'));
      insert into notifications(user_id, type, payload)
        values (r.user_id, 'point_expired', jsonb_build_object('points', r.balance));
    end if;
  end loop;

  return jsonb_build_object('dry_run', p_dry_run, 'wallets', v_count, 'points', v_points);
end $$;
revoke all on function public.expire_points(boolean) from public, anon, authenticated;

-- ---------- 法務文書の雛形 ----------
-- ⚠ 下書き。〔 〕は公開前に必ず実際の値へ置き換え、弁護士の確認を受けること。
insert into public.legal_documents (slug, version, title, body, requires_consent) values
('terms', '2026-07-01', '利用規約', E'本規約は、〔運営者名〕（以下「当社」）が提供するアプリ「MasterGame」（以下「本サービス」）の利用条件を定めるものです。\n\n' ||
E'## 第1条（適用）\n本規約は、本サービスの利用に関する当社と利用者との間の一切の関係に適用されます。\n\n' ||
E'## 第2条（利用登録）\n本サービスの利用には利用登録が必要です。〔最低年齢〕歳未満の方はご登録いただけません。未成年の方は保護者の同意を得たうえでご利用ください。\n\n' ||
E'## 第3条（ポイント）\n1. 利用者はミッションの達成等により当社が定めるポイントを取得できます。\n2. ポイントは当社が定める商品等との交換にのみ利用でき、換金・第三者への譲渡・相続はできません。\n3. ポイントの最終利用日から〔有効期間〕を経過した場合、ポイントは失効します。失効前に当社所定の方法で通知します。\n4. 当社は、必要と判断した場合、ポイントの付与条件・交換内容・有効期間を変更することがあります。\n\n' ||
E'## 第4条（禁止事項）\n利用者は、次の行為を行ってはなりません。\n- 同一人物による複数アカウントの作成・利用\n- 自動化ツール、エミュレータ等による不正なポイント取得\n- 虚偽の情報の登録\n- 法令または公序良俗に違反する行為\n\n' ||
E'## 第5条（不正利用への対応）\n当社は、不正が疑われる場合、事前の通知なくアカウントの一時停止・停止、ポイントの取消しを行うことがあります。\n\n' ||
E'## 第6条（免責）\n当社は、本サービスに事実上または法律上の瑕疵がないことを保証しません。ただし、消費者契約法その他の強行法規により当社の責任が免除されない場合はこの限りではありません。\n\n' ||
E'## 第7条（規約の変更）\n当社は、必要と判断した場合、本規約を変更することがあります。重要な変更の場合は、本サービス上で通知し、改めて同意をお願いすることがあります。\n\n' ||
E'## 第8条（準拠法・管轄）\n本規約は日本法に準拠し、本サービスに関する紛争は〔管轄裁判所〕を第一審の専属的合意管轄裁判所とします。\n\n' ||
E'制定日: 2026年7月1日\n〔運営者名〕', true),

('privacy', '2026-07-01', 'プライバシーポリシー', E'〔運営者名〕（以下「当社」）は、本サービスにおける利用者の個人情報の取扱いについて、以下のとおり定めます。\n\n' ||
E'## 1. 取得する情報\n- メールアドレス、パスワード（ハッシュ化して保管）\n- プロフィール情報（ニックネーム、興味のあるジャンル等）\n- 生年月日（年齢確認のため。生年月日そのものは年齢判定にのみ使用します）\n- 端末情報（OS、端末モデル、端末識別子）\n- 利用状況（ミッション達成履歴、ポイント履歴、アクセス日時）\n- プッシュ通知トークン（通知の配信に使用）\n\n' ||
E'## 2. 利用目的\n- 本サービスの提供・本人確認・ポイントの管理\n- **不正行為の検知および防止**（複数アカウントの検知、異常な取得速度の検知等）\n- 提携先へのポイント付与の確認（成果の照合）\n- お問い合わせ対応、重要なお知らせの通知\n- 統計データの作成（個人を識別できない形式に加工します）\n\n' ||
E'## 3. 第三者提供\n当社は、次の場合を除き、利用者の同意なく個人情報を第三者に提供しません。\n- 法令に基づく場合\n- 人の生命・身体・財産の保護に必要で、本人の同意を得ることが困難な場合\n\n' ||
E'## 4. 業務委託\n利用目的の達成に必要な範囲で、個人情報の取扱いを外部に委託することがあります。委託先に対しては必要かつ適切な監督を行います。\n\n' ||
E'## 5. 広告・提携サービス\n本サービスには提携する広告ネットワークのオファーが含まれます。提携先での行動については各提携先のプライバシーポリシーが適用されます。\n\n' ||
E'## 6. 保有期間\n利用目的の達成に必要な期間、および法令で定められた期間保有します。退会後は、不正防止および法令遵守に必要な範囲を除き、速やかに削除します。\n\n' ||
E'## 7. 開示・訂正・削除の請求\n利用者は、当社が保有する自己の個人情報について、開示・訂正・利用停止・削除を請求できます。下記窓口までご連絡ください。\n\n' ||
E'## 8. お問い合わせ窓口\n〔運営者名〕　個人情報お問い合わせ窓口\nメール: 〔連絡先メールアドレス〕\n\n' ||
E'制定日: 2026年7月1日', true),

('tokushoho', '2026-07-01', '特定商取引法に基づく表記', E'## 販売事業者\n〔運営者名〕\n\n' ||
E'## 代表責任者\n〔代表者名〕\n\n' ||
E'## 所在地\n〔所在地〕\n\n' ||
E'## 連絡先\nメール: 〔連絡先メールアドレス〕\n電話: 〔電話番号〕（受付時間: 〔受付時間〕）\n\n' ||
E'## 販売価格\n本サービスの利用は無料です。ポイントの取得に費用は発生しません。\n\n' ||
E'## 役務の提供時期\nポイントの交換申請後、〔提供までの期間〕以内に交換内容をお渡しします。提携先の確認が必要な場合はこれを超えることがあります。\n\n' ||
E'## 返品・キャンセル\nポイント交換の性質上、交換申請後のキャンセル・返品はお受けできません。ただし、当社の責めに帰すべき事由により交換内容をお渡しできない場合は、ポイントを返還します。\n\n' ||
E'## 動作環境\niOS 〔対応バージョン〕以上 / Android 〔対応バージョン〕以上\n\n' ||
E'最終更新日: 2026年7月1日', false)
on conflict (slug, version) do nothing;
