/** 同時操作などで解決済みだった場合を新規の成功と扱わない。 */
export function assertFraudResult(value: unknown, action: string): void {
  if (!value || typeof value !== 'object') throw new Error('fraud action failed: unexpected response');
  const result = value as { status?: unknown; action?: unknown };
  if (result.status !== 'resolved' || result.action !== action) {
    throw new Error('fraud action failed: already resolved or unexpected response');
  }
}
