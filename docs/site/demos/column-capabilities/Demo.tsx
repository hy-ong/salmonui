'use client';

import { DataGrid, type DataGridColumn, type DataGridFiltering } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(400, 3);

// Per-column capability flags refine the grid-wide features turned on below.
const columns: DataGridColumn<Order>[] = [
  // fixed at the start, not reorderable, and nothing can move before it.
  // a server-generated key: `identity` defaults `editable` to false.
  { field: 'id', header: 'Order', primaryKey: true, identity: true, lockPosition: true, width: 110 },
  { field: 'customer', header: 'Customer (not sortable, not searchable)', sortable: false, searchable: false, width: 230 },
  { field: 'country', header: 'Country (not filterable)', filterable: false, width: 190 },
  { field: 'category', header: 'Category (not groupable)', groupable: false, width: 190 },
  { field: 'product', header: 'Product (read-only)', editable: false, width: 170 },
  { field: 'amount', header: 'Amount (fixed size and place)', type: 'number', format: 'C2', align: 'end', resizable: false, reorderable: false, width: 220 },
  { field: 'city', header: 'City', width: 120 },
];

const filtering: DataGridFiltering = { ui: 'row' };

export default function ColumnCapabilitiesDemo() {
  const [log, push] = useEventLog();
  return (
    <>
      <DataGrid<Order>
        aria-label="Orders with per-column capability flags"
        data={orders}
        columns={columns}
        sorting
        filtering={filtering}
        search
        grouping
        columnMenu
        editing
        resizable
        reorderable
        toolbar={['search']}
        // The headers name the capability each column turns off: wrap them instead of truncating.
        textWrap="header"
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        onColumnReorder={(event) => push(`reorder (${event.source}): ${event.field} ${event.fromIndex} → ${event.toIndex}`)}
        onEditStart={(event) => push(`edit ${event.rowId}`)}
      />
      <EventLog entries={log} />
    </>
  );
}
