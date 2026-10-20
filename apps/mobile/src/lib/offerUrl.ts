/** 提携オファーの外部遷移先は、暗号化された通常のWeb URLだけを許可する。 */
export function safeOfferUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0
    || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !host || url.username || url.password
      || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')
      || host === 'example.com' || host === 'www.example.com') return null;
    return url.toString();
  } catch {
    return null;
  }
}
