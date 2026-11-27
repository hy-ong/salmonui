'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridFiltering, type DataGridPaging } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { useDemoStore } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(2_000, 23);

const columns: DataGridColumn<Order>[] = [
  { type: 'selection', width: 44 },
  { field: 'id', header: 'Order', primaryKey: true, width: 110, pinned: 'start' },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'priority', header: 'Priority', width: 100 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120, pinned: 'end' },
];

// Pinned by data: the first three High-priority orders of the fixture (pure, read once).
const highlighted = new Set(orders.filter((o) => o.priority === 'High').slice(0, 3).map((o) => o.id));
const isRowPinned = (order: Order) => highlighted.has(order.id);

const filtering: DataGridFiltering = { ui: 'row' };
const paged: DataGridPaging = { pageSize: 10 };
const toolbar = ['search'] as const;
const STICKY_ROWS = [0, 1, 2].map((n) => ({ value: String(n), label: String(n) }));

export default function PinnedRowsDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [paging, setPaging] = useState(false);
  const [stickyRows, setStickyRows] = useState(0);
  const [pinned, pinnedStore] = useDemoStore<readonly string[]>([]);
  const refresh = () => pinnedStore.set(api.current?.getPinnedRowIds() ?? []);
  const selected = () => api.current?.getSelectedRowIds() ?? [];
  return (
    <>
      <div className="demo-toolbar">
        <Button
          variant="outline"
          onClick={() => {
            api.current?.pinRows(selected());
            refresh();
          }}
        >
          Pin selected rows
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            api.current?.unpinRows(selected());
            refresh();
          }}
        >
          Unpin selected rows
        </Button>
        <Checkbox checked={paging} onCheckedChange={(checked) => setPaging(checked)}>
          Paging (10 per page)
        </Checkbox>
        <label>
          Sticky rows below the pinned rows
          <Select aria-label="Sticky rows below the pinned rows" data={STICKY_ROWS} value={String(stickyRows)} onValueChange={(value) => value != null && setStickyRows(Number(value))} />
        </label>
      </div>
      <DataGrid<Order>
        aria-label="Orders with pinned rows"
        data={orders}
        columns={columns}
        isRowPinned={isRowPinned}
        stickyRows={stickyRows}
        selection={{ multiple: true }}
        sorting
        filtering={filtering}
        search
        toolbar={toolbar}
        paging={paging ? paged : false}
        height={420}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onReady={(grid) => pinnedStore.set(grid.getPinnedRowIds())}
        onViewChange={refresh}
      />
      <p className="demo-status" aria-live="polite">
        Pinned rows shown: {pinned.length ? pinned.join(', ') : 'none'}
      </p>
    </>
  );
}
