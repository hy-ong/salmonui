'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(2_000, 23);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'priority', header: 'Priority', width: 100 },
];

export default function CellUpdatesDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Button
          variant="outline"
          onClick={() => {
            const current = api.current?.getRow('ORD-10002');
            const result = api.current?.setCellValue('ORD-10002', 'amount', Math.round(((current?.amount ?? 0) + 100) * 100) / 100);
            push(`setCellValue(ORD-10002, amount): ${result?.status}`);
          }}
        >
          Add 100 to ORD-10002 amount
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const current = api.current?.getRow('ORD-10003');
            if (!current) return;
            const result = api.current?.setRowData('ORD-10003', { ...current, customer: 'Updated customer', priority: 'High', quantity: 99 });
            push(`setRowData(ORD-10003): ${result?.status}`);
          }}
        >
          Replace ORD-10003
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders updated in place through the grid API"
        data={orders}
        columns={columns}
        height={320}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onViewChange={(e) => push(`onViewChange: ${e.reason}, ${e.rowCount} rows`)}
      />
      <EventLog entries={log} />
    </>
  );
}
