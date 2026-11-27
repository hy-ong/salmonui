'use client';

import { useRef, useState } from 'react';
import type { ColumnDef } from '@salmonui/data-grid/engine';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, downloadBlob, serializeDataGridState, type DataGridApi, type DataGridColumn, type DataGridExportWriters, type DataGridTreeFilterMode } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { TextArea } from '@salmonui/inputs/text-field';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Part {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly qty: number;
  readonly unitCost: number;
}

// A bill of materials as flat self-referential rows.
const parts: Part[] = [
  { id: 'bike', parentId: null, name: 'City bike', qty: 1, unitCost: 0 },
  { id: 'frame', parentId: 'bike', name: 'Frame set', qty: 1, unitCost: 0 },
  { id: 'frame-tube', parentId: 'frame', name: 'Aluminium frame', qty: 1, unitCost: 120 },
  { id: 'frame-fork', parentId: 'frame', name: 'Fork', qty: 1, unitCost: 45 },
  { id: 'wheels', parentId: 'bike', name: 'Wheel set', qty: 1, unitCost: 0 },
  { id: 'wheel-rim', parentId: 'wheels', name: 'Rim', qty: 2, unitCost: 28 },
  { id: 'wheel-spokes', parentId: 'wheels', name: 'Spoke', qty: 64, unitCost: 0.4 },
  { id: 'wheel-tyre', parentId: 'wheels', name: 'Tyre', qty: 2, unitCost: 22 },
  { id: 'drive', parentId: 'bike', name: 'Drivetrain', qty: 1, unitCost: 0 },
  { id: 'drive-chain', parentId: 'drive', name: 'Chain', qty: 1, unitCost: 18 },
  { id: 'drive-hub', parentId: 'drive', name: 'Hub gear', qty: 1, unitCost: 140 },
  { id: 'lights', parentId: null, name: 'Light kit', qty: 1, unitCost: 0 },
  { id: 'lights-front', parentId: 'lights', name: 'Front light', qty: 1, unitCost: 25 },
  { id: 'lights-rear', parentId: 'lights', name: 'Rear light', qty: 1, unitCost: 12 },
];

// Core column definitions: the same array serves the grid and the server export below.
const coreColumns: ColumnDef<Part>[] = [
  { field: 'name', header: 'Part', width: 220 },
  { field: 'id', header: 'Part no.', primaryKey: true, width: 130 },
  { field: 'qty', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'unitCost', header: 'Unit cost', type: 'number', format: 'C2', align: 'end', width: 110 },
];
const columns: DataGridColumn<Part>[] = coreColumns;

const tree = { parentIdField: 'parentId', defaultExpanded: 2 } as const;

// Module-level: the dynamic imports keep both writers out of the page bundle until first use.
const writers: DataGridExportWriters = {
  excel: () => import('@salmonui/export/xlsx'),
  pdf: () => import('@salmonui/export/pdf'),
};

const ROWS_OPTIONS = [
  { value: 'expanded', label: 'Expanded (visible rows)' },
  { value: 'all', label: 'All, collapsed included' },
];

const COPY_ADDS_OPTIONS = [
  { value: 'ancestors', label: 'ancestors' },
  { value: 'descendants', label: 'descendants' },
  { value: 'both', label: 'both' },
  { value: 'none', label: 'none' },
];

export default function TreeExportPrintDemo() {
  const api = useRef<DataGridApi<Part> | null>(null);
  const [scope, setScope] = useState<'expanded' | 'all'>('expanded');
  const [copyMode, setCopyMode] = useState<DataGridTreeFilterMode>('ancestors');
  const [copied, setCopied] = useState('');
  const [log, push] = useEventLog();

  // Server export: `exportToResponse` from `@salmonui/data-grid/engine/export-server` takes the
  // rows, the core columns, the same `tree` options and the client state (expansion included). In
  // an app it runs in a route handler; this static site runs it in the tab, as its demo backend does.
  const serverExport = async () => {
    const grid = api.current;
    if (!grid) return;
    const { exportToResponse } = await import('@salmonui/data-grid/engine/export-server');
    const response = await exportToResponse(
      { rows: parts, columns: coreColumns, tree, state: serializeDataGridState(grid.getState()), locale: 'en-US', currency: 'EUR' },
      { format: 'excel', fileName: 'bill-of-materials-server', tree: scope, outlineCollapsed: true },
    );
    if (!response) return;
    const blob = await response.blob();
    push(`server export (${scope}): ${blob.size} bytes`);
    downloadBlob(blob, 'bill-of-materials-server.xlsx');
  };

  return (
    <>
      <div className="demo-toolbar" aria-label="Export and print">
        <label>
          Rows
          <Select aria-label="Rows" data={ROWS_OPTIONS} value={scope} onValueChange={(value) => value != null && setScope(value as 'expanded' | 'all')} />
        </label>
        <Button variant="outline" onClick={() => void api.current?.exportToExcel({ fileName: 'bill-of-materials', tree: scope, outlineCollapsed: true }).then(() => push(`Excel (${scope}): outline per depth`))}>
          Excel
        </Button>
        <Button variant="outline" onClick={() => void api.current?.exportToCsv({ fileName: 'bill-of-materials', tree: scope, treeDepthColumn: 'Level' }).then(() => push(`CSV (${scope}) with a Level column`))}>
          CSV
        </Button>
        <Button variant="outline" onClick={() => void api.current?.exportToPdf({ fileName: 'bill-of-materials', tree: scope, header: 'Bill of materials' }).then(() => push(`PDF (${scope}): indented tree column`))}>
          PDF
        </Button>
        <Button variant="outline" onClick={() => void serverExport()}>
          Server Excel
        </Button>
        <Button variant="outline" onClick={() => api.current?.print({ tree: scope })}>
          Print
        </Button>
      </div>
      <div className="demo-toolbar">
        <label>
          Copy adds
          <Select aria-label="Copy adds" data={COPY_ADDS_OPTIONS} value={copyMode} onValueChange={(value) => value != null && setCopyMode(value as DataGridTreeFilterMode)} />
        </label>
        <Button variant="outline" onClick={() => push(`copy(): ${api.current?.copy().status ?? 'no grid'}`)}>
          Copy selected rows
        </Button>
      </div>
      <DataGrid<Part>
        ref={api}
        aria-label="Bill of materials"
        data={parts}
        columns={columns}
        getRowId={(row) => row.id}
        tree={{ ...tree, copyMode }}
        selection={{ mode: 'row', multiple: true }}
        // Read-only copy: `editing` registers the clipboard; every edit capability is off.
        editing={{ edit: false, add: false, delete: false }}
        exportWriters={writers}
        height={380}
        locale="en-US"
        currency="EUR"
        onBeforeCopy={(event) => setCopied(event.data)}
      />
      <label className="demo-status" style={{ display: 'grid', gap: 'var(--salmon-space-2)', justifyItems: 'start' }}>
        Last copy (TSV)
        <TextArea aria-label="Last copy" readOnly rows={5} value={copied} style={{ inlineSize: 'min(100%, 36rem)' }} />
      </label>
      <p className="demo-status">
        Collapse Wheel set, then export with each row scope. Excel writes an outline level per depth and, with all rows, keeps collapsed parents collapsed; PDF and print indent the Part column. Select Spoke and press Ctrl+C or Copy: the copy adds the rows the copy mode names.
      </p>
      <EventLog entries={log} />
    </>
  );
}
