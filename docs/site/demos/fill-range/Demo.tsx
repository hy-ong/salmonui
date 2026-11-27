'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(5_000, 29);

// Order and Customer are pinned to the start and Note to the end: the fill
// handle drags across the pin edges like any other column edge.
const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110, editable: false, pinned: 'start' },
  { field: 'customer', header: 'Customer', width: 150, pinned: 'start' },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'note', header: 'Note', width: 220, pinned: 'end' },
];

// Cell editing commits each filled cell at once; the clipboard module (fill) loads with `fillHandle`.
const editing = { mode: 'cell', fillHandle: true, undo: true } as const;
const selection = { mode: 'cell', multiple: true, cellRange: 'box' } as const;

export default function FillRangeDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [status, setStatus] = useState('Select a cell or a range, then drag its fill handle or use the buttons.');
  // The target cell: the fill extends the selected range down to it.
  const fill = (rowId: string, field: string) => {
    const result = api.current?.fillSelection(rowId, field);
    if (result) setStatus(`fillSelection(${rowId}, ${field}): ${result.status}`);
  };
  return (
    <>
      <div className="demo-toolbar">
        <Button
          variant="outline"
          onClick={() => {
            api.current?.selectCellRange({ rowId: 'ORD-10000', field: 'customer' }, { rowId: 'ORD-10001', field: 'product' });
            setStatus('Selected Customer and Product of the first two orders.');
          }}
        >
          Select the first two rows
        </Button>
        <Button variant="outline" onClick={() => fill('ORD-10005', 'product')}>
          Fill down to row 6
        </Button>
        <Button variant="outline" onClick={() => fill('ORD-13999', 'product')}>
          Fill down to row 4,000
        </Button>
        <Button variant="outline" onClick={() => api.current?.scrollToRow('ORD-13999', { align: 'center' })}>
          Scroll to row 4,000
        </Button>
        <Button variant="outline" onClick={() => setStatus(`undo: ${api.current?.undo().status ?? 'n/a'}`)}>
          Undo
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with range fill"
        ref={api}
        data={orders}
        columns={columns}
        selection={selection}
        editing={editing}
        onBeforeFill={(e) => setStatus(`onBeforeFill: ${e.range.anchor.rowId}..${e.range.focus.rowId} extended to ${e.target.rowId} / ${e.target.field} (${e.source})`)}
        height={360}
        locale="en-US"
        timeZone="UTC"
      />
      <p className="demo-status" aria-live="polite">
        {status}
      </p>
    </>
  );
}
