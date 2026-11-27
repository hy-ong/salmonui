'use client';

import { useCallback, useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import {
  DataGrid,
  type DataGridApi,
  type DataGridColumn,
  type DataGridContextMenuItemId,
  type DataGridContextMenuTarget,
  type DataGridMenuItem,
  type DataGridPaging,
  type DataGridSelection,
} from '@salmonui/data-grid';
import type { RowId } from '@salmonui/core/data';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(5_000, 29);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110, pinned: 'start' },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'priority', header: 'Priority', width: 100 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
];

const paging: DataGridPaging = { pageSize: 500 };
const selection: DataGridSelection = { multiple: true };

// One list for every target: items that do not apply to the target are dropped
// (sort items on cells, page items off the pager, ...).
const customMenu: readonly (DataGridContextMenuItemId | DataGridMenuItem)[] = [
  'sortAscending',
  'sortDescending',
  'pinStart',
  'unpin',
  { id: 'separator-1', separator: true },
  'copy',
  'exportCsv',
  'exportPdf',
  { id: 'separator-2', separator: true },
  { id: 'flag', label: 'Flag or unflag rows', icon: '⚑' },
  {
    id: 'more',
    label: 'More',
    items: [
      { id: 'logTarget', label: 'Log the target' },
      { id: 'logRows', label: 'Log the customers' },
    ],
  },
  'firstPage',
  'previousPage',
  'nextPage',
  'lastPage',
];

function describeTarget(target: DataGridContextMenuTarget): string {
  switch (target.kind) {
    case 'header':
      return `header ${target.field}`;
    case 'cell':
      return `cell ${String(target.rowId)} / ${target.field}`;
    case 'row':
    case 'groupCaption':
      return `${target.kind} ${String(target.rowId)}`;
    case 'pager':
      return 'pager';
  }
}

export default function ContextMenuDemo() {
  const [useCustom, setUseCustom] = useState(true);
  const [blockHeader, setBlockHeader] = useState(false);
  const [flagged, setFlagged] = useState<ReadonlySet<RowId>>(() => new Set());
  const [log, push] = useEventLog();
  // A stable identity per flag set: an inline function would re-render every cell on each log entry.
  const rowClassName = useCallback((row: Order) => (flagged.has(row.id) ? 'demo-row--flagged' : undefined), [flagged]);
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={useCustom} onCheckedChange={(checked) => setUseCustom(checked)}>
          Custom item list (off: the default menu per target)
        </Checkbox>
        <Checkbox checked={blockHeader} onCheckedChange={(checked) => setBlockHeader(checked)}>
          Cancel the menu on headers
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Orders with a context menu"
        data={orders}
        columns={columns}
        contextMenu={useCustom ? customMenu : true}
        sorting
        paging={paging}
        selection={selection}
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        rowClassName={rowClassName}
        onReady={(api: DataGridApi<Order>) => {
          // Export items are disabled with a reason until a handler serves the command.
          api.registerCommandHandler('export.csv', () => {
            push('export.csv handler ran');
            return true;
          });
        }}
        onBeforeContextMenuOpen={(event) => {
          if (blockHeader && event.target.kind === 'header') {
            event.preventDefault();
            push(`menu canceled on ${describeTarget(event.target)}`);
            return;
          }
          // Per-target items: page items only on the pager, row items only on rows and cells.
          const onRows = event.target.kind === 'cell' || event.target.kind === 'row';
          const pageItems = new Set(['firstPage', 'previousPage', 'nextPage', 'lastPage']);
          // The event object is frozen in development: edit its items array in place, never reassign it.
          const items = event.items;
          for (let i = items.length - 1; i >= 0; i--) {
            const id = items[i]?.id ?? '';
            if (pageItems.has(id) ? event.target.kind !== 'pager' : (id === 'flag' || id === 'more') && !onRows) items.splice(i, 1);
          }
          push(`menu open (${event.source}): ${describeTarget(event.target)}, ${event.items.filter((item) => !item.separator).length} items`);
        }}
        onContextMenuItemClick={(event) => {
          push(`click (${event.source}): ${event.item.id} on ${describeTarget(event.target)}, ${event.rowIds.length} row(s)`);
          if (event.item.id === 'flag') {
            const next = new Set(flagged);
            for (const id of event.rowIds) {
              if (next.has(id)) next.delete(id);
              else next.add(id);
            }
            setFlagged(next);
          }
          if (event.item.id === 'logRows') push(`customers: ${event.rows().map((row) => row.customer).join(', ') || '-'}`);
        }}
      />
      <EventLog entries={log} />
    </>
  );
}
