'use client';

import { useState } from 'react';
import { PivotTable, usePivot, type PivotModelInput, type PivotTableLayout, type PivotFieldDefinition } from '@salmonui/pivot-table';
import { Button } from '@salmonui/buttons/button';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';

type Sale = { region: string; country: string; product: string; year: string; amount: number };

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'], Americas: ['Brazil', 'Canada'] };
const PRODUCTS = ['Bikes', 'Helmets', 'Gloves'];

function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let c = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      c++;
      PRODUCTS.forEach((product, p) => {
        for (const year of [2025, 2026]) rows.push({ region, country, product, year: String(year), amount: ((c * 137 + (p + 1) * 61 + year * 7) % 900) + 100 });
      });
    }
  }
  return rows;
}

const SALES = makeSales();

// Captions for the headers, the axis bar and the field list (the raw field names otherwise).
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'product', caption: 'Product', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }, { field: 'product' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  expanded: [['rows', 'Asia']],
};

/** The same report in the compact (treegrid) and tabular (grid) layouts, with drill down and up. */
export default function PivotTableLayoutsDemo() {
  const [layout, setLayout] = useState<PivotTableLayout>('compact');
  const [last, setLast] = useState('none yet');
  const pivot = usePivot<Sale>({
    data: SALES,
    fields: FIELDS,
    defaultPivotModel: MODEL,
    locale: 'en-US',
    onExpandedChange: (event) => setLast(`${event.action}${event.path ? ` ${event.path.slice(1).join(' / ')}` : ''} (${event.source})`),
  });
  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Layout">
        <RadioGroup label="Layout" name="pivot-layout" orientation="horizontal" value={layout} onValueChange={(value) => setLayout(value as PivotTableLayout)}>
          <Radio value="compact">Compact</Radio>
          <Radio value="tabular">Tabular</Radio>
        </RadioGroup>
        <Button variant="outline" onClick={() => pivot.expandAll('rows')}>
          Expand all
        </Button>
        <Button variant="outline" onClick={() => pivot.collapseAll('rows')}>
          Collapse all
        </Button>
      </div>
      <PivotTable pivot={pivot} layout={layout} height={340} aria-label={`Sales, ${layout} layout`} />
      <p className="demo-status" aria-live="polite">
        Last drill: <code>{last}</code>
      </p>
    </div>
  );
}
