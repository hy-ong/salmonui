'use client';

import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(400);

const tone = { High: undefined, Normal: 'info', Low: 'success' } as const;

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  {
    field: 'customer',
    header: 'Customer',
    width: 170,
    // Cell template: receives row, value, formatted value, ids and index.
    renderCell: ({ row, rowIndex }) => (
      <span>
        <strong>{row.customer}</strong> <span aria-hidden="true">·</span> #{rowIndex + 1}
      </span>
    ),
  },
  {
    field: 'priority',
    header: 'Priority',
    width: 110,
    renderCell: ({ value }) => (
      <span className="demo-badge" data-tone={tone[value as Order['priority']]}>
        {String(value)}
      </span>
    ),
    // Header template: the sort, resize and reorder affordances stay.
    renderHeader: ({ column }) => (
      <span>
        {column.header} <span className="demo-badge" data-tone="info">tpl</span>
      </span>
    ),
  },
  {
    field: 'amount',
    header: 'Amount',
    type: 'number',
    format: 'C2',
    align: 'end',
    width: 120,
    // Per-cell attributes: a class and props computed from each cell's value.
    cellClassName: ({ value }) => ((value as number) > 900 ? 'demo-cell--negative' : undefined),
    cellProps: ({ formattedValue }) => ({ title: `Amount ${formattedValue}`, 'data-kind': 'amount' }),
    headerProps: { title: 'Order amount after discount' },
  },
  { field: 'city', header: 'City', width: 130 },
];

export default function CellTemplatesDemo() {
  return (
    <DataGrid<Order>
      aria-label="Orders with cell and header templates"
      data={orders}
      columns={columns}
      height={360}
      locale="en-US"
      currency="USD"
      timeZone="UTC"
      // Per-row and per-cell hooks run only for rendered rows and cells.
      getRowProps={(row) => (row.priority === 'High' ? { className: 'demo-row--flagged', 'data-priority': 'high' } : undefined)}
      getCellProps={(ctx) => (ctx.field === 'city' && ctx.row.country === 'Japan' ? { title: 'Ships from the Osaka warehouse' } : undefined)}
    />
  );
}
