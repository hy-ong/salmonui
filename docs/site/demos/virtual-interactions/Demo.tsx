'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridSelection } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createWideRows, type WideRow } from '../../lib/fixtures';
import { createWideColumns } from '../../lib/wide';

const rows = createWideRows(100_000);

// 100 columns; the row number and the last column are pinned, every other column is column-virtualized.
const columns: DataGridColumn<WideRow>[] = createWideColumns(100).map((column, index, all) =>
  index === 0 ? { ...column, pinned: 'start' } : index === all.length - 1 ? { ...column, pinned: 'end' } : column,
);
// A merged "block" column: ten rows share a block, so row spans run through the virtualized rows.
columns.splice(1, 0, { id: 'block', header: 'Block', width: 100, rowSpan: true, valueGetter: (row) => `B${Math.floor(row.id / 10)}` });

const selection: DataGridSelection = { mode: 'cell', multiple: true };

export default function VirtualInteractionsDemo() {
  const api = useRef<DataGridApi<WideRow> | null>(null);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.scrollToRow('60005', { align: 'start' })}>
          Scroll to row 60,005
        </Button>
        <Button variant="outline"
          onClick={() => {
            // The serialized selection holds ranges by row id and column id, never a list of every cell.
            push(`selection: ${JSON.stringify(api.current?.getSelection()?.cellRanges ?? null)}; focused ${JSON.stringify(api.current?.getFocusedCell() ?? null)}`);
          }}
        >
          Read the selection
        </Button>
      </div>
      <DataGrid<WideRow>
        aria-label="100,000 rows by 101 columns with pinned columns, row spans and cell selection"
        data={rows}
        columns={columns}
        height={380}
        rowHeight={32}
        locale="en-US"
        selection={selection}
        ref={api}
      />
      <p className="demo-status">Click a cell, scroll far away and Shift+click another: the range spans unrendered rows. Ctrl+End (Cmd+End) jumps to the last cell; the pinned columns stay rendered while the center columns scroll.</p>
      <EventLog entries={log} />
    </>
  );
}
