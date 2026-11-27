'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, serializeDataGridState, type DataGridApi, type DataGridColumn, type DataGridPersistState, type DataGridRestoreResult, type DataGridState } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(1_000, 17);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
];

// Saved to localStorage under `salmon-data-grid:docs-orders-state` after every change and
// restored after mount. Bump `version` when a release changes the columns:
// states saved by another version are discarded. Constant: the prop is read on mount.
const persistState: DataGridPersistState = { version: 1 };

function describe(result: DataGridRestoreResult): string {
  const notes = [
    result.ignoredColumns.length ? `ignored columns: ${result.ignoredColumns.join(', ')}` : '',
    result.skipped.length ? `skipped parts: ${result.skipped.join(', ')}` : '',
    result.rejected.length ? `rejected: ${result.rejected.map((r) => r.type).join(', ')}` : '',
  ].filter(Boolean);
  return `${result.status}${notes.length ? ` (${notes.join('; ')})` : ''}`;
}

export default function StatePersistenceDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [saved, setSaved] = useState<DataGridState | null>(null);
  const [status, setStatus] = useState('Sort, filter, page, resize or drag a column, then reload the page: the grid comes back as you left it.');
  return (
    <>
      <div className="demo-toolbar">
        <Button
          variant="outline"
          onClick={() => {
            const state = api.current?.getState();
            if (!state) return;
            setSaved(state);
            setStatus('Saved the current state (shown below).');
          }}
        >
          Save state
        </Button>
        <Button
          variant="outline"
          disabled={saved === null}
          onClick={() => {
            if (!api.current || !saved) return;
            setStatus(`Restore: ${describe(api.current.restoreState(saved))}.`);
          }}
        >
          Restore
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (!api.current) return;
            // Back to the definition state; also clears the stored entry.
            setStatus(`Reset: ${describe(api.current.resetState())}.`);
          }}
        >
          Reset
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const state = api.current?.getState({ exclude: ['selection', 'scroll'] });
            if (!state) return;
            // URL-safe base64url: put it in a query string to share a view.
            setStatus(`Shareable: ?view=${serializeDataGridState(state)}`);
          }}
        >
          Copy as URL parameter
        </Button>
      </div>
      <DataGrid<Order>
        id="docs-orders-state"
        aria-label="Orders that remember their state"
        data={orders}
        columns={columns}
        persistState={persistState}
        sorting={{ multiple: true }}
        filtering
        paging={{ pageSize: 10, pageSizeOptions: [10, 20, 50] }}
        resizable
        reorderable
        height={360}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
      />
      <p className="demo-status" aria-live="polite" style={{ overflowWrap: 'anywhere' }}>
        {status}
      </p>
      {saved ? (
        <pre className="demo-log" aria-label="Saved state" tabIndex={0}>
          {JSON.stringify(saved, null, 2)}
        </pre>
      ) : null}
    </>
  );
}
