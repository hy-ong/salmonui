'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridSortItem } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(10_000, 9);
const rank = { High: 0, Normal: 1, Low: 2 } as const;

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  // Custom comparator: High < Normal < Low instead of alphabetical.
  { field: 'priority', header: 'Priority (custom order)', width: 240, sortComparator: (a, b) => rank[a as Order['priority']] - rank[b as Order['priority']] },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'placed', header: 'Placed', type: 'datetime', format: 'yMMMd', width: 130 },
  { field: 'note', header: 'Note (not sortable)', width: 220, sortable: false },
];

// An initial two-column sort. The options prop is reactive and compared field by field, so
// toggling `multiple` does not re-apply `sortBy` over the user's sort.
const sortBy: readonly DataGridSortItem[] = [
  { field: 'priority', direction: 'asc' },
  { field: 'placed', direction: 'desc' },
];

export default function SortingDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [multiple, setMultiple] = useState(true);
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={multiple} onCheckedChange={(checked) => setMultiple(checked)}>
          Multi-column sort
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => api.current?.sortColumn('amount', 'desc')}>
          Sort Amount descending
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.sortColumn('country', 'asc', { multiple: true })}>
          Add Country ascending
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.removeSort('country')}>
          Remove Country sort
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.clearSorting()}>
          Clear sorting
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Sortable orders"
        data={orders}
        columns={columns}
        sorting={{ multiple, sortBy, indicators: 'always' }}
        columnMenu={['sortAscending', 'sortDescending', 'clearSort']}
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
      />
      <p className="demo-status">Click a header to cycle ascending, descending and unsorted; Ctrl/⌘+click adds a column to the sort while multi-column sort is on. On a touch screen, a header tap shows a Multi-sort toggle: while it is pressed, taps add columns. The column menu sorts too.</p>
    </>
  );
}
