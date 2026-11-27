'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, defineChildGrid, type DataGridApi, type DataGridColumn, type DataGridExportWriters } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

type Mode = 'expanded' | 'all' | 'none';
const MODES: readonly Mode[] = ['expanded', 'all', 'none'];

const writers: DataGridExportWriters = { excel: () => import('@salmonui/export/xlsx') };

// Hierarchy grid: customers -> orders.
interface Customer {
  readonly customer: string;
  readonly country: string;
}
const orders = createOrders(60, 41);
const customers: Customer[] = [...new Map(orders.map((o) => [o.customer, { customer: o.customer, country: o.country }])).values()];
const customerColumns: DataGridColumn<Customer>[] = [
  { field: 'customer', header: 'Customer', primaryKey: true, width: 200 },
  { field: 'country', header: 'Country', width: 140 },
];
const childGrid = defineChildGrid<Order, Customer>({
  data: orders,
  joinField: 'customer',
  columns: [
    { field: 'id', header: 'Order', primaryKey: true, width: 110 },
    { field: 'product', header: 'Product', width: 150 },
    { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  ],
});

// Detail template grid: the `detail` export hook writes the template as text.
const detailOrders = orders.slice(0, 8);
const orderColumns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 160 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];
const detailText = (order: Order) => [`${order.product} × ${order.quantity} to ${order.city}, ${order.country}`, order.note ? `Note: ${order.note}` : 'No note'];

export default function HierarchyOutputDemo() {
  const parents = useRef<DataGridApi<Customer> | null>(null);
  const details = useRef<DataGridApi<Order> | null>(null);
  const [log, push] = useEventLog();
  const report = (label: string, hierarchy: Mode, file: { data: Uint8Array } | null | undefined) =>
    push(`${label} Excel (${hierarchy}): ${file ? `${file.data.byteLength} bytes` : 'cancelled'}`);
  const exportCustomers = async (hierarchy: Mode) => report('customers', hierarchy, await parents.current?.exportToExcel({ download: false, hierarchy }));
  const exportOrders = async (hierarchy: Mode) =>
    report('orders', hierarchy, await details.current?.exportToExcel({ download: false, hierarchy, detail: ({ row }) => ({ text: detailText(row) }) }));
  return (
    <>
      <p className="demo-status">Hierarchy grid: the first customer is expanded.</p>
      <div className="demo-toolbar" aria-label="Hierarchy grid output">
        {MODES.map((mode) => (
          <Button key={`p-${mode}`} variant="outline" onClick={() => void parents.current?.print({ hierarchy: mode })}>
            Print customers ({mode})
          </Button>
        ))}
        {MODES.map((mode) => (
          <Button key={`x-${mode}`} variant="outline" onClick={() => void exportCustomers(mode)}>
            Excel customers ({mode})
          </Button>
        ))}
      </div>
      <DataGrid<Customer>
        aria-label="Customers with order child grids"
        data={customers}
        columns={customerColumns}
        childGrid={childGrid}
        defaultExpandedDetails={[customers[0]?.customer ?? '']}
        exportWriters={writers}
        height={300}
        locale="en-US"
        currency="USD"
        ref={parents}
        onAfterPrint={(e) => push(`printed customers (${e.hierarchy})`)}
      />
      <p className="demo-status">Detail template: the first two orders are expanded. The same detail hook writes the template text in print and export; expanded mode keeps the expanded orders only.</p>
      <div className="demo-toolbar" aria-label="Detail template output">
        {MODES.map((mode) => (
          <Button key={`dp-${mode}`} variant="outline" onClick={() => void details.current?.print({ hierarchy: mode, detail: ({ row }) => ({ text: detailText(row) }) })}>
            Print orders ({mode})
          </Button>
        ))}
        {MODES.map((mode) => (
          <Button key={`dx-${mode}`} variant="outline" onClick={() => void exportOrders(mode)}>
            Excel orders ({mode})
          </Button>
        ))}
      </div>
      <DataGrid<Order>
        aria-label="Orders with detail rows"
        data={detailOrders}
        columns={orderColumns}
        renderDetail={({ row }) => (
          <div className="demo-detail">
            {detailText(row).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        detailHeight={70}
        defaultExpandedDetails={[detailOrders[0]?.id ?? '', detailOrders[1]?.id ?? '']}
        exportWriters={writers}
        height={300}
        locale="en-US"
        currency="USD"
        ref={details}
        onAfterPrint={(e) => push(`printed orders (${e.hierarchy})`)}
      />
      <EventLog entries={log} />
    </>
  );
}
