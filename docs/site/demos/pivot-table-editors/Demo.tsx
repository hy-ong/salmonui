'use client';

import { useRef, useState } from 'react';
import { PivotTable, type PivotModelInput, type PivotTableApi, type PivotFieldDefinition } from '@salmonui/pivot-table';
import { Button } from '@salmonui/buttons/button';

type Sale = { region: string; country: string; year: string; amount: number; units: number };

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'], Americas: ['Brazil', 'Canada'] };

function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let n = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      for (const year of ['2025', '2026']) {
        for (let k = 0; k < 5; k++) {
          n++;
          const units = (n % 9) + 1;
          rows.push({ region, country, year, units, amount: units * (((n * 131) % 90) + 40) });
        }
      }
    }
  }
  return rows;
}

const SALES = makeSales();

// A calculated field (CSP-safe formula, no eval), number formats and a conditional format rule in the model.
// Captions for the headers, the axis bar and the field list (the raw field names otherwise).
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
  { field: 'units', caption: 'Units', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [
    { field: 'amount', aggregate: 'sum' },
    { field: 'avgPrice', aggregate: 'sum', caption: 'Average price' },
  ],
  calculatedFields: [{ name: 'avgPrice', caption: 'Average price', formula: '"Sum(amount)" / "Sum(units)"', format: { number: { style: 'currency', currency: 'USD' } } }],
  formats: { amount: { number: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } } },
  conditionalFormats: [{ measure: 'avgPrice', operator: 'greaterThan', value: 85, tone: 'success' }],
};

/** The popup field list with its field menus, and the calculated field, number format and conditional format editors. */
export default function PivotTableEditorsDemo() {
  const tableRef = useRef<PivotTableApi<Sale>>(null);
  const [log, setLog] = useState<string[]>([]);
  const push = (line: string) => setLog((items) => [line, ...items].slice(0, 6));
  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Open an editor from code">
        <Button variant="outline" onClick={() => tableRef.current?.openFieldList()}>
          openFieldList()
        </Button>
        <Button variant="outline" onClick={() => tableRef.current?.openCalculatedFieldEditor('avgPrice')}>
          Edit "Average price"
        </Button>
        <Button variant="outline" onClick={() => tableRef.current?.openNumberFormatEditor('amount')}>
          Format Amount
        </Button>
        <Button variant="outline" onClick={() => tableRef.current?.openConditionalFormatEditor()}>
          openConditionalFormatEditor()
        </Button>
      </div>
      <PivotTable<Sale>
        ref={tableRef}
        data={SALES}
        fields={FIELDS}
        defaultPivotModel={MODEL}
        fieldList="popup"
        toolbar={['fieldList', 'calculatedField', 'numberFormat', 'conditionalFormat']}
        onCalculatedFieldChange={(event) => push(`calculated field ${event.name}: ${event.calculatedField ? event.calculatedField.formula : 'removed'}`)}
        onPivotModelChange={(event) => {
          if (event.action === 'format' || event.action === 'conditionalFormat' || event.action === 'moveField' || event.action === 'aggregate' || event.action === 'sort' || event.action === 'filter') push(`${event.action}${event.field ? ` ${event.field}` : ''} (${event.source})`);
        }}
        locale="en-US"
        height={330}
        columnWidth={130}
        aria-label="Sales with editors"
      />
      <div className="demo-log" aria-label="Editor changes">
        {log.length ? (
          <ol>
            {log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ol>
        ) : (
          'Open the field list or an editor from the toolbar, or from the buttons above.'
        )}
      </div>
    </div>
  );
}
