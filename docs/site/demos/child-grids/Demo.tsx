'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, defineChildGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { createOrders, type Order } from '../../lib/fixtures';

interface Customer {
  readonly customer: string;
  readonly country: string;
  readonly orders: number;
}

interface Item {
  readonly itemId: string;
  readonly orderId: string;
  readonly product: string;
  readonly quantity: number;
}

const orders = createOrders(2_000, 11);
const customers: Customer[] = [...new Map(orders.map((o) => [o.customer, o])).values()].map((o) => ({
  customer: o.customer,
  country: o.country,
  orders: orders.filter((x) => x.customer === o.customer).length,
}));
const items: Item[] = orders.flatMap((o, i) => [0, 1, 2].slice(0, 1 + (i % 3)).map((k) => ({ itemId: `${o.id}-${k}`, orderId: o.id, product: o.product, quantity: 1 + ((i + k) % 5) })));

const columns: DataGridColumn<Customer>[] = [
  { field: 'customer', header: 'Customer', primaryKey: true, width: 200 },
  { field: 'country', header: 'Country', width: 140 },
  { field: 'orders', header: 'Orders', type: 'number', align: 'end', width: 100 },
];

// Customers -> orders (joined on `customer`) -> items (joined on `orderId` = order `id`).
const childGrid = defineChildGrid<Order, Customer>({
  data: orders,
  joinField: 'customer',
  sorting: true,
  columns: [
    { field: 'id', header: 'Order', primaryKey: true, width: 110 },
    { field: 'product', header: 'Product', width: 150 },
    { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
    { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
  ],
  childGrid: defineChildGrid<Item, Order>({
    data: items,
    parentField: 'id',
    childField: 'orderId',
    columns: [
      { field: 'itemId', header: 'Item', primaryKey: true, width: 130 },
      { field: 'product', header: 'Product', width: 150 },
      { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
    ],
  }),
});

const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'en-US' },
  { value: 'de-DE', label: 'de-DE' },
];

export default function ChildGridsDemo() {
  const api = useRef<DataGridApi<Customer> | null>(null);
  const [locale, setLocale] = useState('en-US');
  const [status, setStatus] = useState('');
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Locale
          <Select aria-label="Locale" data={LOCALE_OPTIONS} value={locale} onValueChange={(value) => value != null && setLocale(String(value))} />
        </label>
        <Button variant="outline" onClick={() => api.current?.expandDetail(customers[0]?.customer ?? '')}>
          Expand the first customer
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const file = await api.current?.exportToCsv({ download: false, hierarchy: 'expanded' });
            setStatus(file ? `CSV: ${file.data.split('\n').length - 1} lines (CSV has no child rows; Excel and PDF nest them)` : '');
          }}
        >
          Export CSV
        </Button>
      </div>
      <DataGrid<Customer>
        key={locale}
        aria-label="Customers with orders"
        data={customers}
        columns={columns}
        height={460}
        locale={locale}
        currency="USD"
        timeZone="UTC"
        ref={api}
        childGrid={childGrid}
      />
      <p className="demo-status">
        Child grids inherit the locale (switch it to see the amounts reformat) and mount only when their row renders. {status}
      </p>
    </>
  );
}
