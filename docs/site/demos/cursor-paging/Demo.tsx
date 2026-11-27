'use client';

import { useState } from 'react';
import { createJsonDataSource } from '@salmonui/data';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { demoFetch, type RemoteOrder } from '../../lib/remote';

const columns: DataGridColumn<RemoteOrder>[] = [
  { type: 'rowNumber' },
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

const paging = { pageSize: 25 };

export default function CursorPagingDemo() {
  const [log, push] = useEventLog();
  // Cursor paging: page n + 1 is requested with the cursor the server returned for page n.
  const [source] = useState(() =>
    createJsonDataSource<RemoteOrder>({
      url: '/api/orders?delay=120',
      fetch: demoFetch,
      key: 'id',
      paging: { kind: 'cursor' },
      onResponse: (event) => {
        if (!('query' in event.request) || !('rows' in event.response)) return;
        push(`page ${JSON.stringify(event.request.query.page)} → next ${JSON.stringify(event.response.next ?? null)}`);
      },
    }),
  );
  return (
    <>
      <DataGrid<RemoteOrder>
        aria-label="Remote orders paged with cursors"
        data={source}
        columns={columns}
        paging={paging}
        onError={(event) => push(`error (${event.action}): ${event.error.message}`)}
        height={360}
        locale="en-US"
        currency="USD"
      />
      <p className="demo-status">Use Next page: each request carries the cursor of the previous response.</p>
      <EventLog entries={log} label="Cursor requests" />
    </>
  );
}
