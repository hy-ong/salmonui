'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridColumn, type DataGridDevtoolsCommit } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(10_000, 97);

// A stable `columns` identity: compiled once for the grid's lifetime.
const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

interface Totals {
  readonly commits: number;
  readonly cells: number;
  readonly rows: number;
  readonly headers: number;
}
const ZERO: Totals = { commits: 0, cells: 0, rows: 0, headers: 0 };

/** Render totals since the last reset, fed by the dev-only `__SALMON_UI_DEVTOOLS__` hook. */
function createCounter() {
  let totals = ZERO;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  return {
    record(commit: DataGridDevtoolsCommit) {
      totals = { commits: totals.commits + 1, cells: totals.cells + commit.cells.length, rows: totals.rows + commit.rows.length, headers: totals.headers + commit.headers.length };
      emit();
    },
    reset() {
      totals = ZERO;
      emit();
    },
    get: () => totals,
    getServer: () => ZERO,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
type Counter = ReturnType<typeof createCounter>;

/** The read-out re-renders on its own, so counting never re-renders the grid. */
function Readout({ counter }: { counter: Counter }) {
  const totals = useSyncExternalStore(counter.subscribe, counter.get, counter.getServer);
  return (
    <p className="demo-status" role="status" aria-label="Render counts">
      Since reset: {totals.commits} grid commits, {totals.cells} cells, {totals.rows} rows, {totals.headers} header cells re-rendered.
    </p>
  );
}

export default function RenderCountsDemo() {
  const [counter] = useState(createCounter);
  const [parentRenders, setParentRenders] = useState(0);
  useEffect(() => {
    // Development builds only: the grid reports each commit to this global hook.
    const target = globalThis as { __SALMON_UI_DEVTOOLS__?: { onCommit?(commit: DataGridDevtoolsCommit): void } | undefined };
    const previous = target.__SALMON_UI_DEVTOOLS__;
    target.__SALMON_UI_DEVTOOLS__ = { onCommit: (commit) => counter.record(commit) };
    return () => {
      target.__SALMON_UI_DEVTOOLS__ = previous;
    };
  }, [counter]);
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={counter.reset}>
          Reset counters
        </Button>
        <Button variant="outline" onClick={() => setParentRenders((n) => n + 1)}>
          Re-render the parent ({parentRenders})
        </Button>
      </div>
      <DataGrid<Order> aria-label="Orders with render counting" data={orders} columns={columns} height={320} locale="en-US" currency="USD" timeZone="UTC" />
      <Readout counter={counter} />
    </>
  );
}
