'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridEmptyContext } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(40, 31);
const none: Order[] = [];

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

// localeText.noRows replaces the default text; renderEmpty replaces the whole empty row content.
const localeText = { noRows: 'No orders yet' };

function renderEmpty({ reason }: DataGridEmptyContext) {
  return reason === 'noMatch' ? <span className="demo-empty">No order matches the filter. Clear it to see every order.</span> : <span className="demo-empty">The order book is empty.</span>;
}

export default function EmptyStateDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [rows, setRows] = useState<Order[]>(orders);
  const [custom, setCustom] = useState(true);
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => setRows(none)}>
          Remove every row
        </Button>
        <Button variant="outline" onClick={() => api.current?.filterColumn('country', 'equal', 'Atlantis')}>
          Filter to no match
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            api.current?.clearFiltering();
            setRows(orders);
          }}
        >
          Restore
        </Button>
        <Checkbox checked={custom} onCheckedChange={(checked) => setCustom(checked)}>
          renderEmpty
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Orders with an empty state"
        data={rows}
        columns={columns}
        filtering
        height={260}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        localeText={localeText}
        {...(custom ? { renderEmpty } : {})}
        ref={api}
      />
    </>
  );
}
