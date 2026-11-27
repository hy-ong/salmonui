'use client';

import { useEffect, useRef, useState } from 'react';
import { createJsonDataSource } from '@salmonui/data';
import type { DataSourceEvent, DataSourceRequest, DataSourceResult, WriteRequest, WriteResult } from '@salmonui/core/data';
import type { DataSource } from '@salmonui/data-grid/engine';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridEditing, type DataGridInfiniteScroll } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders } from '../../lib/fixtures';
import { demoFetch, type RemoteOrder } from '../../lib/remote';

const columns: DataGridColumn<RemoteOrder>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

const TOTAL = 50_000;

// The first three blocks (rows [0, 300)), seeded so they render on the server
// and are not requested again. `createOrders` draws from one seeded sequence
// row by row, so its first 300 rows equal the first 300 of the endpoint's
// 50,000 (lib/orders-server.ts uses the same seed).
const infiniteScroll: DataGridInfiniteScroll<RemoteOrder> = {
  cache: true,
  maxBlocks: 6,
  initialResult: {
    rows: createOrders(300, 77).map(({ placed: _placed, ...row }) => row),
    totalRowCount: TOTAL,
  },
};

// Adding only: added rows open at the bottom edge and save through `write()`.
const editing: DataGridEditing<RemoteOrder> = { newRowPosition: 'bottom', edit: false, delete: false };

const INITIAL_STATUS = `300 of ${TOTAL.toLocaleString('en-US')} rows in memory · 0 requests · 0 aborted · 0 evicted`;

/**
 * The orders endpoint is read-only and shared by every visitor, so this
 * source keeps the rows added in this page in the browser and serves them
 * after the server's 50,000 rows, as a server that appends new rows would
 * (in every sort order: they are the newest orders). Reads below row 50,000
 * go to the endpoint.
 */
function withAppendedRows(server: DataSource<RemoteOrder>): DataSource<RemoteOrder> {
  const appended: RemoteOrder[] = [];
  const listeners = new Set<(event: DataSourceEvent<RemoteOrder>) => void>();
  return {
    mode: 'remote',
    capabilities: { ...server.capabilities, write: true },
    async read(request: DataSourceRequest): Promise<DataSourceResult<RemoteOrder>> {
      const range = request.range;
      const total = TOTAL + appended.length;
      if (!range || range.end <= TOTAL) {
        const result = (await server.read(request)) as DataSourceResult<RemoteOrder>;
        return appended.length ? { ...result, totalRowCount: total, pageInfo: { hasNextPage: true } } : result;
      }
      const local = appended.slice(Math.max(0, range.start - TOTAL), range.end - TOTAL);
      if (range.start >= TOTAL) return { version: request.version, rows: local, totalRowCount: total, performed: ['search', 'filter', 'sort', 'page'], pageInfo: { hasNextPage: false } };
      const result = (await server.read({ ...request, range: { start: range.start, end: TOTAL } })) as DataSourceResult<RemoteOrder>;
      return { ...result, rows: [...result.rows, ...local], totalRowCount: total, pageInfo: { hasNextPage: range.end < total } };
    },
    async write(request: WriteRequest<RemoteOrder>): Promise<WriteResult<RemoteOrder>> {
      const added = request.added.map((a) => ({ tempId: a.tempId, row: a.row }));
      for (const a of added) appended.push(a.row);
      // A structural write echo: the grid re-reads the blocks around the viewport.
      const event: DataSourceEvent<RemoteOrder> = { type: 'patch', rows: added.map((a) => a.row), updated: [], added: added.map((a) => a.row.id), removed: [] };
      for (const listener of listeners) listener(event);
      return { version: request.version, status: 'applied', added, changed: [], deleted: [] };
    },
    subscribe(listener) {
      listeners.add(listener);
      const off = server.subscribe?.(listener);
      return () => {
        listeners.delete(listener);
        off?.();
      };
    },
  };
}

function describe(api: DataGridApi<RemoteOrder>): string {
  // Typed façade: present because the grid has `infiniteScroll`.
  const facade = api.engine.infiniteScroll;
  const stats = facade?.getStats();
  if (!facade || !stats) return INITIAL_STATUS;
  const status = facade.getStatus();
  const total = status.totalRowCount ?? TOTAL;
  return `${status.loadedRowCount.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} rows in memory · ${stats.requests} requests · ${stats.aborted} aborted · ${stats.evicted} evicted`;
}

export default function InfiniteScrollDemo() {
  const api = useRef<DataGridApi<RemoteOrder> | null>(null);
  const [log, push] = useEventLog();
  const [status, setStatus] = useState(INITIAL_STATUS);
  // Created once per mounted grid (data sources are initial-only). Default
  // offset paging: the grid's infinite scroll module manages the blocks.
  const [source] = useState(() =>
    withAppendedRows(createJsonDataSource<RemoteOrder>({
      url: '/api/orders?delay=150',
      fetch: demoFetch,
      key: 'id',
      onResponse: (event) => {
        const query = 'query' in event.request ? event.request.query : undefined;
        const page = query?.page && 'offset' in query.page ? `rows [${query.page.offset}, ${query.page.offset + query.page.limit})` : 'rows';
        const sort = query?.sort?.length ? ` sorted by ${query.sort.map((s) => `${s.field} ${s.dir}`).join(', ')}` : '';
        push(`${event.kind} ${page}${sort}: ${Math.round(event.durationMs)} ms`);
      },
    })),
  );
  const added = useRef(0);

  // scroll to the last row, then open a new row at the bottom edge
  // (Enter or Save writes it; it lands after the last row).
  const addOrder = () => {
    const grid = api.current;
    if (!grid) return;
    const count = grid.engine.infiniteScroll?.getStatus().totalRowCount ?? TOTAL;
    const last = grid.engine.getRowIdAt(count - 1);
    if (last !== undefined) grid.scrollToRow(last, { align: 'end' });
    added.current += 1;
    grid.addRow({ id: `NEW-${added.current}`, customer: 'New customer', country: 'Germany', product: 'Chai', quantity: 1, amount: 18 });
  };

  // Re-read on every engine change and after every logged response (the
  // request counters change without a snapshot change).
  useEffect(() => {
    const grid = api.current;
    if (!grid) return;
    const update = () => setStatus(describe(grid));
    update();
    return grid.engine.subscribe(update);
  }, [log]);

  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => api.current?.engine.infiniteScroll?.loadNext()}>
          Load next block
        </Button>
        <Button variant="outline" type="button" onClick={addOrder}>
          Add order at the bottom
        </Button>
      </div>
      <DataGrid<RemoteOrder>
        aria-label="50,000 remote orders with infinite scrolling"
        data={source}
        columns={columns}
        sorting
        height={380}
        locale="en-US"
        currency="USD"
        ref={api}
        editing={editing}
        infiniteScroll={infiniteScroll}
      />
      <p className="demo-status" aria-live="polite" data-testid="infinite-status">
        {status}
      </p>
      <EventLog entries={log} label="Requests" />
    </>
  );
}
