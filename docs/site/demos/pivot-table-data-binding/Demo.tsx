'use client';

import { useRef, useState } from 'react';
import { parseCsv, PivotTable, type PivotFieldDefinition, type PivotModel, type PivotModelInput, type PivotTableApi } from '@salmonui/pivot-table';
import { Button } from '@salmonui/buttons/button';
import { TextArea } from '@salmonui/inputs/text-field';

type Sale = { id: number; region: string; country: string; product: string; year: string; amount: number; units: number };

// CSV text as an app would fetch it from a file or an endpoint.
const CSV = `id,region,country,product,year,amount,units
1,Asia,Japan,Bikes,2025,1200,6
2,Asia,Japan,Helmets,2025,310,12
3,Asia,India,Bikes,2025,980,5
4,Asia,India,Gloves,2026,140,20
5,Europe,France,Bikes,2025,1450,7
6,Europe,France,Helmets,2026,420,15
7,Europe,Germany,Bikes,2026,1610,8
8,Europe,Germany,Gloves,2025,95,13
9,Americas,Brazil,Bikes,2026,870,4
10,Americas,Brazil,Helmets,2025,260,10
11,Americas,Canada,Bikes,2025,1320,6
12,Americas,Canada,Gloves,2026,180,24`;

// Field definitions: captions, types, field list folders, a hidden
// key and per-field capabilities (Region cannot be removed or dragged).
const FIELDS: PivotFieldDefinition<Sale>[] = [
  { field: 'id', caption: 'Id', type: 'number', hidden: true },
  { field: 'region', caption: 'Region', type: 'string', folder: 'Geography', removable: false, draggable: false },
  { field: 'country', caption: 'Country', type: 'string', folder: 'Geography' },
  { field: 'product', caption: 'Product', type: 'string', folder: 'Catalog' },
  { field: 'year', caption: 'Year', type: 'string', sortable: false },
  { field: 'amount', caption: 'Amount', type: 'number', folder: 'Measures' },
  { field: 'units', caption: 'Units', type: 'number', folder: 'Measures', filterable: false },
];

const INITIAL_MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  formats: { amount: { number: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } } },
};

const toSales = (text: string): Sale[] => parseCsv(text, { types: { year: 'string' } }) as unknown as Sale[];

/** parseCsv feeding `data`, field definitions, a controlled `pivotModel`, data replacement, refresh and the result API. */
export default function PivotTableDataBindingDemo() {
  const tableRef = useRef<PivotTableApi<Sale>>(null);
  const [csv, setCsv] = useState(CSV);
  const [data, setData] = useState<Sale[]>(() => toSales(CSV));
  // Controlled report model: the table proposes, the app applies.
  const [model, setModel] = useState<PivotModelInput>(INITIAL_MODEL);
  const [readout, setReadout] = useState('Read the result to see the grand total.');

  const addSale = () => {
    const id = data.length + 1;
    setData([...data, { id, region: 'Asia', country: 'Japan', product: 'Bikes', year: '2026', amount: 500, units: 3 }]);
  };
  const readResult = () => {
    // The computed matrix is code-readable; the last row and column are the grand totals.
    const result = tableRef.current?.getResult();
    if (!result) return;
    const last = result.cellAt(result.rowCount - 1, result.columnCount - 1);
    const first = result.memberAt('rows', 0);
    setReadout(`${result.rowCount} rows × ${result.columnCount} columns · first row "${first.label}" · grand total ${last.formattedValue} from ${last.rowCount} raw rows`);
  };
  const usesRegion = (m: PivotModelInput) => m.rows?.some((f) => f.field === 'region') ?? false;

  return (
    <div>
      <TextArea label="CSV source" value={csv} onValueChange={(next) => setCsv(next)} rows={5} spellCheck={false} resize="vertical" style={{ inlineSize: "100%", maxInlineSize: 640 }} />
      <div className="demo-toolbar" style={{ marginBlockStart: 8 }}>
        <Button variant="outline" onClick={() => setData(toSales(csv))}>
          Parse CSV
        </Button>
        <Button variant="outline" onClick={addSale}>
          Add a 2026 Japan bike sale
        </Button>
        <Button variant="outline" onClick={() => tableRef.current?.refresh()}>
          Refresh
        </Button>
        <Button variant="outline" onClick={readResult}>
          Read result
        </Button>
        <Button variant="outline" onClick={() => setModel({ ...INITIAL_MODEL, rows: [{ field: 'product' }], columns: [{ field: 'region' }] })}>
          Products by region
        </Button>
        <Button variant="outline" onClick={() => setModel(INITIAL_MODEL)}>
          Reset report
        </Button>
      </div>
      <PivotTable<Sale>
        ref={tableRef}
        data={data}
        fields={FIELDS}
        pivotModel={model}
        onBeforePivotModelChange={(event) => {
          // A controlled model can refuse a change: the Region field must stay on rows when it is there.
          if (usesRegion(model) && !event.model.rows.some((f) => f.field === 'region')) event.preventDefault();
        }}
        onPivotModelChange={(event) => setModel(event.model as PivotModel)}
        axisBar={{ showFieldsPanel: true }}
        fieldList="popup"
        toolbar={['fieldList']}
        locale="en-US"
        height={300}
        aria-label="Sales parsed from CSV"
      />
      <p className="demo-status" aria-live="polite">
        {data.length} raw rows · rows <code>{(model.rows ?? []).map((f) => f.field).join(', ') || 'none'}</code> · columns{' '}
        <code>{(model.columns ?? []).map((f) => f.field).join(', ') || 'none'}</code>
      </p>
      <p className="demo-status" aria-live="polite">
        {readout}
      </p>
    </div>
  );
}
