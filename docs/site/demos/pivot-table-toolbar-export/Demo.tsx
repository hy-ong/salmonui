'use client';

import { useRef, useState } from 'react';
import { PivotTable, type PivotExportWriters, type PivotModelInput, type PivotTableApi, type PivotTableState, type PivotToolbarItem, type PivotToolbarItemId, type PivotFieldDefinition } from '@salmonui/pivot-table';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { TextField } from '@salmonui/inputs/text-field';

type Sale = { region: string; country: string; product: string; year: string; amount: number; units: number };

const COUNTRIES: Record<string, string[]> = { Asia: ['Japan', 'India'], Europe: ['France', 'Germany'], Americas: ['Brazil', 'Canada'] };
const PRODUCTS = ['Bikes', 'Helmets', 'Gloves'];

function makeSales(): Sale[] {
  const rows: Sale[] = [];
  let n = 0;
  for (const [region, countries] of Object.entries(COUNTRIES)) {
    for (const country of countries) {
      for (const product of PRODUCTS) {
        for (const year of ['2025', '2026']) {
          n++;
          const amount = ((n * 449) % 1500) + 100;
          rows.push({ region, country, product, year, amount, units: (amount % 19) + 1 });
        }
      }
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
  { field: 'units', caption: 'Units', type: 'number' },
];

const MODEL: PivotModelInput = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' }],
  formats: { amount: { number: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } } },
};

/** The Excel and PDF writers load on the first export (CSV and print need no writer). */
const WRITERS: PivotExportWriters = { pivot: () => import('@salmonui/export/pivot') };

type Report = { name: string; state: PivotTableState };

/** Built-in and custom toolbar items, export and print with their events, saved reports and persistence. */
export default function PivotTableToolbarExportDemo() {
  const tableRef = useRef<PivotTableApi<Sale>>(null);
  const [cancelExports, setCancelExports] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const push = (line: string) => setLog((items) => [line, ...items].slice(0, 6));
  // Report management over app storage (here React state; a real app would use its backend).
  const [reports, setReports] = useState<Report[]>([]);
  const [name, setName] = useState('My report');
  const [selected, setSelected] = useState('');

  const save = () => {
    const state = tableRef.current?.getState();
    if (!state || !name.trim()) return;
    setReports((list) => [...list.filter((r) => r.name !== name.trim()), { name: name.trim(), state }]);
    setSelected(name.trim());
    push(`saved "${name.trim()}"`);
  };
  const load = () => {
    const report = reports.find((r) => r.name === selected);
    if (report && tableRef.current?.restoreState(report.state)) push(`loaded "${report.name}"`);
  };
  const rename = () => {
    if (!selected || !name.trim()) return;
    setReports((list) => list.map((r) => (r.name === selected ? { ...r, name: name.trim() } : r)));
    push(`renamed "${selected}" to "${name.trim()}"`);
    setSelected(name.trim());
  };
  const remove = () => {
    setReports((list) => list.filter((r) => r.name !== selected));
    push(`deleted "${selected}"`);
    setSelected('');
  };

  const toolbar: (PivotToolbarItemId | PivotToolbarItem)[] = [
    'fieldList',
    'totals',
    'subtotals',
    'grandTotals',
    'formatting',
    'export',
    'expandAll',
    'collapseAll',
    { id: 'new', label: 'New report', onClick: () => tableRef.current?.restoreState({ version: 1, pivotModel: { ...tableRef.current.pivot.model, rows: [], columns: [], values: [], filters: [] } }) },
  ];

  return (
    <div>
      <div className="demo-toolbar" role="group" aria-label="Export from code">
        <Button variant="outline" onClick={() => void tableRef.current?.exportToExcel({ fileName: 'sales' })}>
          exportToExcel()
        </Button>
        <Button variant="outline" onClick={() => void tableRef.current?.exportToCsv({ fileName: 'sales' })}>
          exportToCsv()
        </Button>
        <Button variant="outline" onClick={() => void tableRef.current?.exportToPdf({ fileName: 'sales' })}>
          exportToPdf()
        </Button>
        <Button variant="outline" onClick={() => void tableRef.current?.print()}>
          print()
        </Button>
        <Checkbox checked={cancelExports} onCheckedChange={(checked) => setCancelExports(checked)}>
          Cancel exports in onBeforeExport
        </Checkbox>
      </div>
      <div className="demo-toolbar" role="group" aria-label="Reports">
        <label>
          Report name
          <TextField aria-label="Report name" value={name} onValueChange={(next) => setName(next)} style={{ inlineSize: '12em' }} />
        </label>
        <Button variant="outline" onClick={save}>
          Save
        </Button>
        <label>
          Saved
          <Select aria-label="Saved" data={[{ value: '', label: '(none)' }, ...reports.map((r) => ({ value: r.name, label: r.name }))]} value={selected} onValueChange={(next) => setSelected(next == null ? '' : String(next))} />
        </label>
        <Button variant="outline" onClick={load} disabled={!selected}>
          Load
        </Button>
        <Button variant="outline" onClick={rename} disabled={!selected}>
          Rename to name
        </Button>
        <Button variant="outline" onClick={remove} disabled={!selected}>
          Delete
        </Button>
      </div>
      <PivotTable<Sale>
        ref={tableRef}
        data={SALES}
        fields={FIELDS}
        defaultPivotModel={MODEL}
        toolbar={toolbar}
        fieldList="popup"
        exportWriters={WRITERS}
        // The model is saved under `salmon-pivot-table:docs-toolbar-export` and restored on the next visit.
        persistState={{ id: 'docs-toolbar-export', version: '1' }}
        onBeforeExport={(event) => {
          if (cancelExports) {
            event.preventDefault();
            push(`${event.format} export cancelled`);
          }
        }}
        onExport={(event) => push(`exported ${event.format}: ${event.fileName}`)}
        locale="en-US"
        height={320}
        aria-label="Sales report"
      />
      <div className="demo-log" aria-label="Export and report log">
        {log.length ? (
          <ol>
            {log.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ol>
        ) : (
          'Export from the toolbar or the buttons, or save a report, change the layout and load it back. Reload the page: the last report is restored.'
        )}
      </div>
    </div>
  );
}
