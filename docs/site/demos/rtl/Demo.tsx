'use client';

import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createWideRows, type WideRow } from '../../lib/fixtures';
import { createWideColumns } from '../../lib/wide';

const rows = createWideRows(10_000);
// `#` is pinned to the start (the right edge in RTL) and the last column to the
// end (the left edge); the rest scroll between them.
const columns: DataGridColumn<WideRow>[] = createWideColumns(30).map((column, index, all) =>
  index === 0 ? { ...column, pinned: 'start' } : index === all.length - 1 ? { ...column, pinned: 'end' } : column,
);

export default function RtlDemo() {
  const [log, push] = useEventLog();
  // The direction is inherited from an ancestor `dir` (or set with the `dir` prop).
  return (
    <>
      <div dir="rtl" lang="ar">
        <DataGrid<WideRow>
          aria-label="Right-to-left grid with column virtualization"
          data={rows}
          columns={columns}
          height={340}
          locale="en-US"
          resizable
          reorderable
          onColumnResizeEnd={(event) => push(`resize (${event.source}): ${event.field} ${Math.round(event.previousWidth)} → ${Math.round(event.width)}`)}
          onColumnReorder={(event) => push(`reorder (${event.source}): ${event.field} ${event.fromIndex} → ${event.toIndex}`)}
        />
      </div>
      {/* The log is English app text: it stays left to right outside the RTL subtree. */}
      <EventLog entries={log} />
    </>
  );
}
