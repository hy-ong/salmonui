'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridFilter, type DataGridFiltering } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(500, 11);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

// Initial filters: part of the server render, so the pager status is too.
const initialFilters: readonly DataGridFilter[] = [
  { field: 'country', operator: 'equal', value: 'Japan' },
  { field: 'amount', operator: 'greaterThanOrEqual', value: 200 },
];
const paging = { pageSize: 10 };

export default function FilterStatusDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [filters, setFilters] = useState<readonly DataGridFilter[]>(initialFilters);
  const [showStatus, setShowStatus] = useState(true);
  const [summary, setSummary] = useState('');
  const filtering = useMemo<DataGridFiltering>(() => ({ ui: 'row', filters, showStatus }), [filters, showStatus]);
  // getFilteredRows: every row passing the filters, in sort order, across every page.
  const readFilteredRows = (): void => {
    const rows = api.current?.getFilteredRows() ?? [];
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    const first = rows.slice(0, 3).map((row) => row.id).join(', ') || 'none';
    setSummary(`getFilteredRows(): ${rows.length} rows, total amount ${total.toFixed(2)}, first ${first}`);
  };
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={showStatus} onCheckedChange={(checked) => setShowStatus(checked)}>
          Show filter status
        </Checkbox>
        <Button variant="outline" onClick={readFilteredRows}>
          Read filtered rows
        </Button>
        <Button variant="outline" onClick={() => api.current?.clearFiltering()}>
          Clear filters
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with a filter status in the pager"
        data={orders}
        columns={columns}
        filtering={filtering}
        paging={paging}
        sorting
        height={360}
        locale="en-US"
        currency="USD"
        ref={api}
        onFilterChange={(event) => setFilters(event.filters)}
      />
      <p className="demo-status" data-testid="filtered-rows">
        {summary || 'Filter in the row (press Enter), then read the filtered rows.'}
      </p>
    </>
  );
}
