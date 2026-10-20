/** 管理画面の交換確定前に、配布方法とコード入力を照合する。 */
export function fulfillmentCode(raw: FormDataEntryValue | null, deliveryMethod: unknown): string | null {
  if (typeof raw !== 'string') throw new Error('invalid code');
  if (deliveryMethod !== 'code' && deliveryMethod !== 'csv' && deliveryMethod !== 'api') {
    throw new Error('invalid delivery method');
  }
  const code = raw.trim();
  if (code.length > 64) throw new Error('code too long');
  if (deliveryMethod === 'code' && !code) throw new Error('code required');
  return code || null;
}

/** 不明な応答は完了と見なさない。 */
export function assertExchangeResult(data: unknown, operation: string): void {
  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    const reason = data && typeof data === 'object' && typeof (data as { reason?: unknown }).reason === 'string'
      ? (data as { reason: string }).reason : 'unknown';
    throw new Error(`${operation} failed: ${reason}`);
  }
}
