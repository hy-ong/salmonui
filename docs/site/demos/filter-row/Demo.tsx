'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridFilter, type DataGridFilterContext } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

// Customer names with accents and case variants, to show `matchCase` and `ignoreAccents`.
const NAMES = ['José Álvarez', 'Zoë Laurent', 'Chloé Dubois', 'jose alvarez', 'Renée Roy', 'André Silva', 'Noël Martin', 'Ana Muñoz'];
const orders: Order[] = createOrders(600, 5).map((order, index) => ({ ...order, customer: NAMES[index % NAMES.length] as string }));

const COUNTRIES = ['France', 'Germany', 'Japan', 'Malaysia', 'Portugal'];
// `all` stands for "no filter"; every other option is a country.
const COUNTRY_OPTIONS = [{ value: 'all', label: 'All' }, ...COUNTRIES.map((country) => ({ value: country, label: country }))];

/** Filter row cell template (`renderFilterCell`): a select instead of the text input. */
function CountryFilterCell(ctx: DataGridFilterContext<Order>) {
  return (
    <Select
      aria-label="Filter Country"
      data={COUNTRY_OPTIONS}
      value={typeof ctx.value === 'string' ? ctx.value : 'all'}
      onValueChange={(value) => (value == null || value === 'all' ? ctx.clear() : ctx.apply(String(value)))}
      style={{ inlineSize: '100%' }}
    />
  );
}

// Lookup column: rows hold the category key; the grid shows, and filters by, the name.
const CATEGORIES = [
  { id: 'Coffee', name: 'Coffee beans' },
  { id: 'Tea', name: 'Loose tea' },
  { id: 'Equipment', name: 'Brewing equipment' },
];

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  // Filters are keyed by column id: this column's id is `place`, its field `city`.
  { id: 'place', field: 'city', header: 'City', width: 130 },
  { field: 'country', header: 'Country', width: 130, filter: { operator: 'equal' }, renderFilterCell: CountryFilterCell },
  { field: 'category', header: 'Category', width: 150, lookup: { data: CATEGORIES, keyField: 'id', displayField: 'name' } },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 100 },
  { field: 'note', header: 'Note (not filterable)', width: 200, filterable: false },
];

const initialFilters: readonly DataGridFilter[] = [{ field: 'amount', operator: 'greaterThanOrEqual', value: 50 }];
// Nested group: (Japan OR amount > 1,000) AND not shipped. The group's `logic`
// combines its members.
const nested: readonly DataGridFilter[] = [
  {
    logic: 'or',
    filters: [
      { field: 'country', operator: 'equal', value: 'Japan' },
      { field: 'amount', operator: 'greaterThan', value: 1000 },
    ],
  },
  { field: 'shipped', operator: 'equal', value: false },
];

const describe = (filters: readonly DataGridFilter[]): string =>
  filters.length === 0
    ? 'none'
    : filters.map((f) => ('filters' in f ? `(${f.filters.map((m) => describe([m])).join(` ${f.logic} `)})` : `${f.logic === 'or' ? 'or ' : ''}${f.field} ${f.operator} ${JSON.stringify(f.value)}`)).join('; ');

export default function FilterRowDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [filters, setFilters] = useState<readonly DataGridFilter[]>(initialFilters);
  const [matchCase, setMatchCase] = useState(false);
  const [ignoreAccents, setIgnoreAccents] = useState(false);
  const [showOperators, setShowOperators] = useState(false);
  const [typing, setTyping] = useState(false);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={matchCase} onCheckedChange={(checked) => setMatchCase(checked)}>
          Match case
        </Checkbox>
        <Checkbox checked={ignoreAccents} onCheckedChange={(checked) => setIgnoreAccents(checked)}>
          Ignore accents
        </Checkbox>
        <Checkbox checked={showOperators} onCheckedChange={(checked) => setShowOperators(checked)}>
          Show operators
        </Checkbox>
        <Checkbox checked={typing} onCheckedChange={(checked) => setTyping(checked)}>
          Filter while typing (300 ms)
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.filterColumn('amount', 'between', [100, 500])}>
          Amount between 100 and 500
        </Button>
        <Button variant="outline" onClick={() => api.current?.filterColumn('place', 'in', ['Lyon', 'Osaka'])}>
          City in Lyon, Osaka
        </Button>
        <Button variant="outline" onClick={() => setFilters(nested)}>
          (Japan or over 1,000) and not shipped
        </Button>
        <Button variant="outline" onClick={() => api.current?.removeFilter('amount')}>
          Remove Amount filter
        </Button>
        <Button variant="outline" onClick={() => api.current?.clearFiltering()}>
          Clear filters
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with a filter row"
        data={orders}
        columns={columns}
        filtering={{ ui: 'row', filters, matchCase, ignoreAccents, showOperators, trigger: typing ? 'input' : 'enter', debounce: 300 }}
        sorting
        height={360}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onFilterChange={(event) => {
          setFilters(event.filters);
          push(`filterChange (${event.source}${event.field ? `, ${event.field}` : ''}): ${describe(event.filters)}`);
        }}
      />
      <p className="demo-status">Type in the filter row and press Enter: <code>&gt;=500</code>, <code>!=France</code> and <code>Lyo*</code> pick other operators.</p>
      <EventLog entries={log} label="Filter changes" />
    </>
  );
}
