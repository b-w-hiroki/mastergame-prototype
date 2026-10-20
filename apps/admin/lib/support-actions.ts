/** DB側の4,000文字切り捨てを送信前に検知する。 */
export function replyBody(value: FormDataEntryValue | null): string {
  if (typeof value !== 'string') throw new Error('invalid body');
  const body = value.trim();
  if (!body) throw new Error('body required');
  if (body.length > 4000) throw new Error('body too long');
  return body;
}

export function assertSupportResult(value: unknown, operation: string): void {
  if (!value || typeof value !== 'object' || (value as { status?: unknown }).status !== 'ok') {
    throw new Error(`${operation} failed: unexpected response`);
  }
}
