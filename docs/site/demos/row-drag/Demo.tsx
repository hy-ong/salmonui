'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridColumn, type DataGridRowDragEvent } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const backlog = createOrders(500, 3);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'priority', header: 'Priority', width: 100 },
];

export default function RowDragDemo() {
  const [log, push] = useEventLog();
  const [locked, setLocked] = useState(false);
  const record = (event: DataGridRowDragEvent<Order>) => {
    if (event.type === 'beforeRowDrop' && locked) {
      event.preventDefault();
      push('drop cancelled');
      return;
    }
    if (event.type === 'rowDrop') {
      const where = event.targetGridId ?? (event.target?.id || 'outside');
      push(`${event.rowIds.join(', ')} → ${where}${event.toIndex >= 0 ? ` at ${event.toIndex}` : ''} (${event.source})`);
    }
  };
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={locked} onCheckedChange={(checked) => setLocked(checked)}>
          Cancel drops
        </Checkbox>
      </div>
      <div className="demo-columns">
        <DataGrid<Order>
          id="row-drag-backlog"
          aria-label="Backlog"
          data={backlog}
          columns={columns}
          height={380}
          selection={{ multiple: true }}
          rowDrag={{ targetId: 'row-drag-sprint' }}
          onBeforeRowDrop={record}
          onRowDrop={record}
        />
        <DataGrid<Order> id="row-drag-sprint" aria-label="Sprint" data={[]} columns={columns} height={380} rowDrag onRowDrop={record} />
      </div>
      <p className="demo-status">
        Drag the grip to reorder, or into the Sprint grid; select several rows to drag them together. Alt+Shift+Up / Down moves the focused row.
      </p>
      <EventLog entries={log} />
    </>
  );
}
