'use client';

import { useState } from 'react';
import { createLiveDataSource } from '@salmonui/data';
import { createLocalDataSource } from '@salmonui/data-grid/engine';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { createOrders, seeded, type Order } from '../../lib/fixtures';

const initial = createOrders(500, 61);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 100 },
];

export default function LiveDataDemo() {
  const [running, setRunning] = useState(true);
  // Read by the stream callback, written by the button handler; never read during render.
  const [control] = useState(() => ({ running: true }));
  const [source] = useState(() =>
    createLiveDataSource<Order>({
      initial: createLocalDataSource(initial),
      getRowId: (row) => row.id,
      // The stream opens in the browser only; the server renders the snapshot.
      connect: (_query, emit) => {
        if (typeof window === 'undefined') return;
        const next = seeded(99);
        const timer = window.setInterval(() => {
          if (document.hidden || !control.running) return;
          const upsert: Order[] = [];
          for (let i = 0; i < 5; i++) {
            const base = initial[next() % 40] as Order;
            const quantity = 1 + (next() % 12);
            upsert.push({ ...base, quantity, amount: Math.round(quantity * base.unitPrice * 100) / 100, shipped: next() % 2 === 0 });
          }
          emit.patch({ upsert });
        }, 800);
        return () => window.clearInterval(timer);
      },
    }),
  );
  return (
    <>
      <div className="demo-toolbar">
        <Button
          variant="outline"
          aria-pressed={running}
          onClick={() => {
            control.running = !running;
            setRunning(!running);
          }}
        >
          {running ? 'Pause stream' : 'Resume stream'}
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders updated by a live stream"
        data={source}
        columns={columns}
        sorting
        height={340}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
      />
      <p className="demo-status">The first 40 orders receive patches every 0.8 s; sort by Amount to see rows move.</p>
    </>
  );
}
