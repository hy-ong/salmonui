'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridFilter } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(800, 21);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 140 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'category', header: 'Category', width: 120 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'placed', header: 'Placed', type: 'date', format: 'yMMMd', width: 130 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 120 },
  // Hidden: offered by the builder only with `includeHidden`.
  { field: 'priority', header: 'Priority', width: 100, hidden: true },
];

// The rule is the nested `DataGridFilter` groups: (Country = Japan OR Country = Malaysia) AND Amount > 100.
const initial: readonly DataGridFilter[] = [
  { logic: 'or', filters: [{ field: 'country', operator: 'equal', value: 'Japan' }, { field: 'country', operator: 'equal', value: 'Malaysia' }] },
  { field: 'amount', operator: 'greaterThan', value: 100 },
];

/** Compact text of a filter tree for the log. */
function describe(filters: readonly DataGridFilter[]): string {
  const one = (f: DataGridFilter): string =>
    'filters' in f ? `(${f.filters.map(one).join(` ${f.logic.toUpperCase()} `)})` : `${f.field} ${f.operator} ${JSON.stringify(f.value ?? null)}`;
  return filters.length ? filters.map(one).join(' AND ') : 'no filters';
}

export default function FilterBuilderDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rows, setRows] = useState<number | null>(null);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => api.current?.openFilterBuilder()}>
          Open through the API
        </Button>
        <Checkbox checked={includeHidden} onCheckedChange={(checked) => setIncludeHidden(checked)}>
          Offer hidden columns
        </Checkbox>
        <Checkbox checked={cancelOpen} onCheckedChange={(checked) => setCancelOpen(checked)}>
          Cancel opening
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => api.current?.clearFiltering()}>
          Clear filters
        </Button>
        <output aria-label="Filtered rows">{rows === null ? '' : `${rows} rows`}</output>
      </div>
      <DataGrid<Order>
        aria-label="Orders with a filter builder"
        data={orders}
        columns={columns}
        filtering={{ ui: 'menu', builder: { includeHidden }, filters: initial }}
        toolbar={['filterBuilder']}
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onBeforeFilterBuilderOpen={(event) => {
          push(`builder open (${event.source}): ${describe(event.filters)}${cancelOpen ? ' - cancelled' : ''}`);
          if (cancelOpen) event.preventDefault();
        }}
        onFilterChange={(event) => {
          push(`filter change (${event.ui ?? 'other'}, ${event.source}): ${describe(event.filters)}`);
          setRows(api.current?.getFilteredRows().length ?? null);
        }}
      />
      <EventLog entries={log} />
    </>
  );
}
