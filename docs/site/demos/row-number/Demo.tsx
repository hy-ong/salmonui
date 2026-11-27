'use client';

import { DataGrid, type DataGridColumn, type DataGridGrouping, type DataGridPaging } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(2_000, 21);

const columns: DataGridColumn<Order>[] = [
  // The row number column: no field; numbers follow the visible order across pages and groups.
  { type: 'rowNumber', pinned: 'start' },
  { field: 'id', header: 'Order', primaryKey: true, width: 120, groupable: false },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'category', header: 'Category', width: 120 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

// Constants: options props are reactive.
const paging: DataGridPaging = { pageSize: 25 };
// Header group toggles; chips toggle the group order because sorting is on.
const grouping: DataGridGrouping<Order> = { showHeaderToggle: true };

export default function RowNumberDemo() {
  return (
    <>
      <DataGrid<Order>
        aria-label="Numbered orders"
        data={orders}
        columns={columns}
        sorting
        paging={paging}
        grouping={grouping}
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
      />
      <p className="demo-status">Sort, page, or group with the header group buttons: the numbers count data rows in view order, continue across pages and skip group captions.</p>
    </>
  );
}
