'use client';

import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

// 20,000 rows: the row template stays virtualized.
const orders = createOrders(20_000, 7);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 160 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'shipped', header: 'Shipped', width: 100 },
];

export default function RowTemplateDemo() {
  return (
    <DataGrid<Order>
      aria-label="Orders rendered through a row template"
      data={orders}
      columns={columns}
      height={360}
      locale="en-US"
      currency="USD"
      timeZone="UTC"
      // The template keeps the row element's role, aria-rowindex and ids by
      // spreading rowProps, and places the default cells inside it.
      renderRow={({ row, rowProps, cells }) => (
        <div {...rowProps} className={`${rowProps.className} demo-card-row`} data-shipped={row.shipped ? '' : undefined}>
          {cells}
        </div>
      )}
      rowClassName={(row) => (row.shipped ? undefined : 'demo-row--flagged')}
    />
  );
}
