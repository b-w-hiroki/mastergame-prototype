-- ============================================================
-- MasterGame — 0013 offer launch wiring
-- Offer cards need a verified mission for attribution and an optional
-- destination URL for the external offer page.
-- ============================================================

alter table public.offers
  add column mission_id uuid references public.missions(id) on delete set null,
  add column target_url text;

create index idx_offers_mission on public.offers(mission_id);

comment on column public.offers.mission_id is
  'Verified mission used by track_click and postback attribution.';
comment on column public.offers.target_url is
  'External offer URL. The mobile client appends click_id and offer_id.';
