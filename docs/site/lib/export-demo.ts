// Shared by the export-print demo (client) and its server export endpoint
// (lib/demo-api.ts, behind app/api/export/route.api.ts): the same rows and core column definitions, so
// a client `getState()` snapshot restores onto the server grid.
// No React and no DOM here.

import type { ColumnDef } from '@salmonui/data-grid/engine';
import { createOrders, type Order } from './fixtures';

/** 10,000 deterministic orders (identical on the server and the client). */
export const exportOrders: Order[] = createOrders(10_000, 12);

/** Core column definitions; the demo adds React-only fields (templates, `printable`). */
export const exportOrderColumns: ColumnDef<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  {
    id: 'customerGroup',
    header: 'Customer',
    columns: [
      { field: 'customer', header: 'Name', width: 150 },
      { field: 'city', header: 'City', width: 110 },
      { field: 'country', header: 'Country', width: 110 },
    ],
  },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'discount', header: 'Discount', type: 'number', format: 'P0', align: 'end', width: 100 },
];

export interface RegionTarget {
  readonly id: string;
  readonly region: string;
  readonly country: string;
  readonly target: number;
}

/** Rows of the second grid; `region` repeats so `mergeRepeatedValues` has runs to merge. */
export const regionTargets: RegionTarget[] = [
  { id: 'fr', region: 'Europe', country: 'France', target: 180_000 },
  { id: 'de', region: 'Europe', country: 'Germany', target: 210_000 },
  { id: 'pt', region: 'Europe', country: 'Portugal', target: 95_000 },
  { id: 'jp', region: 'Asia', country: 'Japan', target: 240_000 },
  { id: 'my', region: 'Asia', country: 'Malaysia', target: 120_000 },
];
