import { safeOfferUrl } from '@/lib/offerUrl';

describe('safeOfferUrl', () => {
  it('通常のHTTPS提携リンクを許可する', () => {
    expect(safeOfferUrl('https://offers.partner.test/campaign?id=1')).toBe('https://offers.partner.test/campaign?id=1');
  });

  it.each([
    'http://offers.partner.test/campaign',
    'javascript:alert(1)',
    'intent://offer',
    'file:///etc/passwd',
    'https://user:pass@offers.partner.test/',
    'https://example.com/offer',
    'https://localhost/offer',
    'https://127.0.0.1/offer',
    'https://[::1]/offer',
    'https:\\offers.partner.test\\offer',
    ' https://offers.partner.test/',
  ])('危険または未設定の導線を拒否する: %s', (url) => {
    expect(safeOfferUrl(url)).toBeNull();
  });
});
