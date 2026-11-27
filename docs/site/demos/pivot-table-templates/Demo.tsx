'use client';

import { useState } from 'react';
import { PivotTable, type PivotCellContext, type PivotHeaderContext, type PivotModelInput, type PivotTooltipContext, type PivotFieldDefinition } from '@salmonui/pivot-table';

type Sale = { region: string; country: string; year: string; amount: number };

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'], Americas: ['Brazil', 'Canada'] };

function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let n = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      for (const year of ['2024', '2025', '2026']) {
        for (let k = 0; k < 3; k++) {
          n++;
          rows.push({ region, country, year, amount: ((n * 397) % 1400) + 150 });
        }
      }
    }
  }
  return rows;
}

const SALES = makeSales();

// Conditional formats are part of the report model: tones come from the theme seeds.
// Captions for the headers, the axis bar and the field list (the raw field names otherwise).
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  expanded: 'all',
  formats: { amount: { number: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } } },
  conditionalFormats: [
    { measure: 'amount', operator: 'greaterThanOrEqual', value: 3000, tone: 'success', applyGrandTotals: false },
    { measure: 'amount', operator: 'lessThan', value: 1800, tone: 'danger', applyGrandTotals: false },
  ],
};

// Render props are module-level (stable identities), so columns are not rebuilt on every render.
const renderCell = ({ cell, defaultContent }: PivotCellContext) => (cell.kind === 'grandTotal' ? <strong>{defaultContent}</strong> : defaultContent);

// Hyperlink recipe: country headers render as links; `onCellClick` handles the click.
const renderHeader = ({ header, axis, defaultContent }: PivotHeaderContext) =>
  axis === 'rows' && header.field === 'country' && header.kind === 'member' ? (
    <a href={`?country=${encodeURIComponent(header.label.toLowerCase())}`} onClick={(event) => event.preventDefault()}>
      {defaultContent}
    </a>
  ) : (
    defaultContent
  );

const renderTooltip = ({ cell, rowHeader, columnHeader }: PivotTooltipContext) => `${rowHeader.label} · ${columnHeader.label}: ${cell.formattedValue} (${cell.rowCount} rows)`;

const getCellClassName = ({ cell }: PivotCellContext) => (cell.kind === 'subtotal' ? 'demo-pivot-subtotal' : '');

/** renderCell, renderHeader, getCellClassName, conditional formats, a hyperlink header and cell selection. */
export default function PivotTableTemplatesDemo() {
  const [clicked, setClicked] = useState('nothing yet');
  const [selected, setSelected] = useState(0);
  return (
    <div>
      <PivotTable<Sale>
        data={SALES}
        fields={FIELDS}
        defaultPivotModel={MODEL}
        locale="en-US"
        height={340}
        columnWidth={130}
        rowHeaderWidth={180}
        striped
        highlightOnHover
        gridLines="horizontal"
        selection={{ multiple: true }}
        renderCell={renderCell}
        renderHeader={renderHeader}
        getCellClassName={getCellClassName}
        renderTooltip={renderTooltip}
        onCellClick={(event) => setClicked(event.cell ? `${event.cell.formattedValue} at ${event.rowKey} × ${event.columnKey}` : `row header ${event.rowHeader.label}`)}
        onSelectionChange={(event) => setSelected(event.keys.length)}
        aria-label="Sales with templates"
      />
      <p className="demo-status" aria-live="polite">
        Clicked: <code>{clicked}</code> · {selected} cell(s) selected
      </p>
    </div>
  );
}
