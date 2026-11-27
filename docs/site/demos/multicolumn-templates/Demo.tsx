'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Combobox, type ComboboxColumn, type ComboboxSort } from '@salmonui/dropdowns/combobox';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createDemoListSource } from '../../lib/demo-list-source';

interface Product {
  readonly id: number;
  readonly name: string;
  readonly category: string;
  readonly price: number;
  readonly stock: number;
}

const CATEGORIES = ['Audio', 'Cameras', 'Laptops', 'Phones', 'Tablets', 'Wearables'];
const PRODUCTS: Product[] = Array.from({ length: 60 }, (_, i) => ({
  id: 1001 + i,
  name: `${CATEGORIES[i % CATEGORIES.length]} model ${String.fromCharCode(65 + (i % 26))}${i + 1}`,
  category: CATEGORIES[i % CATEGORIES.length] as string,
  price: 49 + ((i * 37) % 900),
  stock: (i * 13) % 40,
}));

const COLUMNS: ComboboxColumn<Product>[] = [
  { field: 'id', header: 'SKU', width: 70, align: 'end' },
  {
    field: 'name',
    header: 'Product',
    width: '40%',
    renderCell: ({ item, text }) => (
      <span>
        <strong>{text}</strong>
        <br />
        <small>{item.category}</small>
      </span>
    ),
  },
  { field: 'price', header: 'Price', align: 'end', format: { style: 'currency', currency: 'EUR' } },
  {
    field: 'stock',
    header: 'Stock',
    width: 80,
    align: 'end',
    renderHeader: ({ column }) => <abbr title="Units in the warehouse">{column.header}</abbr>,
    // Low-stock cells get a class and a style.
    cellProps: (item) => (item.stock < 5 ? { className: 'demo-low-stock', style: { color: 'var(--salmon-color-danger-text)', fontWeight: 600 } } : undefined),
  },
];

interface Order {
  readonly id: number;
  readonly customer: string;
  readonly city: string;
}
const CITIES = ['Lagos', 'Lima', 'Lyon', 'Oslo', 'Perth', 'Pune', 'Quito', 'Seoul'];
// 100,000 orders on the "server": the popup reads ranges of them as it scrolls.
const FIRST = ['Amara', 'Bruno', 'Carmen', 'Dawit', 'Emma', 'Felix', 'Grace', 'Hugo', 'Ines', 'Jonas', 'Keiko', 'Lena', 'Marco', 'Nadia', 'Omar', 'Pia', 'Rahul', 'Sofia', 'Tariq', 'Yara'];
const LAST = ['Adeyemi', 'Bauer', 'Castillo', 'Dahl', 'Evans', 'Fontaine', 'Gupta', 'Hoang', 'Ivanova', 'Jensen', 'Kowalski', 'Lindgren', 'Mendes', 'Nakamura', 'Olsen', 'Park', 'Quispe', 'Reyes', 'Silva', 'Tran', 'Vargas', 'Weber', 'Yilmaz'];
const ORDERS: Order[] = Array.from({ length: 100_000 }, (_, i) => ({ id: i + 1, customer: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`, city: CITIES[i % CITIES.length] as string }));
const ORDER_COLUMNS: ComboboxColumn<Order>[] = [
  { field: 'id', header: 'Order', width: 90, align: 'end' },
  { field: 'customer', header: 'Customer' },
  { field: 'city', header: 'City' },
];

const BY_PRICE: ComboboxSort = { sortBy: [{ columnId: 'price', direction: 'desc' }] };
const BY_NAME: ComboboxSort = { sortBy: [{ columnId: 'name', direction: 'asc' }] };

export default function MulticolumnTemplatesDemo() {
  const [log, push] = useEventLog();
  const [sorting, setSorting] = useState<ComboboxSort>(BY_PRICE);
  const [orders] = useState(() => createDemoListSource<Order>({ rows: ORDERS, latency: 300, log: push }));
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="mccb-tpl-product">Product</span>
        <Combobox<Product>
          aria-labelledby="mccb-tpl-product"
          data={PRODUCTS}
          columns={COLUMNS}
          getItemValue={(p) => p.id}
          getItemLabel={(p) => p.name}
          searchFields={['name', 'category']}
          searchOperator="contains"
          rowHeight={44}
          sorting={sorting}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="outline" aria-pressed={sorting === BY_PRICE} onClick={() => setSorting(BY_PRICE)}>
            Sort by price, highest first
          </Button>
          <Button variant="outline" aria-pressed={sorting === BY_NAME} onClick={() => setSorting(BY_NAME)}>
            Sort by name
          </Button>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        <span id="mccb-tpl-order">Order (100,000 on a remote source)</span>
        <Combobox<Order> aria-labelledby="mccb-tpl-order" data={orders} columns={ORDER_COLUMNS} getItemValue={(o) => o.id} getItemLabel={(o) => `#${o.id} ${o.customer}`} searchFields={['customer', 'city']} sorting={false} />
      </div>
      <EventLog entries={log} label="Order requests" />
    </div>
  );
}
