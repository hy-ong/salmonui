'use client';

import { useState } from 'react';
import { DataGrid, type DataGridColumn, type DataGridTextWrap } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(5_000, 11);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer name as printed on the invoice', width: 140 },
  { field: 'note', header: 'Delivery note', width: 220 },
  { field: 'product', header: 'Product', width: 140 },
];

const modes: readonly DataGridTextWrap[] = ['both', 'content', 'header', false];
const MODE_OPTIONS = modes.map((mode) => ({ value: String(mode), label: mode === false ? 'off' : mode }));

export default function VariableRowHeightDemo() {
  const [wrap, setWrap] = useState<DataGridTextWrap>('both');
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Text wrap
          <Select aria-label="Text wrap" data={MODE_OPTIONS} value={String(wrap)} onValueChange={(value) => setWrap(modes.find((m) => String(m) === value) ?? false)} />
        </label>
      </div>
      {/* estimatedRowHeight switches to measured row heights; the key remounts on mode change. */}
      <DataGrid<Order>
        key={String(wrap)}
        aria-label="Orders with wrapped, variable-height rows"
        data={orders}
        columns={columns}
        height={380}
        estimatedRowHeight={36}
        textWrap={wrap}
        // The header row keeps a fixed height: give wrapped headers room for three lines.
        {...(wrap === 'header' || wrap === 'both' ? { headerHeight: 68 } : {})}
        locale="en-US"
        timeZone="UTC"
      />
    </>
  );
}
