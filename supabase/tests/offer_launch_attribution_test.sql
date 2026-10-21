-- Disposable PostgreSQL coverage for the click-to-postback attribution boundary.
-- HMAC verification lives in the Edge Function and is tested separately.
begin;

select test.new_user('b7ef0db8-3c1b-4d33-8eed-443344334433', 'attribution@example.test');
select test.set_uid('b7ef0db8-3c1b-4d33-8eed-443344334433');

do $$
declare
  v_mission uuid;
  v_click text;
  v_result jsonb;
begin
  select id into v_mission from public.missions
    where title = '『パズルキングダム』をインストール';
  perform test.ok(v_mission is not null, 'seed has attributed offer mission');

  v_click := public.track_click(v_mission);
  perform test.ok(v_click ~ '^[0-9a-f]{32}$', 'launch gets a postback click id');
  perform test.ok(exists (
    select 1 from public.mission_clicks
    where click_id = v_click
      and user_id = 'b7ef0db8-3c1b-4d33-8eed-443344334433'
      and mission_id = v_mission
  ), 'click belongs to the launching user and mission');

  v_result := public.confirm_postback('test-partner', 'attribution-test-txn', v_click);
  perform test.eq(v_result->>'status', 'accepted', 'verified postback stage accepts attributed click');
  perform test.ok(exists (
    select 1 from public.mission_clicks where click_id = v_click and is_converted
  ), 'accepted postback converts the attributed click');

  v_result := public.confirm_postback('test-partner', 'attribution-test-txn', v_click);
  perform test.eq(v_result->>'status', 'duplicate', 'replayed postback cannot credit twice');
end $$;

rollback;
