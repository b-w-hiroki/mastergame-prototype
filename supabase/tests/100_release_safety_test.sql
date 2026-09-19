begin;

select test.eq(
  (
    select count(*)::int
    from public.offers
    where status = 'active'
      and (
        offer_url is null
        or offer_url ~* '^https?://(www\.)?example\.com(?:/|$)'
      )
  ),
  0,
  'active offers never use missing or placeholder URLs'
);

-- seed の作例は実ネットワーク設定前なので公開しない。
select test.eq(
  (select count(*)::int from public.offers where external_id like 'of-%' and status = 'paused'),
  3,
  'seed offers stay paused until a real network URL is configured'
);

rollback;
