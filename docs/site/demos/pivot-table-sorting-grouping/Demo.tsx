'use client';

import { useState } from 'react';
import { PivotAxisBar, PivotTable, usePivot, type PivotFieldDefinition, type PivotMemberSort, type PivotModelInput, type PivotValueSort } from '@salmonui/pivot-table';
import { Button } from '@salmonui/buttons/button';

type Order = { country: string; product: string; placed: string; price: number; amount: number };

const COUNTRIES = ['Brazil', 'Canada', 'France', 'Germany', 'India', 'Japan'];
const PRODUCTS = ['Bikes', 'Helmets', 'Gloves'];

/** 720 orders over 2025 and 2026; `placed` is an ISO date string (dates group in UTC). */
function makeOrders(): Order[] {
  const rows: Order[] = [];
  for (let n = 0; n < 720; n++) {
    const month = n % 24;
    const day = ((n * 7) % 27) + 1;
    const placed = `${2025 + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const price = ((n * 53) % 480) + 20;
    rows.push({ country: COUNTRIES[(n * 5) % 6]!, product: PRODUCTS[(n * 11) % 3]!, placed, price, amount: price * ((n % 4) + 1) });
  }
  return rows;
}

const ORDERS = makeOrders();

const FIELDS: PivotFieldDefinition<Order>[] = [
  { field: 'country', caption: 'Country' },
  { field: 'product', caption: 'Product' },
  { field: 'placed', caption: 'Placed', type: 'date' },
  { field: 'price', caption: 'Unit price', type: 'number' },
  { field: 'amount', caption: 'Amount', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'country' }, { field: 'product' }],
  columns: [{ field: 'placed' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  groups: { placed: { kind: 'date', parts: ['years', 'quarters'] } },
  formats: { amount: { number: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } } },
};

const REGIONS = {
  kind: 'custom',
  groups: [
    { caption: 'Americas', members: ['Brazil', 'Canada'] },
    { caption: 'Europe', members: ['France', 'Germany'] },
    { caption: 'Asia', members: ['India', 'Japan'] },
  ],
} as const;

const describeSort = (sort: PivotMemberSort | null, valueSort: PivotValueSort | null): string =>
  valueSort ? `rows by ${valueSort.columnKey || 'grand total'} ${valueSort.direction}` : JSON.stringify(sort);

/** Member sort with a custom order, value sorting from the column headers, and number, date and custom grouping. */
export default function PivotTableSortingGroupingDemo() {
  const [last, setLast] = useState('none yet');
  const pivot = usePivot<Order>({
    data: ORDERS,
    fields: FIELDS,
    defaultPivotModel: MODEL,
    locale: 'en-US',
    onSortChange: (event) => setLast(`${event.field ?? 'value sort'}: ${describeSort(event.sort, event.valueSort)} (${event.source})`),
  });
  const sort = (value: PivotMemberSort) => pivot.setSort('country', value);
  const priceBands = () =>
    pivot.setModel((m) => ({ ...m, rows: [{ field: 'price' }], groups: { ...m.groups, price: { kind: 'number', start: 0, end: 399, interval: 100 } } }));
  const countries = () => pivot.setModel((m) => ({ ...m, rows: [{ field: 'country' }, { field: 'product' }] }));

  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Member sort of Country">
        <span>Country order</span>
        <Button variant="outline" onClick={() => sort('asc')}>
          Ascending
        </Button>
        <Button variant="outline" onClick={() => sort('desc')}>
          Descending
        </Button>
        <Button variant="outline" onClick={() => sort({ order: ['Japan', 'India', 'Germany'] })}>
          Japan, India, Germany first
        </Button>
        <Button variant="outline" onClick={() => sort('none')}>
          Data order
        </Button>
        <Button variant="outline" onClick={() => pivot.setValueSort({ columnKey: '', measure: 'amount', direction: 'desc' })}>
          Rows by grand total
        </Button>
      </div>
      <div className="demo-toolbar" role="group" aria-label="Grouping">
        <span>Group</span>
        <Button variant="outline" onClick={() => pivot.setGrouping('placed', { kind: 'date', parts: ['years', 'quarters'] })}>
          Placed: years and quarters
        </Button>
        <Button variant="outline" onClick={() => pivot.setGrouping('placed', { kind: 'date', parts: ['months'] })}>
          Placed: months
        </Button>
        <Button variant="outline" onClick={() => pivot.setGrouping('country', REGIONS)}>
          Countries into regions
        </Button>
        <Button variant="outline" onClick={() => pivot.setGrouping('country', null)}>
          Ungroup countries
        </Button>
        <Button variant="outline" onClick={priceBands}>
          Rows: unit price bands of 100
        </Button>
        <Button variant="outline" onClick={countries}>
          Rows: country and product
        </Button>
      </div>
      <PivotAxisBar pivot={pivot} />
      <PivotTable pivot={pivot} valueSorting height={340} columnWidth={130} aria-label="Orders with sorting and grouping" />
      <p className="demo-status" aria-live="polite">
        Last sort: <code>{last}</code>
      </p>
    </div>
  );
}
