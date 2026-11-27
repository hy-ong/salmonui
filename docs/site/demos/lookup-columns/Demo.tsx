'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridSorting } from '@salmonui/data-grid';
import { createOrders } from '../../lib/fixtures';

// Lookup tables: the order rows hold keys, the grid shows the names.
const customers = [
  { id: 1, name: 'Aiko Tan' },
  { id: 2, name: 'Bao Nguyen' },
  { id: 3, name: 'Chen Wei' },
  { id: 4, name: 'Dewi Lestari' },
  { id: 5, name: 'Elif Kaya' },
  { id: 6, name: 'Farah Aziz' },
  { id: 7, name: 'Goran Petrov' },
  { id: 8, name: 'Hana Sato' },
];
// Key order (D1..D5) differs from display order: sorting and grouping follow the titles.
const departments = [
  { code: 'D1', title: 'Operations' },
  { code: 'D2', title: 'Finance' },
  { code: 'D3', title: 'Marketing' },
  { code: 'D4', title: 'Engineering' },
  { code: 'D5', title: 'Human resources' },
];

interface OrderRow {
  readonly id: string;
  readonly customerId: number;
  readonly department: string;
  readonly product: string;
  readonly amount: number;
}

// Deterministic keys (no Math.random): identical server and client markup.
const rows: OrderRow[] = createOrders(2_000, 5).map((order, index) => ({
  id: order.id,
  customerId: (customers[(index * 7) % customers.length] as { id: number }).id,
  department: (departments[(index * 3) % departments.length] as { code: string }).code,
  product: order.product,
  amount: order.amount,
}));

const columns: DataGridColumn<OrderRow>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  // The cell value is the key; the grid displays, sorts, filters, searches and groups by `displayField`.
  { field: 'customerId', header: 'Customer', width: 160, lookup: { data: customers, keyField: 'id', displayField: 'name' } },
  // `keyField` defaults to the column field when the lookup rows use the same name; here it is `code`.
  { field: 'department', header: 'Department', width: 170, lookup: { data: departments, keyField: 'code', displayField: 'title' } },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

// Sorted by the display text: "Aiko Tan" first, although its key is 1 of 8.
const sorting: DataGridSorting = { multiple: true, sortBy: [{ field: 'customerId', direction: 'asc' }] };

export default function LookupColumnsDemo() {
  const api = useRef<DataGridApi<OrderRow> | null>(null);
  const [status, setStatus] = useState('Type "fin" in the Department filter cell and press Enter: the filter matches the display text.');
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.groupColumn('department')}>
          Group by Department
        </Button>
        <Button variant="outline" onClick={() => api.current?.clearGrouping()}>
          Clear grouping
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            // The compiled columns that carry `lookup`.
            const lookups = (api.current?.getColumns() ?? []).filter((column) => column.lookup);
            setStatus(`Lookup columns: ${lookups.map((column) => `${column.headerText} (${column.lookup?.keyField} -> ${column.lookup?.displayField})`).join(', ')}`);
          }}
        >
          List lookup columns
        </Button>
        <Button variant="outline" onClick={() => api.current?.filterColumn('department', 'contains', 'fin')}>
          Filter Department contains &quot;fin&quot;
        </Button>
        <Button variant="outline" onClick={() => api.current?.clearFiltering()}>
          Clear filters
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const first = api.current?.getViewRows()[0];
            if (first) setStatus(`First row ${first.id}: the row stores customerId ${first.customerId} and department ${first.department}; the cells show the names.`);
          }}
        >
          Show the stored keys
        </Button>
      </div>
      <DataGrid<OrderRow>
        aria-label="Orders with lookup columns"
        data={rows}
        columns={columns}
        sorting={sorting}
        filtering
        search
        toolbar={['search']}
        grouping
        height={380}
        locale="en-US"
        currency="USD"
        ref={api}
      />
      <p className="demo-status" aria-live="polite">
        {status}
      </p>
    </>
  );
}
