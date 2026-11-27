'use client';

import { useState } from 'react';
import { PivotTable, type PivotAggregate, type PivotCell, type PivotModel, type PivotModelInput, type PivotValueField, type PivotFieldDefinition } from '@salmonui/pivot-table';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

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

function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let n = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      for (const year of ['2024', '2025', '2026']) {
        for (let k = 0; k < 4; k++) {
          n++;
          const amount = ((n * 523) % 1700) + 120;
          rows.push({ region, country, year, amount, units: (amount % 29) + 1 });
        }
      }
    }
  }
  return rows;
}

const SALES = makeSales();

const AGGREGATES: PivotAggregate[] = ['sum', 'product', 'count', 'distinctCount', 'min', 'max', 'average', 'median', 'populationStdev', 'sampleStdev', 'populationVar', 'sampleVar'];
const SHOW_AS = [
  'none',
  'percentOfGrandTotal',
  'percentOfColumnTotal',
  'percentOfRowTotal',
  'percentOfParentTotal',
  'percentOfParentRowTotal',
  'percentOfParentColumnTotal',
  'runningTotal',
  'percentOfRunningTotal',
  'differenceFrom',
  'percentOfDifferenceFrom',
  'index',
] as const;
type ShowAsKind = (typeof SHOW_AS)[number];
const AGGREGATE_OPTIONS = AGGREGATES.map((a) => ({ value: a, label: a }));
const SHOW_AS_OPTIONS = SHOW_AS.map((k) => ({ value: k, label: k }));

// Aggregates the value field menus offer.
const MENU_AGGREGATES: PivotAggregate[] = ['sum', 'count', 'average', 'min', 'max', 'median'];

const INITIAL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  expanded: [['rows', 'Asia']],
};

function withShowAs(field: PivotValueField, kind: ShowAsKind): PivotValueField {
  const { showAs: _drop, ...rest } = field;
  if (kind === 'none') return rest;
  // Base-field kinds compare years; differences are against 2025.
  if (kind === 'differenceFrom' || kind === 'percentOfDifferenceFrom') return { ...rest, showAs: { kind, baseField: 'year', baseItem: '2025' } };
  if (kind === 'percentOfParentTotal') return { ...rest, showAs: { kind, baseField: 'region' } };
  if (kind === 'runningTotal' || kind === 'percentOfRunningTotal') return { ...rest, showAs: { kind, baseField: 'year' } };
  return { ...rest, showAs: { kind } };
}

// A pure override of the aggregated value of a cell.
const hideSmallCells = (cell: PivotCell): number | null => (cell.kind === 'value' && cell.rawValue !== null && cell.rawValue < 4000 && cell.measure === 'amount' ? null : cell.value);

/** Every aggregate and show-values-as kind, value field menus with a restricted aggregate list, and a getCellValue override. */
export default function PivotTableAggregationDemo() {
  const [model, setModel] = useState<PivotModelInput>(INITIAL);
  const [override, setOverride] = useState(false);
  const [menuLog, setMenuLog] = useState('Open the menu of the amount value button on the axis bar.');
  const value = model.values?.[0] ?? { field: 'amount', aggregate: 'sum' };
  const kind: ShowAsKind = value.showAs?.kind ?? 'none';

  const setValue = (next: PivotValueField) => setModel((m) => ({ ...m, values: [next, ...(m.values ?? []).slice(1)] }));

  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Value field">
        <label>
          Aggregate
          <Select aria-label="Aggregate" data={AGGREGATE_OPTIONS} value={value.aggregate} onValueChange={(next) => next != null && setValue({ ...value, aggregate: next as PivotAggregate })} />
        </label>
        <label>
          Show values as
          <Select aria-label="Show values as" data={SHOW_AS_OPTIONS} value={kind} onValueChange={(next) => next != null && setValue(withShowAs(value, next as ShowAsKind))} />
        </label>
        <Checkbox checked={override} onCheckedChange={(checked) => setOverride(checked)}>
          getCellValue: hide amounts under 4,000
        </Checkbox>
      </div>
      <PivotTable<Sale>
        // getCellValue is read when the store is created, so toggling it remounts the table; the model is app state and survives.
        key={override ? 'override' : 'plain'}
        data={SALES}
        fields={FIELDS}
        pivotModel={model}
        onPivotModelChange={(event) => setModel(event.model as PivotModel)}
        {...(override ? { getCellValue: hideSmallCells } : {})}
        axisBar={{ showFieldsPanel: true }}
        aggregateOptions={MENU_AGGREGATES}
        onBeforeAggregateMenuOpen={(event) => {
          // Edit the offered list per field: Units also offers distinct count.
          if (event.field === 'units') event.items.push('distinctCount');
          setMenuLog(`Aggregate menu of ${event.field} offers ${event.items.join(', ')}`);
        }}
        emptyCellText="·"
        locale="en-US"
        height={330}
        aria-label="Sales aggregation"
      />
      <p className="demo-status" aria-live="polite">
        Value field <code>{JSON.stringify(value)}</code>
      </p>
      <p className="demo-status" aria-live="polite">
        {menuLog}
      </p>
    </div>
  );
}
