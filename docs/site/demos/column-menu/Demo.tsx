'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridColumn, type DataGridColumnMenuItemId, type DataGridFiltering, type DataGridMenuItem } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(2_000, 11);

const columns: DataGridColumn<Order>[] = [
  // `menu: false` opts this header out of the column menu.
  { field: 'id', header: 'Order', primaryKey: true, width: 110, menu: false },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 140 },
  { field: 'category', header: 'Category', width: 140 },
  { field: 'priority', header: 'Priority', width: 130 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 130 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
];

const filtering: DataGridFiltering = { ui: 'menu' };

export default function ColumnMenuDemo() {
  const [customItems, setCustomItems] = useState(true);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [log, push] = useEventLog();
  // Built-in ids in a custom order, plus custom items: a checkbox item and a submenu.
  const columnMenu: readonly (DataGridColumnMenuItemId | DataGridMenuItem)[] = [
    'sortAscending',
    'sortDescending',
    'clearSort',
    { id: 'separator-1', separator: true },
    'filter',
    'group',
    'ungroup',
    { id: 'separator-2', separator: true },
    'autoSize',
    'autoSizeAll',
    'pinStart',
    'pinEnd',
    'unpin',
    'columnChooser',
    { id: 'separator-3', separator: true },
    { id: 'highlight', label: 'Highlight column', checked: false },
    {
      id: 'more',
      label: 'More',
      items: [
        { id: 'logField', label: 'Log the column id' },
        { id: 'docs', label: 'Columns guide', href: '/docs/data-grid/columns' },
      ],
    },
  ];
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={customItems} onCheckedChange={(checked) => setCustomItems(checked)}>
          Custom item list (off: the default menu)
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Orders with a column menu"
        data={orders}
        columns={columns}
        getCellProps={(ctx) => (ctx.field === highlighted ? { className: 'demo-cell--highlight' } : undefined)}
        columnMenu={customItems ? columnMenu : true}
        sorting
        filtering={filtering}
        grouping
        resizable
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        onBeforeColumnMenuOpen={(event) => {
          // Per-column items: the Amount column cannot be grouped, and the checkbox item reflects state.
          // The event object is read-only (frozen in development); its items array is the mutable copy.
          const items = event.items;
          if (event.field === 'amount') for (let i = items.length - 1; i >= 0; i--) if (items[i]?.id === 'group' || items[i]?.id === 'ungroup') items.splice(i, 1);
          items.forEach((item, i) => {
            if (item.id === 'highlight') items[i] = { ...item, checked: highlighted === event.field };
          });
          push(`menu open (${event.source}): ${event.field}, ${event.items.filter((item) => !item.separator).length} items`);
        }}
        onColumnMenuItemClick={(event) => {
          push(`menu click (${event.source}): ${event.item.id} on ${event.field}`);
          if (event.item.id === 'highlight') setHighlighted((current) => (current === event.field ? null : event.field));
          if (event.item.id === 'logField') push(`column id: ${event.column.id}`);
        }}
      />
      <EventLog entries={log} />
    </>
  );
}
