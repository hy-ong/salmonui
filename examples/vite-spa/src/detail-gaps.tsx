// Browser page of tests/browser/detail-gaps.spec.ts: detail rows with pinned
// start and end columns, child grids under a custom theme, row drag events,
// previews and policies, column drag events, and onKeyDown / keyBindings.
//
//   ?mode=detail  60 customers, pinned id (start) and total (end), renderDetail
//                 (&keys: keyBindings { 'focus.down': ['j'] } and an onKeyDown recorder)
//   ?mode=child   customers -> orders -> lines (childGrid); &theme wraps it in a dark ThemeProvider;
//                 &childDrag: parent and order grids both drag rows (child events are logged as childRow*)
//   ?mode=drag    rowDrag (&across: acrossGroups, &group: grouped by city, &preview: renderRowDragPreview,
//                 &detail: renderDetail, &rowSpan: city spans 2 rows, &renderRow: custom row element)
//   &pinRows=c3,c7  pins those rows (defaultPinnedRows) in any mode
//
// Events go to window.__events. window.__cancel = '<eventType>' cancels the next event of that type;
// window.__preventCommand = '<command>' makes onKeyDown call preventDefault() for that command.
import { StrictMode, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { DataGrid, defineChildGrid, type DataGridApi, type DataGridColumn, type DataGridProps } from '@salmonui/data-grid';
import { ThemeProvider } from '@salmonui/core/theme';
import { ThemeStyle } from '@salmonui/core/server';

interface Customer {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly total: number;
  readonly [key: string]: string | number;
}
interface Order {
  readonly orderId: string;
  readonly customerId: string;
  readonly amount: number;
}
interface Line {
  readonly lineId: string;
  readonly orderId: string;
  readonly sku: string;
}

interface PageWindow {
  __gridApi?: DataGridApi<Customer> | null;
  __mountMs?: number;
  __events: { type: string; [key: string]: unknown }[];
  __cancel?: string | null;
  __preventCommand?: string | null;
}
const w = window as unknown as PageWindow;
w.__events = [];
const log = (type: string, fields: Record<string, unknown> = {}) => w.__events.push({ type, ...fields });
const cancelled = (type: string, e: { preventDefault(): void }) => {
  if (w.__cancel === type) {
    w.__cancel = null;
    e.preventDefault();
    log(`${type}:cancelled`);
  }
};

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'detail';
const rowCount = Number(params.get('rows') ?? 60);
const cities = ['Oslo', 'Lima', 'Pune', 'Kobe', 'Graz'];
const customers: Customer[] = Array.from({ length: rowCount }, (_, i) => {
  const row: Record<string, string | number> = { id: `c${i}`, name: `Customer ${i}`, city: cities[i % 5] as string, total: 1000 + i };
  for (let k = 0; k < 8; k++) row[`x${k}`] = `X${k}-${i}`;
  return row as Customer;
});
const orders: Order[] = [];
for (let i = 0; i < rowCount * 2; i++) orders.push({ orderId: `o${i}`, customerId: `c${i % rowCount}`, amount: 10 + i });
const lines: Line[] = orders.flatMap((o, i) => [0, 1].map((k) => ({ lineId: `${o.orderId}-${k}`, orderId: o.orderId, sku: `SKU-${i}-${k}` })));

const wideColumns: DataGridColumn<Customer>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 90, pinned: 'start' },
  { field: 'name', header: 'Name', width: 160 },
  ...Array.from({ length: 8 }, (_, k): DataGridColumn<Customer> => ({ field: `x${k}`, header: `Extra ${k}`, width: 140 })),
  { field: 'total', header: 'Total', type: 'number', format: 'N0', width: 110, pinned: 'end' },
];
const narrowColumns: DataGridColumn<Customer>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 90 },
  { field: 'name', header: 'Name', width: 160 },
  { field: 'city', header: 'City', width: 120, ...(params.has('rowSpan') ? { rowSpan: ({ rowIndex }: { rowIndex: number }) => (rowIndex % 4 === 0 ? 2 : 1) } : {}) },
];

const childGrid = defineChildGrid<Order, Customer>({
  data: orders,
  parentField: 'id',
  childField: 'customerId',
  columns: [
    { field: 'orderId', header: 'Order', primaryKey: true, width: 100 },
    { field: 'amount', header: 'Amount', type: 'number', format: 'N2', width: 120 },
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

// &childDrag: the order grids reorder their own rows; their drag events are logged with a childRow prefix.
const childGridDrag = defineChildGrid<Order, Customer>({
  data: orders,
  parentField: 'id',
  childField: 'customerId',
  columns: [
    { field: 'orderId', header: 'Order', primaryKey: true, width: 100 },
    { field: 'amount', header: 'Amount', type: 'number', format: 'N2', width: 120 },
  ],
  rowDrag: true,
  onRowDragStart: (e) => log('childRowDragStart', { rowIds: [...e.rowIds], fromIndex: e.fromIndex }),
  onRowDrop: (e) => log('childRowDrop', { rowIds: [...e.rowIds], toIndex: e.toIndex }),
});

const detailEvents: Partial<DataGridProps<Customer>> = {
  onBeforeDetailToggle: (e) => {
    log('beforeDetailToggle', { rowId: e.rowId, expanded: e.expanded, source: e.source, row: (e.row as Customer | null)?.id ?? null });
    cancelled('beforeDetailToggle', e);
  },
  onDetailToggle: (e) => log('detailToggle', { rowId: e.rowId, expanded: e.expanded, source: e.source }),
};

const renderDetail = ({ row }: { row: Customer }): ReactNode =>
  createElement('div', { className: 'detail-content', style: { height: 80 } }, createElement('strong', null, row.name), ' ', createElement('button', { type: 'button' }, 'Open'));

function props(): DataGridProps<Customer> {
  const base: DataGridProps<Customer> = {
    'aria-label': 'Customers',
    id: 'customers',
    data: customers,
    columns: narrowColumns,
    height: 500,
    ...(params.has('pinRows') ? { defaultPinnedRows: (params.get('pinRows') ?? '').split(',').filter(Boolean) } : {}),
    ref: (api: DataGridApi<Customer> | null) => {
      w.__gridApi = api;
    },
  } as DataGridProps<Customer>;
  if (mode === 'detail') {
    return {
      ...base,
      columns: wideColumns,
      width: 720,
      renderDetail,
      ...detailEvents,
      ...(params.has('keys')
        ? {
            keyBindings: { 'focus.down': ['j'] },
            onKeyDown: (ctx) => {
              log('keyDown', { key: ctx.nativeEvent.key, command: ctx.command, context: ctx.context, rowId: ctx.rowId, field: ctx.field });
              if (ctx.command !== null && w.__preventCommand === ctx.command) ctx.preventDefault();
            },
          }
        : {}),
    };
  }
  if (mode === 'child') {
    if (!params.has('childDrag')) return { ...base, childGrid, ...detailEvents };
    return {
      ...base,
      childGrid: childGridDrag,
      ...detailEvents,
      rowDrag: true,
      onRowDragStart: (e) => log('rowDragStart', { rowIds: [...e.rowIds], fromIndex: e.fromIndex }),
      onRowDrop: (e) => log('rowDrop', { rowIds: [...e.rowIds], toIndex: e.toIndex }),
    };
  }
  // mode=drag
  return {
    ...base,
    selection: { multiple: true },
    rowDrag: params.has('across') ? { acrossGroups: true } : true,
    reorderable: true,
    ...(params.has('group') ? { grouping: { groupBy: ['city'] } } : {}),
    ...(params.has('detail') ? { renderDetail } : {}),
    ...(params.has('renderRow')
      ? { renderRow: (ctx) => createElement('div', { ...ctx.rowProps, 'data-custom-row': '' }, ctx.cells) }
      : {}),
    ...(params.has('preview')
      ? {
          renderRowDragPreview: (ctx) =>
            createElement('span', { className: 'custom-preview' }, `Moving ${ctx.rowIds.length}: ${ctx.rows.map((r) => r.name).join(', ')}`),
        }
      : {}),
    onRowDragStart: (e) => {
      log('rowDragStart', { rowIds: [...e.rowIds], fromIndex: e.fromIndex, source: e.source });
      cancelled('rowDragStart', e);
    },
    onRowDrag: (e) => log('rowDrag', { rowIds: [...e.rowIds] }),
    onBeforeRowDrop: (e) => log('beforeRowDrop', { rowIds: [...e.rowIds], toIndex: e.toIndex, valid: e.valid, source: e.source }),
    onRowDrop: (e) => log('rowDrop', { rowIds: [...e.rowIds], toIndex: e.toIndex, source: e.source }),
    onColumnDragStart: (e) => log('columnDragStart', { field: e.field, fromIndex: e.fromIndex, toIndex: e.toIndex, source: e.source }),
    onColumnDrag: (e) => log('columnDrag', { field: e.field, fromIndex: e.fromIndex, toIndex: e.toIndex }),
    onColumnDrop: (e) => log('columnDrop', { field: e.field, fromIndex: e.fromIndex, toIndex: e.toIndex, source: e.source }),
  };
}

const THEME = { colors: { primary: '#c2410c' as const }, colorScheme: 'dark' as const };

function Page() {
  const grid = <DataGrid<Customer> {...props()} />;
  return (
    <>
      <button type="button" id="before">
        Before
      </button>
      {params.has('theme') ? (
        <ThemeProvider theme={THEME} className="themed">
          <ThemeStyle theme={THEME} />
          {grid}
        </ThemeProvider>
      ) : (
        grid
      )}
      <button type="button" id="after">
        After
      </button>
    </>
  );
}

const start = performance.now();
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
requestAnimationFrame(() => {
  setTimeout(() => {
    w.__mountMs = performance.now() - start;
  }, 0);
});
