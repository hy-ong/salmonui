'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(10_000, 7);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110, pinned: 'start' },
  { field: 'customer', header: 'Customer', width: 160 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
];

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });

export default function DetailRowsDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => api.current?.expandAllDetails()}>
          Expand all
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.collapseAllDetails()}>
          Collapse all
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.toggleDetail(orders[2]?.id ?? '')}>
          Toggle the third order
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with details"
        data={orders}
        columns={columns}
        height={460}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        detailHeight={96}
        hasDetail={(row) => row.priority !== 'Low'}
        loadDetail={async ({ row, signal }) => {
          await wait(300, signal);
          const line = `${row.quantity} × ${row.product} at $${row.unitPrice.toFixed(2)}`;
          return row.note ? `${line} — ${row.note}` : line;
        }}
        renderDetail={({ row, status, data, retry, collapse }) => (
          <div className="demo-detail">
            <strong>{row.customer}</strong>, {row.city} ({row.priority} priority)
            <p>{status === 'ready' ? String(data) : status === 'error' ? <Button variant="outline" type="button" onClick={retry}>Retry</Button> : 'Loading…'}</p>
            <Button variant="outline" type="button" onClick={collapse}>
              Close
            </Button>
          </div>
        )}
        onBeforeDetailToggle={(event) => push(`before ${event.expanded ? 'expand' : 'collapse'} ${event.rowId} (${event.source})`)}
        onDetailToggle={(event) => push(`${event.expanded ? 'expanded' : 'collapsed'} ${event.rowId}`)}
      />
      <p className="demo-status">
        Low-priority orders have no detail. Keyboard: Enter or Space on the toggle cell, Enter on a detail row moves into it, Escape returns,
        Ctrl+Down / Ctrl+Up expand or collapse all.
      </p>
      <EventLog entries={log} />
    </>
  );
}
