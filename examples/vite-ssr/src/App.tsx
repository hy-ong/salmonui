import { Suspense, useEffect } from 'react';
import { DataGrid, defineChildGrid, type DataGridColumn, type DataGridFeature } from '@salmonui/data-grid';
import { ThemeProvider } from '@salmonui/core/theme';
import { ThemeStyle } from '@salmonui/core/server';

export interface Order {
  readonly id: string;
  readonly customer: string;
  readonly amount: number;
  readonly placed: Date;
  readonly paid: boolean;
  readonly note: string;
}

// Deterministic data: identical on the server and the client.
function createOrders(count: number): Order[] {
  let state = 42;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const names = ['Aiko', 'Bao', 'Chen', 'Dewi', 'Elif', 'Farah', 'Goran', 'Hana', 'Ines', 'Jun'];
  const out: Order[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `o${i}`,
      customer: `${names[next() % names.length]} ${i}`,
      amount: (next() % 1_000_000) / 100,
      placed: new Date(Date.UTC(2025, next() % 12, 1 + (next() % 28), next() % 24)),
      paid: ((next() >>> 16) & 1) === 1,
      note: i % 5 === 0 ? 'Priority shipping requested by the customer' : '',
    });
  }
  return out;
}

const orders = createOrders(10_000);
const theme = { colors: { primary: '#0f766e' as const }, colorScheme: 'auto' as const };

// Initially selected rows; a stable value (a new array would re-apply the selection).
const selection = { rowIds: ['o1', 'o4'] };

const columns: DataGridColumn<Order>[] = [
  // The selection checkbox column with header select-all.
  { type: 'selection' },
  { field: 'id', header: 'Order', primaryKey: true, width: 100, pinned: 'start' },
  { field: 'customer', header: 'Customer', width: 180 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 140 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 160 },
  { field: 'paid', header: 'Paid', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 90 },
  { field: 'note', header: 'Note', width: 'auto', overflow: 'ellipsisWithTooltip' },
  {
    id: 'status',
    header: 'Status',
    width: 120,
    valueGetter: (o) => (o.paid ? 'Paid' : 'Open'),
    renderCell: ({ value }) => <span className={value === 'Paid' ? 'badge badge--paid' : 'badge'}>{String(value)}</span>,
  },
];

// `?newrow`: editing with the always-visible add row, rendered at rest on the server.
const newRowEditing = { showNewRow: true } as const;

// `?features=paging`: render features the grid loads on demand (feature chunks); the
// server renders them synchronously and hydration waits for their chunk with the server HTML in place.
const pagingSettings = { pageSize: 20 } as const;

// `?features=detail`: child grids (the `detail` render feature), two of them expanded from the start, so
// the server renders them and hydration keeps them while the detail chunk loads.
interface Line {
  readonly lineId: string;
  readonly orderId: string;
  readonly sku: string;
}
const lines: Line[] = Array.from({ length: 12 }, (_, i) => ({ lineId: `l${i}`, orderId: `o${i % 4}`, sku: `SKU-${i}` }));
const childGrid = defineChildGrid<Line, Order>({
  data: lines,
  parentField: 'id',
  childField: 'orderId',
  columns: [
    { field: 'lineId', header: 'Line', primaryKey: true, width: 100 },
    { field: 'sku', header: 'SKU', width: 140 },
  ],
});
const expandedDetails = ['o0', 'o2'];

// `?features=tree`: tree mode (the `tree` render feature) over the first 60 orders, flat rows with a
// parent id (each fifth order heads the next four), rendered on the server as a treegrid.
const treeOrders: Order[] = orders.slice(0, 60).map((o, i) => ({ ...o, parentId: i % 5 === 0 ? null : `o${i - (i % 5)}` }));
const treeMode = { parentIdField: 'parentId' } as const;

/** Client only: set once the real grid committed (after its feature chunks loaded and it hydrated). */
function markReady(): void {
  (globalThis as { __gridReady?: boolean; __gridReadyAt?: number }).__gridReady = true;
  (globalThis as { __gridReadyAt?: number }).__gridReadyAt = performance.now();
}

/** Render feature names of the `?features=` parameter (comma-separated). */
export function featuresOf(url: string): readonly string[] {
  return (new URL(url, 'http://localhost').searchParams.get('features') ?? '').split(',').filter(Boolean);
}

/**
 * `preloaded` (`?features=paging,preload`): the `features` prop provides paging, so neither the server nor
 * hydration waits. The entries import the features entry (the client only in this mode), so the other modes
 * load paging on demand.
 */
export function App({ newRow = false, features = [], suspense = false, preloaded }: { newRow?: boolean; features?: readonly string[]; suspense?: boolean; preloaded?: readonly DataGridFeature[] } = {}) {
  const grid = (
        <DataGrid<Order>
          aria-labelledby="orders-title"
          data={features.includes('tree') ? treeOrders : orders}
          columns={columns}
          height={480}
          timeZone="UTC"
          locale="en-US"
          selection={selection}
          onReady={markReady}
          {...(newRow ? { editing: newRowEditing } : {})}
          {...(features.includes('paging') ? { paging: pagingSettings } : {})}
          {...(features.includes('detail') ? { childGrid, defaultExpandedDetails: expandedDetails } : {})}
          {...(features.includes('tree') ? { tree: treeMode } : {})}
          {...(preloaded ? { features: preloaded } : {})}
        />
  );
  // The rest of the page hydrated (a gated grid that waits for its chunk delays this only without an app boundary).
  useEffect(() => {
    (globalThis as { __appHydratedAt?: number }).__appHydratedAt = performance.now();
  }, []);
  return (
    <>
      <ThemeStyle theme={theme} />
      <ThemeProvider theme={theme} className="app">
        <h1 id="orders-title">Orders (SSR)</h1>
        {suspense ? <Suspense fallback={null}>{grid}</Suspense> : grid}
      </ThemeProvider>
    </>
  );
}
