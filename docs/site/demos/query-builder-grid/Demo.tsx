'use client';

import { useMemo, useState } from 'react';
import { DataGrid, type DataGridColumn, type DataGridFilter } from '@salmonui/data-grid';
import { isQueryGroup, QueryBuilder, type QueryField, type QueryGroup } from '@salmonui/query-builder';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(300, 7);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'category', header: 'Category', width: 120 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 110 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 120 },
];

// The same fields for the QueryBuilder (the grid derives them from its columns).
const fields: QueryField[] = [
  { field: 'customer', label: 'Customer' },
  { field: 'country', label: 'Country' },
  { field: 'category', label: 'Category' },
  { field: 'amount', label: 'Amount', type: 'number' },
  { field: 'shipped', label: 'Shipped', type: 'boolean' },
];

// The grid reports top-level filters; one group is the query itself, several are ANDed.
const toQuery = (filters: readonly DataGridFilter[]): QueryGroup =>
  filters.length === 1 && isQueryGroup(filters[0] as QueryGroup) ? (filters[0] as QueryGroup) : ({ logic: 'and', filters } as QueryGroup);

export default function QueryBuilderGridDemo() {
  const [query, setQuery] = useState<QueryGroup>({
    logic: 'and',
    filters: [
      { field: 'amount', operator: 'greaterThan', value: 200 },
      { logic: 'or', filters: [{ field: 'country', operator: 'equal', value: 'Japan' }, { field: 'country', operator: 'equal', value: 'Germany' }] },
    ],
  });
  // The QueryGroup is a Data Grid filter group as is.
  const filtering = useMemo(() => ({ ui: 'menu' as const, builder: true, filters: query.filters.length ? [query as DataGridFilter] : [] }), [query]);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <QueryBuilder aria-label="Order filter" fields={fields} value={query} onValueChange={setQuery} notCondition />
      <DataGrid<Order>
        aria-label="Orders filtered by the query"
        data={orders}
        columns={columns}
        filtering={filtering}
        toolbar={['filterBuilder']}
        resizeMode="auto"
        height={320}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        onFilterChange={(event) => setQuery(toQuery(event.filters))}
      />
    </div>
  );
}
