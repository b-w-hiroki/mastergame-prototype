export type ExchangeItemDisplay = { id: string; name: string; delivery_method: string };

const METHOD_LABELS: Record<string, string> = {
  csv: 'CSV',
  code: 'コード',
  api: 'API',
};

export function exchangeItemLabel(itemId: string, items: ReadonlyMap<string, ExchangeItemDisplay>): string {
  const item = items.get(itemId);
  return item ? `${item.name}（${(METHOD_LABELS[item.delivery_method] ?? item.delivery_method)}） #${itemId}` : `#${itemId}（商品情報なし）`;
}
