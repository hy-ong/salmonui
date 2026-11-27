'use client';

import { useState } from 'react';
import { createLookup, type CachedLookup } from '@salmonui/data/lookup';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders } from '../../lib/fixtures';

// The "server" side of the lookup: a table the browser does not hold.
const SUPPLIERS: Readonly<Record<number, string>> = {
  101: 'Andes Roasters',
  102: 'Blue Ridge Tea Co.',
  103: 'Copperline Equipment',
  104: 'Darjeeling Direct',
  105: 'Ember & Steel',
  106: 'Fjord Beans',
};
const supplierIds = Object.keys(SUPPLIERS).map(Number);

interface OrderRow {
  readonly id: string;
  readonly supplierId: number;
  readonly product: string;
  readonly amount: number;
}

const rows: OrderRow[] = createOrders(500, 13).map((order, index) => ({
  id: order.id,
  supplierId: supplierIds[(index * 5) % supplierIds.length] as number,
  product: order.product,
  amount: order.amount,
}));

const wait = (ms: number, signal: { readonly aborted: boolean }) =>
  new Promise<void>((resolve, reject) => {
    setTimeout(() => (signal.aborted ? reject(new Error('aborted')) : resolve()), ms);
  });

export default function LookupRemoteDemo() {
  const [log, push] = useEventLog();
  // One cached lookup per demo instance; the grid asks it for the keys it shows.
  const [suppliers] = useState<CachedLookup>(() =>
    createLookup({
      async load({ keys, signal }) {
        push(`load: ${keys.length} key(s) requested (${keys.join(', ')})`);
        await wait(900, signal);
        return keys.map((key) => ({ id: key, name: SUPPLIERS[Number(key)] ?? `Unknown supplier ${String(key)}` }));
      },
    }),
  );
  const [columns] = useState<DataGridColumn<OrderRow>[]>(() => [
    { field: 'id', header: 'Order', primaryKey: true, width: 110 },
    // A remote lookup: `data` is a LookupSource. The header shows a loading indicator until the names arrive.
    { field: 'supplierId', header: 'Supplier', width: 200, lookup: { data: suppliers, keyField: 'id', displayField: 'name' } },
    { field: 'product', header: 'Product', width: 150 },
    { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  ]);
  return (
    <>
      <DataGrid<OrderRow>
        aria-label="Orders with a remote lookup column"
        data={rows}
        columns={columns}
        sorting
        filtering
        height={320}
        locale="en-US"
        currency="USD"
      />
      <EventLog entries={log} label="Lookup requests" />
    </>
  );
}
