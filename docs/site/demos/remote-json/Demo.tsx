'use client';

import { useState } from 'react';
import { createJsonDataSource } from '@salmonui/data';
import { DataGrid, type DataGridColumn, type DataGridSorting } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { demoFetch, type RemoteOrder } from '../../lib/remote';

const columns: DataGridColumn<RemoteOrder>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

// Initial server-side sort; a constant (the options prop is reactive).
const sorting: DataGridSorting = { sortBy: [{ field: 'id', direction: 'desc' }] };

export default function RemoteJsonDemo() {
  const [log, push] = useEventLog();
  // Created once per mounted grid (data sources are initial-only).
  const [source] = useState(() =>
    createJsonDataSource<RemoteOrder>({
      url: '/api/orders?delay=150',
      fetch: demoFetch,
      key: 'id',
      paging: { kind: 'infinite', blockSize: 200, maxBlocks: 20 },
      // `onRequest` runs before each request (return false to cancel it);
      // `onResponse` runs before the response is decoded
      // and may return a replacement response.
      onRequest: (event) => push(`request ${event.kind}`),
      onResponse: (event) => {
        const rows = 'rows' in event.response ? event.response.rows.length : 0;
        push(`${event.kind}: ${rows} rows in ${Math.round(event.durationMs)} ms`);
      },
    }),
  );
  return (
    <>
      <DataGrid<RemoteOrder>
        aria-label="50,000 remote orders loaded in blocks"
        data={source}
        columns={columns}
        sorting={sorting}
        height={380}
        locale="en-US"
        currency="USD"
      />
      <p className="demo-status">Sorting runs on the server: click a header and watch the requests.</p>
      <EventLog entries={log} label="Requests" />
    </>
  );
}
