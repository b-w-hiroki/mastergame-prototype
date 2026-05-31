import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

type Provider = 'google' | 'apple' | 'facebook';

// URL の query / hash 両方からパラメータを取り出す
function parseParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const collect = (qs: string) => {
    new URLSearchParams(qs).forEach((v, k) => (out[k] = v));
  };
  const [, afterQ = ''] = url.split('?');
  const [beforeHash, afterHash = ''] = afterQ.split('#');
  collect(beforeHash);
  collect(afterHash);
  if (url.includes('#') && !afterQ.includes('#')) collect(url.split('#')[1] ?? '');
  return out;
}

/**
 * OAuth ログイン（ディープリンク mastergame://auth-callback）。
 * PKCE の code を exchangeCodeForSession、implicit の token は setSession。
 */
export async function signInWithOAuth(provider: Provider): Promise<void> {
  const redirectTo = Linking.createURL('auth-callback'); // mastergame://auth-callback
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) throw error ?? new Error('OAuth URL を取得できませんでした');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) return; // ユーザーがキャンセル

  const params = parseParams(result.url);
  if (params.error) throw new Error(params.error_description || params.error);

  if (params.code) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exErr) throw exErr;
  } else if (params.access_token && params.refresh_token) {
    const { error: sErr } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (sErr) throw sErr;
  }
}
