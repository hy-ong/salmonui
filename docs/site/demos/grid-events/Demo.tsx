'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridColumn, type DataGridContextMenuItemId, type DataGridMenuItem } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(1_000, 61);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  // headerProps: attributes and classes on the header cell.
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120, headerProps: { title: 'Order total in US dollars', 'data-unit': 'usd' } },
];

// A custom item, so the context menu has an action that applies to every row.
const contextMenu: readonly (DataGridContextMenuItemId | DataGridMenuItem)[] = [{ id: 'logRow', label: 'Log this row' }, 'copy'];

export default function DataGridEventsDemo() {
  const [log, push] = useEventLog(40);
  const [mounted, setMounted] = useState(true);
  const [cancelSort, setCancelSort] = useState(false);
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => setMounted((m) => !m)}>
          {mounted ? 'Unmount the grid' : 'Mount the grid'}
        </Button>
        <Checkbox checked={cancelSort} onCheckedChange={(checked) => setCancelSort(checked)}>
          Cancel sorting in onBeforeSortChange
        </Checkbox>
      </div>
      {mounted ? (
        <DataGrid<Order>
          aria-label="Orders with every interaction logged"
          data={orders}
          columns={columns}
          sorting
          resizable
          reorderable
          columnMenu
          contextMenu={contextMenu}
          selection={{ multiple: true }}
          height={300}
          locale="en-US"
          currency="USD"
          timeZone="UTC"
          onReady={(api) => push(`onReady: ${api.getViewRows().length} view rows`)}
          onBeforeSortChange={(e) => {
            if (cancelSort) e.preventDefault();
            push(`onBeforeSortChange: ${e.field ?? '-'}${cancelSort ? ' (prevented)' : ''}`);
          }}
          onSortChange={(e) => push(`onSortChange: ${e.sortBy.map((s) => `${s.field} ${s.direction}`).join(', ') || 'none'}`)}
          onSelectionChange={(e) => push(`onSelectionChange: +${e.added.length} −${e.removed.length} (${e.source})`)}
          onColumnResizeStart={(e) => push(`onColumnResizeStart: ${e.field}`)}
          onColumnResizeEnd={(e) => push(`onColumnResizeEnd: ${e.field} ${Math.round(e.previousWidth)} → ${Math.round(e.width)}`)}
          onColumnDragStart={(e) => push(`onColumnDragStart: ${e.field}`)}
          onColumnDrop={(e) => push(`onColumnDrop: ${e.field} ${e.fromIndex} → ${e.toIndex}`)}
          onColumnReorder={(e) => push(`onColumnReorder: ${e.field}`)}
          onBeforeColumnMenuOpen={(e) => push(`onBeforeColumnMenuOpen: ${e.field}, ${e.items.length} items`)}
          onColumnMenuItemClick={(e) => push(`onColumnMenuItemClick: ${e.item.id}`)}
          onBeforeContextMenuOpen={(e) => push(`onBeforeContextMenuOpen: ${e.target.kind}${'rowId' in e.target ? ` ${e.target.rowId}` : ''}`)}
          onContextMenuItemClick={(e) => push(`onContextMenuItemClick: ${e.item.id} on ${e.rowIds.join(', ') || '-'}`)}
        />
      ) : (
        <p className="demo-status">The grid is unmounted: its data source, listeners and timers are gone. Mount it again to see onReady.</p>
      )}
      <EventLog entries={log} />
    </>
  );
}
