'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridColumn, type DataSource, type DataGridPaging } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const TOTAL = 1_000;
const orders = createOrders(TOTAL, 11);

const columns: DataGridColumn<Order>[] = [
  { type: 'rowNumber' },
  { field: 'id', header: 'Order', primaryKey: true, width: 120 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

// The page lives in `?page=` (written with history.replaceState after mount). The source pages on
// the "server" and reports no total, so `totalRowCount` gives the pager its page count.
const paging: DataGridPaging = { pageSize: 20, syncUrl: true, totalRowCount: TOTAL };

/** A server that pages and cannot count, with a switch that fails the next read. */
function createPagedServer(): { source: DataSource<Order>; failNext(): void } {
  let fail = false;
  const source: DataSource<Order> = {
    mode: 'remote',
    read(request) {
      const { page, pageSize } = request.query.paging ?? { page: 1, pageSize: 20 };
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (fail) {
            fail = false;
            reject(new Error('The orders service timed out'));
            return;
          }
          const start = (page - 1) * pageSize;
          resolve({ version: request.version, rows: orders.slice(start, start + pageSize), performed: ['page'] });
        }, 120);
      });
    },
  };
  return { source, failNext: () => void (fail = true) };
}

export default function UrlPagingDemo() {
  const [log, push] = useEventLog();
  // Created once per mounted grid (data sources are initial-only).
  const [server] = useState(createPagedServer);
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={server.failNext}>
          Fail the next request
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders paged on the server, page kept in the URL"
        data={server.source}
        columns={columns}
        paging={paging}
        onViewChange={(e) => push(`view: ${e.reason}, ${e.rowCount} of ${e.totalRowCount} rows (${e.source})`)}
        onError={(e) => push(`error (${e.action}): ${e.error.message}`)}
        renderError={({ message, retry }) => (
          <div className="demo-error" role="alert">
            <strong>Orders are unavailable.</strong> {message}.{' '}
            <Button variant="outline" onClick={retry}>
              Try again
            </Button>
          </div>
        )}
        height={360}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
      />
      <p className="demo-status">Change pages and watch the address bar; reload to come back to the same page.</p>
      <EventLog entries={log} label="View changes and errors" />
    </>
  );
}
