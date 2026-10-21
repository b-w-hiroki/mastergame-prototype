import { attributedOfferUrl } from '../src/lib/offerUrl';

const clickId = '0123456789abcdef0123456789abcdef';
const offer = {
  id: 'offer-123',
  mission_id: 'mission-123',
  offer_url: 'https://partner.example.net/start?click_id=stale',
  target_url: null,
};

test('mission launch registers click and carries attribution to external URL', async () => {
  const trackClick = jest.fn(async (missionId: string) => {
    expect(missionId).toBe('mission-123');
    return clickId;
  });
  const destination = await attributedOfferUrl(offer, trackClick);
  expect(trackClick).toHaveBeenCalledTimes(1);
  const url = new URL(destination!);
  expect(url.searchParams.get('click_id')).toBe(clickId);
  expect(url.searchParams.get('offer_id')).toBe(offer.id);
});

test('legacy target_url launches with attribution when offer_url is absent', async () => {
  const destination = await attributedOfferUrl(
    { ...offer, offer_url: null, target_url: 'https://partner.example.net/legacy' },
    async () => clickId,
  );
  expect(destination).toContain('click_id=' + clickId);
});

test('unsafe destination and missing mission fail before registering click', async () => {
  const trackClick = jest.fn(async () => clickId);
  expect(await attributedOfferUrl({ ...offer, offer_url: 'http://localhost/', target_url: null }, trackClick)).toBeNull();
  expect(await attributedOfferUrl({ ...offer, mission_id: null }, trackClick)).toBeNull();
  expect(trackClick).not.toHaveBeenCalled();
});

test('invalid click id never reaches an external URL', async () => {
  await expect(attributedOfferUrl(offer, async () => 'invalid')).rejects.toThrow('click_id');
});
