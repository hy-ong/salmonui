'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridSearch } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

// Customer names with accents and case variants, to show `matchCase` and `ignoreAccents`.
const NAMES = ['José Álvarez', 'Zoë Laurent', 'Chloé Dubois', 'jose alvarez', 'Renée Roy', 'André Silva', 'Noël Martin', 'Ana Muñoz'];
const orders: Order[] = createOrders(800, 13).map((order, index) => ({ ...order, customer: NAMES[index % NAMES.length] as string }));

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'city', header: 'City', width: 130 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  // Opted out of searching.
  { field: 'note', header: 'Note (not searchable)', width: 220, searchable: false },
];

type Operator = NonNullable<DataGridSearch['operator']>;
const FIELD_SETS: Record<string, readonly string[] | undefined> = { all: undefined, customer: ['customer'], place: ['city', 'country'] };

const OPERATOR_OPTIONS = [
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'startsWith' },
  { value: 'endsWith', label: 'endsWith' },
  { value: 'equal', label: 'equal' },
  { value: 'notEqual', label: 'notEqual' },
  { value: 'wildcard', label: 'wildcard (* and ?)' },
  { value: 'like', label: 'like (%)' },
];

const COLUMNS_OPTIONS = [
  { value: 'all', label: 'Every searchable column' },
  { value: 'customer', label: 'Customer' },
  { value: 'place', label: 'City and Country' },
];

export default function SearchDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [operator, setOperator] = useState<Operator>('contains');
  const [fieldSet, setFieldSet] = useState('all');
  const [matchCase, setMatchCase] = useState(false);
  const [ignoreAccents, setIgnoreAccents] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const [log, push] = useEventLog();
  const fields = FIELD_SETS[fieldSet];
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Operator
          <Select aria-label="Operator" data={OPERATOR_OPTIONS} value={operator} onValueChange={(value) => value != null && setOperator(value as Operator)} />
        </label>
        <label>
          Columns
          <Select aria-label="Columns" data={COLUMNS_OPTIONS} value={fieldSet} onValueChange={(value) => value != null && setFieldSet(String(value))} />
        </label>
        <Checkbox checked={matchCase} onCheckedChange={(checked) => setMatchCase(checked)}>
          Match case
        </Checkbox>
        <Checkbox checked={ignoreAccents} onCheckedChange={(checked) => setIgnoreAccents(checked)}>
          Ignore accents
        </Checkbox>
        <Checkbox checked={highlight} onCheckedChange={(checked) => setHighlight(checked)}>
          Highlight matches
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.search('Tokyo')}>
          Search “Tokyo”
        </Button>
        <Button variant="outline" onClick={() => api.current?.clearSearch()}>
          Clear search
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Searchable orders"
        data={orders}
        columns={columns}
        toolbar={['search']}
        search={{ text: 'Lyon', operator, matchCase, ignoreAccents, highlight, ...(fields ? { fields } : {}) }}
        height={340}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onBeforeSearchChange={(event) => push(`beforeSearchChange (${event.source}): "${event.previousText}" → "${event.text}"`)}
        onSearchChange={(event) => push(`searchChange: "${event.text}"`)}
      />
      <p className="demo-status">Type in the toolbar search box; Escape clears it.</p>
      <EventLog entries={log} label="Search events" />
    </>
  );
}
