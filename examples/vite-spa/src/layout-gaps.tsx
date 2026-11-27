// Sizing, row template and pinned-detail browser page
// (tests/browser/virtualization-gaps.spec.ts, tests/browser/a11y.spec.ts):
//
//   ?rows=<n>&cols=<n>   fixture size (default 10,000 x 10; `id` is pinned to the start)
//   ?height=auto|100%|none|<px>   the grid `height` (`none` leaves the prop unset: default 400)
//   ?parent=<w>x<h>      wraps the grid in a fixed-size #parent (window.__resizeParent(w, h))
//   ?virt=0              virtualization={false}
//   ?rowHeight=<px>      the grid `rowHeight`
//   ?rowTpl              renderRow through DataGridRow (a class and a data attribute per row)
//   ?pinEnd              pins the last column to the end
//   ?detail              renderDetail on every row
//   ?child               childGrid (three orders per row for the first 500 rows)
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { defineChildGrid, DataGrid, DataGridRow, type DataGridApi, type DataGridColumn, type DataGridDetailContext, type DataGridProps, type DataGridRowContext } from '@salmonui/data-grid';
import { createFixture, type Row } from './fixture.ts';

interface Order {
  readonly orderId: string;
  readonly parentId: string;
  readonly total: number;
}

const win = window as unknown as {
  __gridApi?: DataGridApi<Row> | null;
  __mountMs?: number;
  __resizeParent?: (width: number, height: number) => void;
};

const params = new URLSearchParams(location.search);
const rowCount = Number(params.get('rows') ?? 10_000);
const colCount = Number(params.get('cols') ?? 10);
const { rows, columns: baseColumns } = createFixture(rowCount, colCount);
let columns: DataGridColumn<Row>[] = baseColumns;
if (params.has('pinEnd')) {
  const last = columns[columns.length - 1];
  if (last) columns = [...columns.slice(0, -1), { ...last, pinned: 'end' }];
}

const heightParam = params.get('height');
const height: DataGridProps<Row>['height'] = heightParam === null ? 400 : heightParam === 'none' ? undefined : /^\d+$/.test(heightParam) ? Number(heightParam) : heightParam;

// Module scope: stable template identities (no template-identity-unstable warning).
const renderRow = ({ rowProps, cells, rowIndex }: DataGridRowContext<Row>) => (
  <DataGridRow {...rowProps} className={`${rowProps.className} tpl-row`} data-tpl={rowIndex % 2 === 0 ? 'even' : 'odd'}>
    {cells}
  </DataGridRow>
);
const renderDetail = ({ row }: DataGridDetailContext<Row>) => <div className="detail-content">Detail of {row.id}</div>;

const orders: Order[] = [];
for (let i = 0; i < Math.min(rowCount, 500) * 3; i++) orders.push({ orderId: `o${i}`, parentId: `r${i % Math.min(rowCount, 500)}`, total: 100 + i });
const childGrid = defineChildGrid<Order, Row>({
  data: orders,
  parentField: 'id',
  childField: 'parentId',
  columns: [
    { field: 'orderId', header: 'Order', primaryKey: true, width: 100 },
    { field: 'total', header: 'Total', type: 'number', width: 120 },
  ],
});

const parentSize = params.get('parent')?.split('x').map(Number) ?? null;

function Page() {
  const [size, setSize] = useState<[number, number] | null>(parentSize ? [parentSize[0] ?? 700, parentSize[1] ?? 500] : null);
  useEffect(() => {
    win.__resizeParent = (w, h) => setSize([w, h]);
  }, []);
  const grid = (
    <DataGrid<Row>
      aria-label="Layout gaps"
      data={rows}
      columns={columns}
      timeZone="UTC"
      resizable
      reorderable
      {...(height !== undefined ? { height } : {})}
      {...(params.get('virt') === '0' ? { virtualization: false } : {})}
      {...(params.has('rowHeight') ? { rowHeight: Number(params.get('rowHeight')) } : {})}
      {...(params.has('rowTpl') ? { renderRow } : {})}
      {...(params.has('detail') ? { renderDetail } : {})}
      {...(params.has('child') ? { childGrid } : {})}
      onReady={(api) => {
        win.__gridApi = api;
      }}
    />
  );
  return size ? (
    <div id="parent" style={{ width: size[0], height: size[1], border: '1px solid gray', boxSizing: 'content-box' }}>
      {grid}
    </div>
  ) : (
    grid
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
    win.__mountMs = performance.now() - start;
  }, 0);
});
