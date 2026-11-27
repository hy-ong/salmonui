'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridColumnChooser } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(1_000, 13);

const columns: DataGridColumn<Order>[] = [
  // `hideable: false` keeps a column out of the chooser.
  { field: 'id', header: 'Order', primaryKey: true, width: 110, hideable: false },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'city', header: 'City', width: 130 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'category', header: 'Category', width: 120 },
  { field: 'quantity', header: 'Quantity', type: 'number', align: 'end', width: 100 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'priority', header: 'Priority', width: 100, hidden: true },
  { field: 'note', header: 'Note', width: 200, hidden: true },
];

const operators = ['contains', 'startsWith', 'endsWith', 'equal'] as const;
const OPERATOR_OPTIONS = operators.map((op) => ({ value: op, label: op }));

export default function ColumnChooserDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [operator, setOperator] = useState<(typeof operators)[number]>('contains');
  const [immediate, setApplyImmediately] = useState(false);
  const [log, push] = useEventLog();
  const columnChooser = useMemo<DataGridColumnChooser>(() => ({ searchOperator: operator, mode: immediate ? 'immediate' : 'confirm' }), [operator, immediate]);
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Search operator
          <Select aria-label="Search operator" data={OPERATOR_OPTIONS} value={operator} onValueChange={(value) => value != null && setOperator(value as (typeof operators)[number])} />
        </label>
        <Checkbox checked={immediate} onCheckedChange={(checked) => setApplyImmediately(checked)}>
          Apply every toggle immediately
        </Checkbox>
        <Button variant="outline" onClick={() => api.current?.openColumnChooser()}>
          Open through the API
        </Button>
        <Button variant="outline" onClick={(event) => api.current?.openColumnChooser({ x: event.clientX, y: event.clientY })}>
          Open at the pointer
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with a column chooser"
        data={orders}
        columns={columns}
        columnChooser={columnChooser}
        toolbar={['columnChooser']}
        height={380}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onBeforeColumnChooserOpen={(event) => push(`chooser open (${event.source}): ${event.columns.length} columns`)}
        onColumnVisibilityChange={(event) => push(`visibility (${event.source}): hidden ${event.hidden.join(', ') || '-'}; shown ${event.shown.join(', ') || '-'}`)}
      />
      <EventLog entries={log} />
    </>
  );
}
