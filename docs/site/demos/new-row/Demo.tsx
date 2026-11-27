'use client';

import { useState } from 'react';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

// The always-visible add row: row
// mode only. Type into it and press Enter to save; a fresh blank row
// follows. Escape clears it; it is disabled while another row edits.
const orders = createOrders(2_000, 5);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 120 },
  { field: 'customer', header: 'Customer', width: 170, validation: { required: true } },
  { field: 'country', header: 'Country', width: 130 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 90, defaultValue: 1, validation: { min: 1 } },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, width: 100 },
];

const ADD_ROW_POSITION_OPTIONS = [
  { value: 'top', label: 'top' },
  { value: 'bottom', label: 'bottom' },
];

export default function NewRowDemo() {
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Add row position
          <Select aria-label="Add row position" data={ADD_ROW_POSITION_OPTIONS} value={position} onValueChange={(value) => value != null && setPosition(value as 'top' | 'bottom')} />
        </label>
      </div>
      <DataGrid<Order>
        aria-label="Orders with an always-visible add row"
        data={orders}
        columns={columns}
        height={360}
        locale="en-US"
        editing={{ showNewRow: true, newRowPosition: position }}
        onSave={(e) => push(`saved: ${e.added.length} added, ${e.changed.length} changed`)}
        onEditCancel={() => push('cancelled')}
      />
      <p className="demo-status">Type an order id and a customer in the add row, press Enter: the order is saved and a fresh add row takes focus. Double click another row: the add row is disabled until that edit ends.</p>
      <EventLog entries={log} />
    </>
  );
}
