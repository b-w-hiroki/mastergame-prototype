-- ============================================================
-- MasterGame — 0014 未インデックスの外部キーにインデックスを追加
-- 参照 join / カスケード削除 / 集計の性能を改善する。
-- 既存の複合インデックスでカバー済みの列は対象外。
-- ============================================================
create index if not exists idx_games_partner        on public.games(partner_id);
create index if not exists idx_missions_partner      on public.missions(partner_id);
create index if not exists idx_exchange_items_game   on public.exchange_items(game_id);
create index if not exists idx_exchange_req_item     on public.exchange_requests(item_id);
create index if not exists idx_offers_network        on public.offers(network_id);
create index if not exists idx_offercomp_offer       on public.offer_completions(offer_id);
create index if not exists idx_offercomp_network     on public.offer_completions(network_id);
create index if not exists idx_completions_mission   on public.mission_completions(mission_id);
create index if not exists idx_postback_partner      on public.postback_events(partner_id);
create index if not exists idx_clicks_partner        on public.mission_clicks(partner_id);
create index if not exists idx_topics_author         on public.topics(author_id);
create index if not exists idx_posts_author          on public.posts(author_id);
