-- ============================================================
-- 0032: 公開前のオファー安全化
--
-- URL 未設定または example.com のダミーURLを持つオファーが active だと、
-- 利用者に達成不能な導線を表示してしまう。実ネットワークのURLが設定されるまで
-- paused にし、管理画面で実値を確認してから明示的に再開する。
-- ============================================================

update public.offers
set status = 'paused'
where status = 'active'
  and (
    offer_url is null
    or offer_url ~* '^https?://(www\.)?example\.com(?:/|$)'
  );

comment on column public.offers.status is
  'active は実際に遷移可能な offer_url を設定・確認したオファーだけに使用する。';
