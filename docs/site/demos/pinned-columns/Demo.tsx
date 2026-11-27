'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridColumnMenuItemId, type DataGridMenuItem, type DataGridPinnedColumns } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(2_000, 17);

// Wide enough to scroll horizontally: Order is pinned to the start and Amount
// to the end by definition; the rest scroll between them. Product is fixed
// (`pinned: 'center'`): it scrolls with its slot,
// then stays in view at the start or end edge of the scrolling columns.
const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110, pinned: 'start' },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'city', header: 'City', width: 130 },
  { field: 'product', header: 'Product', width: 150, pinned: 'center' },
  { field: 'category', header: 'Category', width: 120 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'unitPrice', header: 'Unit price', type: 'number', format: 'C2', align: 'end', width: 110 },
  { field: 'discount', header: 'Discount', type: 'number', format: 'P0', align: 'end', width: 100 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
  { field: 'priority', header: 'Priority', width: 100 },
  { field: 'note', header: 'Note', width: 240 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120, pinned: 'end' },
];

// Pin items first; a separator is an item object.
const columnMenu: readonly (DataGridColumnMenuItemId | DataGridMenuItem)[] = ['pinStart', 'pinEnd', 'unpin', { id: 'separator', separator: true }, 'autoSize', 'autoSizeAll'];

const COUNT_OPTIONS = [0, 1, 2, 3].map((n) => ({ value: String(n), label: String(n) }));

// Cell editing works in every zone: double-click or press F2 on a pinned cell too.
const editing = { mode: 'cell' } as const;

export default function PinnedColumnsDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [startCount, setStartCount] = useState(0);
  const [stickyRows, setStickyRows] = useState(2);
  const [stickyBottomRows, setStickyBottomRows] = useState(1);
  const [locked, setLocked] = useState(false);
  const [log, push] = useEventLog();
  // Reactive count shorthand: a new object re-applies; an explicit `pinned` beats the count.
  const pinnedColumns: DataGridPinnedColumns = { start: startCount };
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Pinned start count
          <Select aria-label="Pinned start count" data={COUNT_OPTIONS} value={String(startCount)} onValueChange={(value) => value != null && setStartCount(Number(value))} />
        </label>
        <label>
          Sticky top rows
          <Select aria-label="Sticky top rows" data={COUNT_OPTIONS} value={String(stickyRows)} onValueChange={(value) => value != null && setStickyRows(Number(value))} />
        </label>
        <label>
          Sticky bottom rows
          <Select aria-label="Sticky bottom rows" data={COUNT_OPTIONS} value={String(stickyBottomRows)} onValueChange={(value) => value != null && setStickyBottomRows(Number(value))} />
        </label>
        <Checkbox checked={locked} onCheckedChange={(checked) => setLocked(checked)}>
          Cancel pin changes
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.pinColumn('customer', 'start')}>
          Pin Customer to the start
        </Button>
        <Button variant="outline" onClick={() => api.current?.pinColumn('priority', 'end')}>
          Pin Priority to the end
        </Button>
        <Button variant="outline" onClick={() => api.current?.pinColumn('amount', null)}>
          Unpin Amount
        </Button>
        <Button variant="outline" onClick={() => api.current?.pinColumn('note', 'center')}>
          Fix Note in place
        </Button>
        <Button variant="outline" onClick={() => api.current?.pinColumn('product', null)}>
          Unfix Product
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with pinned columns and sticky rows"
        data={orders}
        columns={columns}
        pinnedColumns={pinnedColumns}
        stickyRows={stickyRows}
        stickyBottomRows={stickyBottomRows}
        columnMenu={columnMenu}
        editing={editing}
        sorting
        resizable
        reorderable
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onBeforeColumnPinChange={(event) => {
          if (locked) {
            event.preventDefault();
            push(`pin canceled: ${event.field} → ${event.pinned ?? 'unpinned'}`);
          }
        }}
        onColumnPinChange={(event) => push(`pin (${event.source}): ${event.field} ${event.previousPinned ?? 'unpinned'} → ${event.pinned ?? 'unpinned'}`)}
        onColumnReorder={(event) => push(`reorder (${event.source}): ${event.field} ${event.fromIndex} → ${event.toIndex}`)}
      />
      <EventLog entries={log} />
    </>
  );
}
