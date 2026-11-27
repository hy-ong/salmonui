'use client';

import { useMemo, useState } from 'react';
import { PivotTable, type PivotModel, type PivotModelInput, type PivotFieldDefinition } from '@salmonui/pivot-table';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { TextField } from '@salmonui/inputs/text-field';

type PivotTotals = PivotModel['totals'];

const GRAND_OPTIONS = [
  { value: 'both', label: 'Rows and columns' },
  { value: 'rows', label: 'Row only' },
  { value: 'columns', label: 'Column only' },
  { value: 'none', label: 'None' },
];
const GRAND_POSITION_OPTIONS = [
  { value: 'end', label: 'End' },
  { value: 'start', label: 'Start' },
];
const SUB_POSITION_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'start', label: 'Start' },
  { value: 'end', label: 'End' },
];
const VALUES_AXIS_OPTIONS = [
  { value: 'columns', label: 'Columns' },
  { value: 'rows', label: 'Rows' },
];
const VALUES_LEVEL_OPTIONS = [
  { value: -1, label: 'Innermost' },
  { value: 0, label: 'Outermost' },
];

type Sale = { region: string; country: string; year: string; amount: number; units: number };

// Captions for the headers, the axis bar and the field list (the raw field names otherwise).
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'region', caption: 'Region', type: 'string' },
  { field: 'country', caption: 'Country', type: 'string' },
  { field: 'year', caption: 'Year', type: 'string' },
  { field: 'amount', caption: 'Amount', type: 'number' },
  { field: 'units', caption: 'Units', type: 'number' },
];

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'], Americas: ['Brazil', 'Canada'] };

/** Sparse sales: India has no 2024 rows and Brazil no 2026 rows, so empty members exist. */
function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let n = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      for (const year of ['2024', '2025', '2026']) {
        if ((country === 'India' && year === '2024') || (country === 'Brazil' && year === '2026')) continue;
        for (let k = 0; k < 2; k++) {
          n++;
          const amount = ((n * 389) % 1300) + 200;
          rows.push({ region, country, year, amount, units: (amount % 23) + 2 });
        }
      }
    }
  }
  return rows;
}

const SALES = makeSales();

/** Grand totals, subtotals and their positions, values placement, the value header, empty members and empty cell text. */
export default function PivotTableTotalsDemo() {
  const [grand, setGrand] = useState<PivotTotals['grand']>('both');
  const [grandPosition, setGrandPosition] = useState<PivotTotals['grandPosition']>('end');
  const [sub, setSub] = useState(true);
  const [subPosition, setSubPosition] = useState<PivotTotals['subPosition']>('auto');
  const [valuesAxis, setValuesAxis] = useState<'columns' | 'rows'>('columns');
  const [valuesIndex, setValuesIndex] = useState(-1);
  const [twoMeasures, setTwoMeasures] = useState(true);
  const [showValueHeader, setShowValueHeader] = useState(false);
  const [showEmptyMembers, setShowEmptyMembers] = useState(false);
  const [emptyCellText, setEmptyCellText] = useState('-');

  // The report model is derived from the controls; `pivotModel` re-applies it when it changes structurally.
  const model = useMemo<PivotModelInput>(
    () => ({
      rows: [{ field: 'region' }, { field: 'country' }],
      columns: [{ field: 'year' }],
      values: twoMeasures ? [{ field: 'amount', aggregate: 'sum' }, { field: 'units', aggregate: 'sum' }] : [{ field: 'amount', aggregate: 'sum' }],
      expanded: 'all',
      formats: { amount: { number: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } } },
      totals: { grand, grandPosition, sub, subPosition },
      valuesPlacement: { axis: valuesAxis, index: valuesIndex },
      showValueHeader,
      showEmptyMembers,
    }),
    [grand, grandPosition, sub, subPosition, valuesAxis, valuesIndex, twoMeasures, showValueHeader, showEmptyMembers],
  );

  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Totals">
        <label>
          Grand totals
          <Select aria-label="Grand totals" data={GRAND_OPTIONS} value={grand} onValueChange={(next) => next != null && setGrand(next as PivotTotals['grand'])} />
        </label>
        <label>
          Grand total position
          <Select aria-label="Grand total position" data={GRAND_POSITION_OPTIONS} value={grandPosition} onValueChange={(next) => next != null && setGrandPosition(next as PivotTotals['grandPosition'])} />
        </label>
        <Checkbox checked={sub} onCheckedChange={(checked) => setSub(checked)}>
          Subtotals
        </Checkbox>
        <label>
          Subtotal position
          <Select aria-label="Subtotal position" data={SUB_POSITION_OPTIONS} value={subPosition} onValueChange={(next) => next != null && setSubPosition(next as PivotTotals['subPosition'])} />
        </label>
      </div>
      <div className="demo-toolbar" role="group" aria-label="Values and empty members">
        <Checkbox checked={twoMeasures} onCheckedChange={(checked) => setTwoMeasures(checked)}>
          Two measures
        </Checkbox>
        <label>
          Values on
          <Select aria-label="Values on" data={VALUES_AXIS_OPTIONS} value={valuesAxis} onValueChange={(next) => next != null && setValuesAxis(next as 'columns' | 'rows')} />
        </label>
        <label>
          Values level
          <Select aria-label="Values level" data={VALUES_LEVEL_OPTIONS} value={valuesIndex} onValueChange={(next) => next != null && setValuesIndex(Number(next))} />
        </label>
        <Checkbox checked={showValueHeader} onCheckedChange={(checked) => setShowValueHeader(checked)}>
          Value header with one measure
        </Checkbox>
        <Checkbox checked={showEmptyMembers} onCheckedChange={(checked) => setShowEmptyMembers(checked)}>
          Show empty members
        </Checkbox>
        <label>
          Empty cell text
          <TextField aria-label="Empty cell text" value={emptyCellText} onValueChange={(next) => setEmptyCellText(next)} style={{ inlineSize: '5em' }} />
        </label>
      </div>
      <PivotTable<Sale>
        data={SALES}
        fields={FIELDS}
        pivotModel={model}
        emptyCellText={emptyCellText}
        locale="en-US"
        height={360}
        columnWidth={110}
        aria-label="Sales with totals"
      />
    </div>
  );
}
