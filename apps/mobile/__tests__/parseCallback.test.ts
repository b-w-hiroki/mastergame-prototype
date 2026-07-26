import { parseParams } from '@/lib/parseCallback';

describe('parseParams', () => {
  it('parses query params', () => {
    expect(parseParams('mastergame://auth-callback?code=abc&state=xyz')).toEqual({ code: 'abc', state: 'xyz' });
  });
  it('parses hash-only params (implicit flow)', () => {
    expect(parseParams('mastergame://auth-callback#access_token=t1&refresh_token=t2')).toEqual({
      access_token: 't1',
      refresh_token: 't2',
    });
  });
  it('parses combined query + hash', () => {
    expect(parseParams('https://x/cb?code=c#access_token=t')).toMatchObject({ code: 'c', access_token: 't' });
  });
  it('captures the error param', () => {
    expect(parseParams('mastergame://cb?error=access_denied&error_description=nope')).toMatchObject({
      error: 'access_denied',
    });
  });
  it('returns empty object for a url with no params', () => {
    expect(parseParams('mastergame://auth-callback')).toEqual({});
  });
});
