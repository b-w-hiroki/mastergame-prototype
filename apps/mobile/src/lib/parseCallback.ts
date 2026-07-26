// OAuth コールバック URL からパラメータを取り出す純粋関数（単体テスト対象）。
// query（?a=b）と hash（#a=b）の両方を拾う。PKCE の code / implicit の token を扱う。
export function parseParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const collect = (qs: string) => {
    if (!qs) return;
    new URLSearchParams(qs).forEach((v, k) => (out[k] = v));
  };
  const [, afterQ = ''] = url.split('?');
  const [beforeHash, afterHash = ''] = afterQ.split('#');
  collect(beforeHash);
  collect(afterHash);
  // クエリを持たず hash だけの URL（例: mastergame://cb#access_token=...）にも対応
  if (url.includes('#') && !afterQ.includes('#')) collect(url.split('#')[1] ?? '');
  return out;
}
