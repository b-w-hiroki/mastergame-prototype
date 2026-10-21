export type ExchangeItemDisplay = { id: string; name: string; delivery_method: 'csv' | 'code' | 'api' };

const METHOD_LABELS: Record<ExchangeItemDisplay['delivery_method'], string> = {
  csv: 'CSV',
  code: 'コード',
  api: 'API',
};

export function exchangeItemLabel(itemId: string, items: ReadonlyMap<string, ExchangeItemDisplay>): string {
  const item = items.get(itemId);
  return item ? `${item.name}（${METHOD_LABELS[item.delivery_method]}） #${itemId}` : `#${itemId}（商品情報なし）`;
}
