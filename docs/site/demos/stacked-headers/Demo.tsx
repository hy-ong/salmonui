'use client';

import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(3_000, 5);

// Three header levels. Group columns carry a header, alignment, header props
// and an optional header template; sorting, filtering, resizing and
// reordering act on the leaves, and a leaf only moves within its parent.
const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110, pinned: 'start' },
  {
    id: 'customerGroup',
    header: 'Customer',
    headerAlign: 'start',
    columns: [
      { field: 'customer', header: 'Name', width: 150 },
      {
        id: 'location',
        header: 'Location',
        columns: [
          { field: 'country', header: 'Country', width: 120 },
          { field: 'city', header: 'City', width: 130 },
        ],
      },
    ],
  },
  {
    id: 'productGroup',
    header: 'Product',
    headerProps: { title: 'Product and category', 'data-group': 'product' },
    columns: [
      { field: 'product', header: 'Item', width: 150 },
      { field: 'category', header: 'Category', width: 120 },
    ],
  },
  {
    id: 'salesGroup',
    header: 'Sales',
    headerAlign: 'end',
    renderHeader: () => (
      <span>
        Sales <span className="demo-badge" data-tone="info">USD</span>
      </span>
    ),
    columns: [
      { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
      { field: 'unitPrice', header: 'Unit price', type: 'number', format: 'C2', align: 'end', width: 110 },
      { field: 'discount', header: 'Discount', type: 'number', format: 'P0', align: 'end', width: 100 },
      { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
    ],
  },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
];

export default function StackedHeadersDemo() {
  const [log, push] = useEventLog();
  return (
    <>
      <DataGrid<Order>
        aria-label="Orders with stacked headers"
        data={orders}
        columns={columns}
        sorting
        filtering
        resizable
        reorderable
        toolbar={['columnChooser']}
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        onColumnReorder={(event) => push(`reorder (${event.source}): ${event.field} ${event.fromIndex} → ${event.toIndex}`)}
        onBeforeColumnReorder={(event) => push(`before reorder: ${event.field} → ${event.toIndex}`)}
        onColumnResizeEnd={(event) => push(`resize (${event.source}): ${event.field} → ${Math.round(event.width)}`)}
        onSortChange={(event) => push(`sort (${event.source}): ${event.sortBy.map((s) => `${s.field} ${s.direction}`).join(', ') || 'cleared'}`)}
        onColumnVisibilityChange={(event) => push(`visibility (${event.source}): hidden ${event.hidden.join(', ') || '-'}; shown ${event.shown.join(', ') || '-'}`)}
      />
      <EventLog entries={log} />
    </>
  );
}
