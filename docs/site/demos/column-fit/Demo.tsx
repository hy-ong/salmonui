'use client';

import { useMemo, useState } from 'react';
import { Select } from '@salmonui/dropdowns/select';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(200);
const modeItems = [
  { value: 'auto', label: 'auto' },
  { value: 'normal', label: 'normal' },
];
const currencyItems = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
];

export default function ColumnFitDemo() {
  const [mode, setMode] = useState<'normal' | 'auto'>('auto');
  const [currency, setCurrency] = useState<'USD' | 'EUR'>('USD');
  const [log, push] = useEventLog();
  // headerValueGetter computes the header text from the compiled column.
  // The definitions change with the currency, so the columns recompile and the headers follow.
  const columns = useMemo<DataGridColumn<Order>[]>(
    () => [
      { field: 'id', header: 'Order', primaryKey: true, width: 110 },
      { field: 'customer', header: 'Customer', width: 150, minWidth: 100 },
      { field: 'country', header: 'Country', width: 110, maxWidth: 160 },
      { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 130, headerValueGetter: (c) => `${c.headerText} (${c.type})` },
      { field: 'unitPrice', type: 'number', format: 'C2', align: 'end', width: 150, headerValueGetter: () => `Unit price (${currency})` },
      { field: 'amount', type: 'number', format: 'C2', align: 'end', width: 140, headerValueGetter: () => `Amount (${currency})` },
    ],
    [currency],
  );
  return (
    <>
      <div className="demo-toolbar">
        <label>
          resizeMode{' '}
          <Select aria-label="resizeMode" data-demo="resize-mode" data={modeItems} value={mode} onValueChange={(value) => value != null && setMode(value as 'normal' | 'auto')} />
        </label>
        <label>
          Currency{' '}
          <Select aria-label="Currency" data-demo="currency" data={currencyItems} value={currency} onValueChange={(value) => value != null && setCurrency(value as 'USD' | 'EUR')} />
        </label>
      </div>
      <DataGrid<Order>
        aria-label="Orders with fitted columns and computed headers"
        data={orders}
        columns={columns}
        resizable
        resizeMode={mode}
        columnChooser
        height={320}
        locale="en-US"
        currency={currency}
        timeZone="UTC"
        onColumnResizeEnd={(event) => push(`resize (${mode}): ${event.field} ${Math.round(event.previousWidth)} → ${Math.round(event.width)}`)}
      />
      <EventLog entries={log} />
    </>
  );
}
