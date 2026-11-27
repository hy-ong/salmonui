'use client';

import { useState } from 'react';
import { PivotAxisBar, PivotTable, usePivot, type PivotFilter, type PivotModelInput, type PivotFieldDefinition } from '@salmonui/pivot-table';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { NumberField } from '@salmonui/inputs/number-field';
import { TextField } from '@salmonui/inputs/text-field';

type Sale = { country: string; customer: string; product: string; year: string; amount: number };

const COUNTRIES = ['Brazil', 'Canada', 'France', 'Germany', 'India', 'Japan', 'Kenya', 'Mexico', 'Norway', 'Spain'];
const PRODUCTS = ['Bikes', 'Helmets', 'Gloves', 'Lights'];

/** 6,000 sales over 2,500 customers: a member list long enough to need virtualization. */
function makeSales(): Sale[] {
  const rows: Sale[] = [];
  for (let n = 0; n < 6000; n++) {
    rows.push({
      country: COUNTRIES[(n * 7) % COUNTRIES.length]!,
      customer: `Customer ${String((n * 37) % 2500).padStart(4, '0')}`,
      product: PRODUCTS[(n * 3) % PRODUCTS.length]!,
      year: String(2024 + (n % 3)),
      amount: ((n * 571) % 1900) + 50,
    });
  }
  return rows;
}

const SALES = makeSales();

// Captions for the headers, the axis bar and the field list (the raw field names otherwise).
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'customer', caption: 'Customer', type: 'string' },
  { field: 'product', caption: 'Product', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  filters: [{ field: 'customer' }, { field: 'product' }],
  formats: { amount: { number: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } } },
};

const describe = (filter: PivotFilter | null): string => (filter ? JSON.stringify(filter) : 'cleared');

/** Member, label and value filters from code and from the member editor, with their events. */
export default function PivotTableFilteringDemo() {
  const [text, setText] = useState('an');
  const [top, setTop] = useState(3);
  const [blockProduct, setBlockProduct] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const push = (line: string) => setLog((items) => [line, ...items].slice(0, 6));
  const pivot = usePivot<Sale>({
    data: SALES,
    fields: FIELDS,
    defaultPivotModel: MODEL,
    locale: 'en-US',
    onBeforeMemberEditorOpen: (event) => {
      if (blockProduct && event.field === 'product') {
        event.preventDefault();
        push('member editor of product refused');
      }
    },
    onBeforeFilterChange: (event) => push(`before ${event.field}: ${describe(event.filter)}`),
    onFilterChange: (event) => push(`${event.field}: ${describe(event.filter)} (${event.source})`),
  });

  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Country filters">
        <Button variant="outline" onClick={() => pivot.setFilter('country', { include: ['France', 'Germany', 'Spain'] })}>
          Include Europe
        </Button>
        <Button variant="outline" onClick={() => pivot.setFilter('country', { exclude: ['Japan', 'India'] })}>
          Exclude Asia
        </Button>
        <label>
          Country contains
          <TextField aria-label="Country contains" value={text} onValueChange={(next) => setText(next)} style={{ inlineSize: '8em' }} />
        </label>
        <Button variant="outline" onClick={() => pivot.setFilter('country', { label: { operator: 'contains', value: text } })}>
          Label filter
        </Button>
        <label>
          Top
          <NumberField aria-label="Top" min={1} max={10} value={top} onValueChange={(next) => setTop(next || 1)} style={{ inlineSize: '6em' }} />
        </label>
        <Button variant="outline" onClick={() => pivot.setFilter('country', { value: { measure: 'amount', operator: 'top', value: top } })}>
          Top countries by amount
        </Button>
        <Button variant="outline" onClick={() => pivot.setFilter('country', { value: { measure: 'amount', operator: 'greaterThan', value: 700_000 } })}>
          Amount over 700,000
        </Button>
        <Button variant="outline" onClick={() => pivot.setFilter('country', null)}>
          Clear
        </Button>
        <Checkbox checked={blockProduct} onCheckedChange={(checked) => setBlockProduct(checked)}>
          Refuse the Product member editor
        </Checkbox>
      </div>
      <PivotAxisBar pivot={pivot} />
      <PivotTable pivot={pivot} height={300} aria-label="Sales by country with filters" />
      <div className="demo-log" aria-label="Filter events">
        {log.length ? (
          <ol>
            {log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ol>
        ) : (
          'Use a button, or the filter icon of Customer, Product or Country on the axis bar.'
        )}
      </div>
    </div>
  );
}
