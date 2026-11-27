'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridSorting } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(5_000, 21);

/** Lower bound of the order's $250 amount band. */
function amountBand(order: Order): number {
  return Math.floor(order.amount / 250) * 250;
}

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110, groupable: false },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'city', header: 'City', width: 130 },
  { field: 'category', header: 'Category', width: 140 },
  { field: 'priority', header: 'Priority', width: 100 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
  // Group by the formatted value: one group per month.
  { id: 'month', field: 'placed', header: 'Month', type: 'datetime', format: 'yMMM', groupByFormat: true, width: 110 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  // Custom group key: bands of $250; groupByFormat formats the key with the column format.
  { id: 'band', field: 'amount', header: 'Amount band', type: 'number', format: 'C0', align: 'end', width: 120, groupKey: amountBand, groupByFormat: true },
];

const initialGroups: readonly string[] = ['country', 'category'];
// Group order follows the sort of the grouped field: Category groups descend.
const sorting: DataGridSorting = { sortBy: [{ field: 'category', direction: 'desc' }] };

export default function GroupingDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [groups, setGroups] = useState<readonly string[]>(initialGroups);
  const [showGrouped, setShowGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={showGrouped} onCheckedChange={(checked) => setShowGrouped(checked)}>
          Show grouped columns
        </Checkbox>
        <Checkbox checked={collapsed} onCheckedChange={(checked) => setCollapsed(checked)}>
          Start collapsed
        </Checkbox>
        <Checkbox checked={locked} onCheckedChange={(checked) => setLocked(checked)}>
          Cancel grouping changes
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.groupColumn('priority')}>
          Group by Priority
        </Button>
        <Button variant="outline" onClick={() => setGroups(['month'])}>
          Group by month (formatted value)
        </Button>
        <Button variant="outline" onClick={() => setGroups(['band'])}>
          Group by amount band (custom key)
        </Button>
        <Button variant="outline" onClick={() => api.current?.ungroupColumn('category')}>
          Ungroup Category
        </Button>
        <Button variant="outline" onClick={() => api.current?.clearGrouping()}>
          Clear grouping
        </Button>
        <Button variant="outline" onClick={() => api.current?.collapseAllGroups()}>
          Collapse all
        </Button>
        <Button variant="outline" onClick={() => api.current?.expandAllGroups()}>
          Expand all
        </Button>
        <Button variant="outline" onClick={() => api.current?.toggleGroup([{ columnId: 'country', key: 'Japan' }])}>
          Toggle “Japan”
        </Button>
      </div>
      <DataGrid<Order>
        key={String(collapsed)}
        aria-label="Grouped orders"
        data={orders}
        columns={columns}
        sorting={sorting}
        height={420}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        grouping={{
          groupBy: groups,
          showGroupedColumns: showGrouped,
          showHeaderToggle: true,
          reorderable: true,
          defaultExpanded: !collapsed,
          renderCaption: ({ header, formattedKey, count, expanded }) => (
            <span>
              {header}: <strong>{formattedKey}</strong> — {count} {count === 1 ? 'order' : 'orders'}
              {expanded ? '' : ' (collapsed)'}
            </span>
          ),
        }}
        onBeforeGroupChange={(event) => {
          if (locked) {
            push(`cancelled ${event.action} ${event.field ?? ''}`);
            event.preventDefault();
          }
        }}
        onGroupChange={(event) => {
          setGroups(event.groupBy);
          push(`${event.action} ${event.field ?? ''} (${event.source}) → [${event.groupBy.join(', ')}]`);
        }}
        onGroupToggle={(event) => push(`${event.expanded ? 'expand' : 'collapse'} ${event.path.map((p) => String(p.key)).join(' / ')}`)}
      />
      <p className="demo-status">
        Drag a header into the drop area to group; drag chips to reorder; click a chip to flip its direction. Keyboard: Ctrl+Space on a header
        groups it, Ctrl+Up / Ctrl+Down collapse or expand all, Alt+Arrow moves a focused chip.
      </p>
      <EventLog entries={log} />
    </>
  );
}
