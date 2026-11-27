'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridFilter, type DataGridSortItem, type DataGridState } from '@salmonui/data-grid';
import { TextField } from '@salmonui/inputs/text-field';
import type { RowId } from '@salmonui/core/data';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(500, 23);

const baseColumns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

/** The whole view, owned by the application. */
interface View {
  readonly sortBy: readonly DataGridSortItem[];
  readonly filters: readonly DataGridFilter[];
  readonly search: string;
  readonly page: number;
  readonly hidden: readonly string[];
  readonly selected: readonly RowId[];
}

const initialView: View = { sortBy: [{ field: 'amount', direction: 'desc' }], filters: [], search: '', page: 1, hidden: [], selected: [] };

export default function ControlledStateDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [view, setView] = useState<View>(initialView);
  const [snapshot, setSnapshot] = useState<DataGridState | null>(null);
  const [status, setStatus] = useState('Sort, filter, search, page, hide or select in the grid, or use the buttons: both sides stay in sync.');
  const patch = (next: Partial<View>) => setView((current) => ({ ...current, ...next }));

  // Reactive props: each re-applies when its value changes (compared structurally),
  // and each matching event writes the grid's change back into `view`.
  const columns = useMemo(() => baseColumns.map((c) => ({ ...c, hidden: view.hidden.includes(c.field ?? '') })), [view.hidden]);
  const sorting = useMemo(() => ({ sortBy: view.sortBy }), [view.sortBy]);
  const filtering = useMemo(() => ({ filters: view.filters }), [view.filters]);
  const search = useMemo(() => ({ text: view.search }), [view.search]);
  const paging = useMemo(() => ({ page: view.page, pageSize: 10 }), [view.page]);
  const selection = useMemo(() => ({ multiple: true, rowIds: view.selected }), [view.selected]);

  return (
    <>
      <div className="demo-toolbar">
        <TextField type="search" aria-label="Search orders" placeholder="Search" value={view.search} onValueChange={(value) => patch({ search: value, page: 1 })} />
        <Button variant="outline" onClick={() => patch({ sortBy: [{ field: 'customer', direction: 'asc' }], page: 1 })}>
          Sort by customer
        </Button>
        <Button variant="outline" onClick={() => patch({ filters: [{ field: 'country', operator: 'equal', value: 'Japan' }], page: 1 })}>
          Only Japan
        </Button>
        <Button variant="outline" onClick={() => patch({ page: 3 })}>
          Page 3
        </Button>
        <Button variant="outline" onClick={() => patch({ hidden: view.hidden.includes('product') ? [] : ['product'] })}>
          Toggle Product
        </Button>
        <Button variant="outline" onClick={() => setView(initialView)}>
          Reset view
        </Button>
      </div>
      <div className="demo-toolbar">
        <Button
          variant="outline"
          onClick={() => {
            const state = api.current?.getState({ exclude: ['scroll'] });
            if (!state) return;
            setSnapshot(state);
            setStatus('Snapshot taken with getState().');
          }}
        >
          Take snapshot
        </Button>
        <Button
          variant="outline"
          disabled={snapshot === null}
          onClick={() => {
            const grid = api.current;
            if (!grid || !snapshot) return;
            // Compiled columns are immutable: the same object after the restore means no recompile.
            const before = grid.getColumn('customer');
            const result = grid.restoreState(snapshot);
            const recompiled = grid.getColumn('customer') !== before;
            setStatus(`restoreState: ${result.status}; columns recompiled: ${recompiled ? 'yes' : 'no'}.`);
          }}
        >
          Restore snapshot
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with application-owned view state"
        ref={api}
        data={orders}
        columns={columns}
        sorting={sorting}
        filtering={filtering}
        search={search}
        paging={paging}
        selection={selection}
        height={300}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        onSortChange={(event) => patch({ sortBy: event.sortBy })}
        onFilterChange={(event) => patch({ filters: event.filters })}
        onSearchChange={(event) => patch({ search: event.text })}
        onPageChange={(event) => patch({ page: event.page })}
        onColumnVisibilityChange={(event) => setView((current) => ({ ...current, hidden: [...current.hidden.filter((f) => !event.shown.includes(f)), ...event.hidden] }))}
        onSelectionChange={(event) => patch({ selected: event.rowIds })}
      />
      <p className="demo-status" aria-live="polite">
        {status}
      </p>
      <pre className="demo-log" aria-label="Application view state" tabIndex={0}>
        {JSON.stringify(view, null, 2)}
      </pre>
    </>
  );
}
