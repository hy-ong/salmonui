'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridDetailContext, type DataGridSelection } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { cellHash } from '../../lib/fixtures';

// 2,000 rows by 80 editable center columns (plus the pinned #): the center zone is
// column-virtualized. Every column feature below works on columns outside the
// rendered window, because the engine addresses them by column id.
type Row = { readonly id: number } & Record<string, number | string>;

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
const COLUMN_COUNT = 80;

const rows: Row[] = [];
for (let r = 0; r < 2_000; r++) {
  const row: Record<string, number | string> = { id: r };
  for (let c = 1; c <= COLUMN_COUNT; c++) row[`c${c}`] = c % 4 === 0 ? `${WORDS[cellHash(r, c) % WORDS.length]}-${r % 97}` : cellHash(r, c) % 100_000;
  rows.push(row as Row);
}

const leaf = (c: number): DataGridColumn<Row> =>
  c % 4 === 0 ? { field: `c${c}`, header: `Text ${c}`, width: 120 } : { field: `c${c}`, header: `Value ${c}`, type: 'number', format: 'N0', align: 'end', width: 110 };

// Stacked headers: one group per ten leaves; the groups virtualize by leaf range.
const columns: DataGridColumn<Row>[] = [{ field: 'id', header: '#', primaryKey: true, width: 80, pinned: 'start', type: 'number' }];
for (let block = 0; block < COLUMN_COUNT / 10; block++) {
  columns.push({ id: `block${block + 1}`, header: `Block ${block + 1}`, columns: Array.from({ length: 10 }, (_, i) => leaf(block * 10 + i + 1)) });
}

const selection: DataGridSelection = { mode: 'cell', multiple: true, cellRange: 'box' };
const editing = { mode: 'batch' as const, fillHandle: true, confirmDiscard: false, guardUnsaved: false };
const toolbar = ['save', 'cancel', 'copy', 'print'] as const;
const renderDetail = ({ row }: DataGridDetailContext<Row>) => (
  <div style={{ padding: 12 }}>
    Row {row.id}: first column {String(row['c1'])}, last column {String(row[`c${COLUMN_COUNT}`])}. The detail row spans every column and stays in view while the columns scroll.
  </div>
);

export default function ColumnVirtualizationDemo() {
  const api = useRef<DataGridApi<Row> | null>(null);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.scrollToColumn('c75')}>
          Scroll to column 75
        </Button>
        <Button variant="outline" onClick={() => api.current?.scrollToColumn('c1')}>
          Back to the first column
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            api.current?.autoSizeColumns();
            // Column 80 was never rendered: its width comes from its values, not from the DOM.
            const width = api.current?.getState().columns?.find((c) => c.id === 'c80')?.width;
            push(`autofit all: Text 80 went from 120 px to ${width ?? 120} px`);
          }}
        >
          Autofit all columns
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            api.current?.selectCellRange({ rowId: '0', field: 'c1' }, { rowId: '2', field: `c${COLUMN_COUNT}` });
            api.current?.copy();
          }}
        >
          Copy rows 0-2 over all columns
        </Button>
        <Button variant="outline" onClick={() => api.current?.openColumnMenu('c75')}>
          Column menu of column 75
        </Button>
      </div>
      <DataGrid<Row>
        aria-label="2,000 rows by 81 columns with column virtualization"
        data={rows}
        columns={columns}
        height={420}
        rowHeight={32}
        locale="en-US"
        ref={api}
        resizable
        reorderable
        columnMenu
        grouping
        selection={selection}
        editing={editing}
        toolbar={toolbar}
        renderDetail={renderDetail}
        onBeforeCopy={(e) => push(`copied ${e.rowIds.length} rows x ${e.fields.length} columns (${e.data.length} characters)`)}
        onGroupChange={(e) => push(`grouped by: ${e.groupBy.join(', ') || 'none'}`)}
        onColumnResizeEnd={(e) => push(`resized ${e.field} to ${e.width} px`)}
        onColumnDrop={(e) => push(`moved ${e.field} to index ${e.toIndex}`)}
      />
      <p className="demo-status">Scroll sideways: only the visible columns render, yet autofit, copy, print, grouping and the fill handle cover all 80 columns.</p>
      <EventLog entries={log} />
    </>
  );
}
