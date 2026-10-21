import { describe, expect, it } from 'vitest';
import { exchangeItemLabel } from './exchange-display';

describe('exchange item review label', () => {
  it('distinguishes same-cost items by name, delivery method and stable ID', () => {
    const items = new Map([
      ['item-a', { id: 'item-a', name: 'A賞', delivery_method: 'code' }],
      ['item-b', { id: 'item-b', name: 'B賞', delivery_method: 'api' }],
    ]);
    expect(exchangeItemLabel('item-a', items)).toBe('A賞（コード） #item-a');
    expect(exchangeItemLabel('item-b', items)).toBe('B賞（API） #item-b');
    expect(exchangeItemLabel('item-a', items)).not.toBe(exchangeItemLabel('item-b', items));
  });

  it('shows the item ID when metadata is absent', () => {
    expect(exchangeItemLabel('item-c', new Map())).toContain('#item-c');
  });
});
