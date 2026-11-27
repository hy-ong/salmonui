'use client';

import { useState } from 'react';
import { createControlledDataSource } from '@salmonui/data';
import { serializeDataGridQuery } from '@salmonui/data-grid/engine';
import { type DataSourceRequest, type WriteRequest, type WriteResult } from '@salmonui/core/data';
import { DataGrid, type DataGridColumn, type DataGridEditing } from '@salmonui/data-grid';
import { EventLog, useDemoStore, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

const editing: DataGridEditing<Order> = { mode: 'cell', add: false, delete: false };

/** The application's own data operations: a sort over an in-memory table, and writes into it. */
function createOrderStore() {
  let table = createOrders(3_000, 51);
  const query = (request: DataSourceRequest): Order[] => {
    const rows = [...table];
    const sorting = request.query.sorting;
    if (sorting.length > 0) {
      rows.sort((a, b) => {
        for (const { columnId, direction } of sorting) {
          const x = a[columnId as keyof Order];
          const y = b[columnId as keyof Order];
          const order = x < y ? -1 : x > y ? 1 : 0;
          if (order !== 0) return direction === 'asc' ? order : -order;
        }
        return 0;
      });
    }
    return rows;
  };
  const write = (request: WriteRequest<Order>): WriteResult<Order> => {
    const changed = new Map(request.changed.map((c) => [c.rowId, c.row]));
    table = table.map((row) => changed.get(row.id) ?? row);
    return { version: request.version, status: 'applied', changed: request.changed.map((c) => ({ rowId: c.rowId, row: c.row })) };
  };
  return { query, write };
}

export default function ControlledDataDemo() {
  const [lastQuery, queryStore] = useDemoStore('');
  const [log, push] = useEventLog();
  const [source] = useState(() => {
    const store = createOrderStore();
    return createControlledDataSource<Order>({
      // Reads: the grid hands over the query; the app returns rows.
      onQueryChange: (request) => {
        const rows = store.query(request);
        queryStore.set(serializeDataGridQuery(request.query));
        const page = request.range ? rows.slice(request.range.start, request.range.end) : rows;
        return { version: request.version, rows: page, totalRowCount: rows.length };
      },
      // Writes: the grid hands over each save; the app persists it.
      onDataChange: async (request) => {
        push(`onDataChange (${request.mode}): ${request.changed.map((c) => `${c.rowId} ${c.changedColumnIds.join('+')}`).join(', ')}`);
        // The grid shows the rows echoed in the WriteResult (else the request rows) without a re-read.
        return store.write(request);
      },
    });
  });
  return (
    <>
      <DataGrid<Order>
        aria-label="Orders with application-controlled data operations"
        data={source}
        columns={columns}
        sorting
        editing={editing}
        height={320}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
      />
      <p className="demo-status">Sort a column: the serialized query below is what the application received. Double-click a cell and edit it: the save goes to onDataChange.</p>
      <pre className="demo-log" aria-label="Last query">
        {lastQuery || '(waiting for the first query)'}
      </pre>
      <EventLog entries={log} label="Writes" />
    </>
  );
}
