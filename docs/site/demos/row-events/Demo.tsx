'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridColumn, type DataGridEditing } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(1_000, 67);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

// Inline row editing, so a double click has a built-in action (the edit start) to cancel.
const editing: DataGridEditing<Order> = { mode: 'row', add: false, delete: false };

export default function RowEventsDemo() {
  const [log, push] = useEventLog(40);
  const [prevent, setPrevent] = useState(false);
  const mark = prevent ? ' (prevented)' : '';
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={prevent} onCheckedChange={(checked) => setPrevent(checked)}>
          Call preventDefault() in onRowClick and onRowDoubleClick
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Orders with row and cell click events"
        data={orders}
        columns={columns}
        selection
        editing={editing}
        height={300}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        // The cell event fires first, then the row event; both only for data rows.
        onCellClick={(e) => push(`onCellClick: ${e.rowId} ${e.field} = ${String(e.value)}`)}
        onRowClick={(e) => {
          if (prevent) e.preventDefault();
          push(`onRowClick: ${e.rowId} row ${e.rowIndex} (${e.field ?? '-'})${mark}`);
        }}
        onCellDoubleClick={(e) => push(`onCellDoubleClick: ${e.rowId} ${e.field}`)}
        onRowDoubleClick={(e) => {
          if (prevent) e.preventDefault();
          push(`onRowDoubleClick: ${e.rowId} (${e.column?.header ?? '-'})${mark}`);
        }}
        // The built-in actions the click events can cancel.
        onSelectionChange={(e) => push(`onSelectionChange: +${e.added.length} −${e.removed.length}`)}
        onEditStart={(e) => push(`onEditStart: ${e.rowId}`)}
      />
      <EventLog entries={log} />
    </>
  );
}
