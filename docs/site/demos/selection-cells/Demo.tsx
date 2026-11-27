'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createWideRows, type WideRow } from '../../lib/fixtures';
import { createWideColumns } from '../../lib/wide';

// Cell selection over 50,000 virtualized rows and 40 virtualized columns.
const rows = createWideRows(50_000);
const columns: DataGridColumn<WideRow>[] = createWideColumns(40);

type Mode = 'cell' | 'both';
type CellMode = 'flow' | 'box' | 'boxWithBorder';
const MODES = [
  { value: 'cell', label: 'cell' },
  { value: 'both', label: 'both' },
];
const CELL_MODES = [
  { value: 'flow', label: 'flow' },
  { value: 'box', label: 'box' },
  { value: 'boxWithBorder', label: 'boxWithBorder' },
];

export default function SelectionCellsDemo() {
  const api = useRef<DataGridApi<WideRow> | null>(null);
  const [mode, setMode] = useState<Mode>('cell');
  const [cellMode, setCellMode] = useState<CellMode>('box');
  const [columnSelection, setColumnSelection] = useState(true);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <label>
          mode
          <Select aria-label="mode" data={MODES} value={mode} onValueChange={(value) => value != null && setMode(value as Mode)} />
        </label>
        <label>
          cell range
          <Select aria-label="cell range" data={CELL_MODES} value={cellMode} onValueChange={(value) => value != null && setCellMode(value as CellMode)} />
        </label>
        <Checkbox checked={columnSelection} onCheckedChange={(checked) => setColumnSelection(checked)}>
          Column selection
        </Checkbox>
        <Button variant="outline" onClick={() => api.current?.selectCellRange({ rowId: '10', field: 'n1' }, { rowId: '40000', field: 'n5' })}>
          Select rows 10–40,000 × columns 1–5
        </Button>
        <Button variant="outline" onClick={() => api.current?.selectCells([{ rowId: '3', field: 'n2' }], { mode: 'add' })}>
          Add cell (3, Value 2)
        </Button>
        <Button variant="outline" onClick={() => api.current?.selectColumns('s3', { mode: 'toggle' })}>
          Toggle column Text 3
        </Button>
        <Button variant="outline" onClick={() => api.current?.clearSelection({ cells: true, columns: true })}>
          Clear cells and columns
        </Button>
        <Button variant="outline" onClick={() => push(`summary: ${JSON.stringify(api.current?.getSelectionSummary() ?? null)}`)}>
          Read summary
        </Button>
      </div>
      <DataGrid<WideRow>
        key={`${mode}-${cellMode}-${columnSelection}`}
        aria-label="Cell selection over a virtualized grid"
        data={rows}
        columns={columns}
        height={360}
        locale="en-US"
        ref={api}
        selection={{ multiple: true, mode, cellRange: cellMode, columns: columnSelection }}
      />
      <p className="demo-status">
        Click a cell, then Shift+click or Shift+Arrow to extend; Ctrl/⌘+click adds cells; Ctrl/⌘+A selects all; Escape clears.
      </p>
      <EventLog entries={log} />
    </>
  );
}
