'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridGrouping, type DataGridToolbarContext, type DataGridToolbarItem, type DataGridToolbarItemId } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(1_000, 3);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'priority', header: 'Priority', width: 100 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'note', header: 'Note', width: 220 },
];

const grouping: DataGridGrouping<Order> = { groupBy: ['country'], showDropArea: false, showGroupedColumns: true };

const narrowFrame = { maxWidth: 460 } as const;

// `renderToolbar` wraps the default toolbar with a heading.
function renderFramedToolbar({ defaultToolbar, items }: DataGridToolbarContext<Order>) {
  return (
    <div className="demo-toolbar-frame">
      <strong>Orders ({items.length} tools)</strong>
      {defaultToolbar}
    </div>
  );
}

export default function ToolbarDemo() {
  const [frozen, setFrozen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [custom, setCustom] = useState(false);
  const [cancelPrint, setCancelPrint] = useState(true);
  const [editItems, setEditItems] = useState(false);
  const [log, push] = useEventLog();
  // Built-in ids, built-ins with overrides, and custom items. `disabled` is reactive.
  const toolbar: readonly (DataGridToolbarItemId | DataGridToolbarItem)[] = [
    // Edit items follow the edit state: select a row for Edit / Delete; while a row edits only Update / Cancel.
    ...(editItems ? (['add', 'edit', 'delete', 'save', 'cancel'] as const) : []),
    'expandAll',
    'collapseAll',
    { id: 'columnChooser', label: 'Columns', title: 'Show or hide columns' },
    'exportCsv',
    'exportExcel',
    'print',
    { id: 'refresh', label: 'Refresh', title: 'Reload the orders', disabled: frozen },
    { id: 'status', label: frozen ? 'Status: Frozen' : 'Status: Live', align: 'center', render: ({ disabled }) => <span className="demo-badge" data-tone={disabled ? undefined : 'success'}>{frozen ? 'Frozen' : 'Live'}</span>, disabled: frozen },
    'search',
  ];
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={frozen} onCheckedChange={(checked) => setFrozen(checked)}>
          Disable Refresh
        </Checkbox>
        <Checkbox checked={narrow} onCheckedChange={(checked) => setNarrow(checked)}>
          Narrow grid (overflow menu)
        </Checkbox>
        <Checkbox checked={custom} onCheckedChange={(checked) => setCustom(checked)}>
          Wrap with renderToolbar
        </Checkbox>
        <Checkbox checked={cancelPrint} onCheckedChange={(checked) => setCancelPrint(checked)}>
          Cancel the Print built-in
        </Checkbox>
        <Checkbox checked={editItems} onCheckedChange={(checked) => setEditItems(checked)}>
          Edit items (follow the edit state)
        </Checkbox>
      </div>
      {/* The toolbar renders beside the grid element, so the demo narrows their container. */}
      <div style={narrow ? narrowFrame : undefined}>
        <DataGrid<Order>
          // renderToolbar changes apply one render late (the toolbar reads synced props), so the demo remounts.
          key={`${custom ? 'framed' : 'plain'}-${editItems ? 'edit' : 'view'}`}
          aria-label="Orders with a toolbar"
          data={orders}
          columns={columns}
          toolbar={toolbar}
          search
          grouping={grouping}
          {...(editItems ? { editing: { mode: 'row' as const } } : {})}
          height={380}
          locale="en-US"
          currency="USD"
          timeZone="UTC"
          {...(custom ? { renderToolbar: renderFramedToolbar } : {})}
          onReady={(api: DataGridApi<Order>) => {
            // Export items stay disabled until a handler serves the command.
            api.registerCommandHandler('export.csv', () => {
              push('export.csv handler ran (an app would call exportCsv here)');
              return true;
            });
            api.registerCommandHandler('grid.print', () => {
              push('grid.print handler ran');
              return true;
            });
          }}
          onToolbarItemClick={(event) => {
            if (event.item.id === 'print' && cancelPrint) event.preventDefault();
            push(`toolbar (${event.source}): ${event.item.id}${event.defaultPrevented ? ' (built-in skipped)' : ''}`);
          }}
          onSearchChange={(event) => push(`search: "${event.text}"`)}
        />
      </div>
      <EventLog entries={log} />
    </>
  );
}
