'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(5_000, 71);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

export default function DataGridApiDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.focusCell('ORD-12500', 'customer')}>
          Focus ORD-12500 / Customer
        </Button>
        <Button variant="outline" onClick={() => api.current?.scrollToRow('ORD-14999', { align: 'end' })}>
          Scroll to the last order
        </Button>
        <Button variant="outline" onClick={() => api.current?.scrollTo({ top: 36 * 100 })}>
          Scroll to offset 3,600 px
        </Button>
        <Button variant="outline" onClick={() => push(`view rows: ${api.current?.getViewRows().length ?? 0}; primary key fields: ${JSON.stringify(api.current?.getPrimaryKeyFields() ?? null)}; source mode: ${api.current?.getDataSource().mode ?? '-'}`)}>
          Read view, key and data source
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const cell = api.current?.getCell('ORD-10003', 'amount');
            push(`getCell(ORD-10003, amount): ${cell ? JSON.stringify({ value: cell.value, formatted: cell.formattedValue }) : 'undefined'}`);
          }}
        >
          Read a cell
        </Button>
        <Button variant="outline" onClick={() => push(`focused: ${JSON.stringify(api.current?.getFocusedCell() ?? null)}`)}>
          Read focused cell
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders driven through the grid API"
        data={orders}
        columns={columns}
        height={320}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        // Custom keyboard handling: Mod+Shift+K is rebound to select-all; the `g` key logs the row under focus.
        keyBindings={{ 'selection.selectAll': ['Mod+Shift+K'] }}
        onKeyDown={(ctx) => {
          if (ctx.nativeEvent.key === 'g' && ctx.rowId !== null) {
            ctx.preventDefault();
            const info = api.current?.getRowInfo(ctx.rowId);
            push(`key g on ${ctx.rowId}: view index ${info?.rowIndex ?? '?'}, ${info?.row?.customer ?? ""}`);
          }
        }}
      />
      <EventLog entries={log} />
    </>
  );
}
