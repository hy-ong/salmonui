'use client';

import { useEffect } from 'react';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { ThemeProvider } from '@salmonui/core/theme';
import { theme } from './theme';

declare global {
  interface Window {
    __hydrated?: boolean;
  }
}

interface Order {
  readonly id: string;
  readonly customer: string;
  readonly amount: number;
  readonly placed: Date;
  readonly paid: boolean;
}

// Deterministic data: identical on the server and the client.
function createOrders(count: number): Order[] {
  let state = 7;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const names = ['Aiko', 'Bao', 'Chen', 'Dewi', 'Elif', 'Farah', 'Goran', 'Hana', 'Ines', 'Jun'];
  const out: Order[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `o${i}`,
      customer: `${names[next() % names.length]} ${i}`,
      amount: (next() % 1_000_000) / 100,
      placed: new Date(Date.UTC(2025, next() % 12, 1 + (next() % 28))),
      paid: ((next() >>> 16) & 1) === 1,
    });
  }
  return out;
}

const orders = createOrders(10_000);

// Initially selected rows; a stable value (a new array would re-apply the selection).
const selection = { rowIds: ['o1', 'o4'] };

const columns: DataGridColumn<Order>[] = [
  // The selection checkbox column with header select-all.
  { type: 'selection' },
  { field: 'id', header: 'Order', primaryKey: true, width: 100, pinned: 'start' },
  { field: 'customer', header: 'Customer', width: 180 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 140 },
  { field: 'placed', header: 'Placed', type: 'date', format: 'yMMMd', width: 160 },
  { field: 'paid', header: 'Paid', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 90 },
  {
    id: 'status',
    header: 'Status',
    width: 120,
    valueGetter: (o) => (o.paid ? 'Paid' : 'Open'),
    renderCell: ({ value }) => <span className={value === 'Paid' ? 'badge badge--paid' : 'badge'}>{String(value)}</span>,
  },
];

export function OrdersGrid() {
  useEffect(() => {
    window.__hydrated = true;
  }, []);
  return (
    <ThemeProvider theme={theme} className="app">
      <h1 id="orders-title">Orders (Next.js App Router)</h1>
      <DataGrid<Order>
        aria-labelledby="orders-title"
        data={orders}
        columns={columns}
        height={480}
        timeZone="UTC"
        locale="en-US"
        selection={selection}
      />
    </ThemeProvider>
  );
}
