'use client';

import { useRef, useState } from 'react';
import { createJsonDataSource } from '@salmonui/data';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridInfiniteScroll } from '@salmonui/data-grid';
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
const ROW_HEIGHT = 36;

// The first block is seeded (server render); every other block is read with 800 ms of latency.
const infiniteScroll: DataGridInfiniteScroll<RemoteOrder> = {
  initialBlocks: 1,
  initialResult: { rows: createOrders(100, 77).map(({ placed: _placed, ...row }) => row), totalRowCount: TOTAL },
};

function source() {
  return createJsonDataSource<RemoteOrder>({ url: '/api/orders?delay=800', fetch: demoFetch, key: 'id' });
}

export default function SkeletonRowsDemo() {
  const api = useRef<DataGridApi<RemoteOrder> | null>(null);
  const [skeletonRows, setSkeletonRows] = useState(true);
  // Data sources are initial-only: a new grid (key) and a new source per setting, so every jump reads again.
  const [data, setData] = useState(source);
  const toggle = (on: boolean) => {
    setSkeletonRows(on);
    setData(source());
  };
  // api.scrollTo takes the row offset in px; the grid maps it onto its compressed scroll range when needed.
  const jump = (row: number) => api.current?.scrollTo({ top: row * ROW_HEIGHT });
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={skeletonRows} onCheckedChange={(checked) => toggle(checked)}>
          Skeleton rows
        </Checkbox>
        <Button variant="outline" onClick={() => jump(20_000)}>
          Jump to row 20,000
        </Button>
        <Button variant="outline" onClick={() => jump(40_000)}>
          Jump to row 40,000
        </Button>
      </div>
      <DataGrid<RemoteOrder>
        key={skeletonRows ? 'skeleton' : 'text'}
        aria-label="50,000 remote orders with skeleton rows while blocks load"
        data={data}
        columns={columns}
        height={380}
        rowHeight={ROW_HEIGHT}
        locale="en-US"
        currency="USD"
        ref={api}
        infiniteScroll={infiniteScroll}
        virtualization={{ skeletonRows }}
      />
    </>
  );
}
