// Hierarchy browser page (tests/browser/hierarchy.spec.ts): detail rows over a
// large virtualized grid, child grids with a nested level, row drag within
// a grid and between two grids, and a custom drop zone.
//
//   ?mode=detail   10k rows, renderDetail with an async loadDetail (?rows=)
//   ?mode=child    customers -> orders -> lines (childGrid, nested)
//   ?mode=drag     two grids: #left (rowDrag targetId "right") and #right, plus #bin
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { DataGrid, type DataGridApi, defineChildGrid, type DataGridColumn, type DataGridRowDragEvent } from '@salmonui/data-grid';

interface Customer {
  readonly id: string;
  readonly name: string;
  readonly city: string;
}
interface Order {
  readonly orderId: string;
  readonly customerId: string;
  readonly total: number;
}
interface Line {
  readonly lineId: string;
  readonly orderId: string;
  readonly sku: string;
}

declare global {
  interface Window {
    __gridApi?: DataGridApi<any> | null;
    __rightApi?: DataGridApi<any> | null;
    __mountMs?: number;
    __events: { type: string; [key: string]: unknown }[];
    __cancelDrop?: boolean;
    /** With `?holdDetail=1`, resolves the pending `loadDetail` calls and ends the hold. */
    __releaseDetails?: () => void;
  }
}

window.__events = [];
const log = (type: string, fields: Record<string, unknown> = {}) => window.__events.push({ type, ...fields });

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'detail';
const rowCount = Number(params.get('rows') ?? (mode === 'detail' ? 10_000 : 50));
const cities = ['Oslo', 'Lima', 'Pune', 'Kobe', 'Graz'];
const customers: Customer[] = Array.from({ length: rowCount }, (_, i) => ({ id: `c${i}`, name: `Customer ${i}`, city: cities[i % 5] as string }));
const orders: Order[] = [];
for (let i = 0; i < Math.min(rowCount, 500) * 3; i++) orders.push({ orderId: `o${i}`, customerId: `c${i % Math.min(rowCount, 500)}`, total: 100 + i });
const lines: Line[] = orders.flatMap((o, i) => [0, 1].map((k) => ({ lineId: `${o.orderId}-${k}`, orderId: o.orderId, sku: `SKU-${i}-${k}` })));

const columns: DataGridColumn<Customer>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 90 },
  { field: 'name', header: 'Name', width: 180 },
  { field: 'city', header: 'City', width: 120 },
];

const childGrid = defineChildGrid<Order, Customer>({
  data: orders,
  parentField: 'id',
  childField: 'customerId',
  columns: [
    { field: 'orderId', header: 'Order', primaryKey: true, width: 100 },
    { field: 'total', header: 'Total', type: 'number', format: 'N2', width: 120 },
  ],
  childGrid: defineChildGrid<Line, Order>({
    data: lines,
    joinField: 'orderId',
    columns: [
      { field: 'lineId', header: 'Line', primaryKey: true, width: 120 },
      { field: 'sku', header: 'SKU', width: 160 },
    ],
  }),
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// `?holdDetail=1` keeps detail loads pending until the test calls
// `window.__releaseDetails()`, so the `loading` state is observable without
// racing a timer. Releasing also ends the hold; later loads take 50 ms.
let holdDetails = params.has('holdDetail');
const pendingDetails: (() => void)[] = [];
window.__releaseDetails = () => {
  holdDetails = false;
  for (const release of pendingDetails.splice(0)) release();
};
const detailLoaded = () => (holdDetails ? new Promise<void>((resolve) => pendingDetails.push(resolve)) : delay(50));

function DetailPage() {
  return (
    <DataGrid<Customer>
      aria-label="Customers"
      id="customers"
      data={customers}
      columns={columns}
      height={600}
      ref={(api) => {
        window.__gridApi = api;
      }}
      exportWriters={{ excel: () => import('@salmonui/export/xlsx'), pdf: () => import('@salmonui/export/pdf') }}
      loadDetail={async ({ row }) => {
        await detailLoaded();
        return `${row.name} lives in ${row.city}`;
      }}
      renderDetail={({ row, status, data, collapse }) => (
        <div className="detail-content" style={{ height: row.id.endsWith('3') ? 220 : 120 }}>
          <strong>{row.name}</strong> <span className="detail-status">{status === 'ready' ? String(data) : status}</span>{' '}
          <button type="button" onClick={collapse}>
            Close
          </button>
        </div>
      )}
      onBeforeDetailToggle={(e) => log('beforeDetailToggle', { rowId: e.rowId, expanded: e.expanded })}
      onDetailToggle={(e) => log('detailToggle', { rowId: e.rowId, expanded: e.expanded, source: e.source })}
    />
  );
}

function ChildPage() {
  return (
    <DataGrid<Customer>
      aria-label="Customers"
      id="customers"
      data={customers}
      columns={columns}
      height={600}
      locale="de-DE"
      ref={(api) => {
        window.__gridApi = api;
      }}
      exportWriters={{ excel: () => import('@salmonui/export/xlsx'), pdf: () => import('@salmonui/export/pdf') }}
      childGrid={childGrid}
    />
  );
}

function DragPage() {
  const [dropped, setDropped] = useState<string[]>([]);
  const record = (type: string) => (e: DataGridRowDragEvent<Customer>) => {
    log(type, { rowIds: [...e.rowIds], fromIndex: e.fromIndex, toIndex: e.toIndex, targetGridId: e.targetGridId, valid: e.valid, source: e.source, target: e.target?.id ?? null });
    if (type === 'beforeRowDrop' && window.__cancelDrop) {
      window.__cancelDrop = false;
      e.preventDefault();
    }
    if (type === 'rowDrop' && e.targetGridId === null) setDropped((d) => [...d, ...e.rowIds]);
  };
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <DataGrid<Customer>
        aria-label="Left"
        id="left"
        data={customers}
        columns={columns}
        height={500}
        width={460}
        selection={{ multiple: true }}
        rowDrag={{ targetId: params.get('target') ?? 'right' }}
        ref={(api) => {
          window.__gridApi = api;
        }}
        onRowDragStart={record('rowDragStart')}
        onRowDrag={record('rowDrag')}
        onBeforeRowDrop={record('beforeRowDrop')}
        onRowDrop={record('rowDrop')}
      />
      <DataGrid<Customer>
        aria-label="Right"
        id="right"
        data={[]}
        columns={columns}
        height={500}
        width={460}
        rowDrag
        ref={(api) => {
          window.__rightApi = api;
        }}
      />
      <div id="bin" style={{ width: 160, height: 200, border: '2px dashed gray', padding: 8 }}>
        Bin: <span id="bin-count">{dropped.length}</span>
      </div>
    </div>
  );
}

const start = performance.now();
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>{mode === 'child' ? <ChildPage /> : mode === 'drag' ? <DragPage /> : <DetailPage />}</StrictMode>,
);
requestAnimationFrame(() => {
  setTimeout(() => {
    window.__mountMs = performance.now() - start;
  }, 0);
});
