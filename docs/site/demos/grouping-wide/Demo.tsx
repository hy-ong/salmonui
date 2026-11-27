'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { createWideRows, type WideRow } from '../../lib/fixtures';
import { createWideColumns } from '../../lib/wide';

const rows = createWideRows(20_000);
const REGIONS = ['North', 'East', 'South', 'West'];
const TEAMS = ['Atlas', 'Borealis', 'Cobalt'];

// 80 columns: the center zone is column-virtualized while rows are grouped. The # column is
// pinned to the start; Region and Team are computed group keys.
const [first, ...rest] = createWideColumns(80);
const columns: DataGridColumn<WideRow>[] = [
  { ...(first as DataGridColumn<WideRow>), pinned: 'start' },
  { id: 'region', header: 'Region', width: 110, valueGetter: (row) => REGIONS[row.id % REGIONS.length] as string },
  { id: 'team', header: 'Team', width: 110, valueGetter: (row) => TEAMS[Math.floor(row.id / 4) % TEAMS.length] as string },
  ...rest,
];

// Initial grouping; a constant (the options prop is reactive).
const grouping = { groupBy: ['region', 'team'] };

export default function GroupingWideDemo() {
  const api = useRef<DataGridApi<WideRow> | null>(null);
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.scrollToColumn('n70')}>
          Scroll to column 70
        </Button>
        <Button variant="outline" onClick={() => api.current?.scrollToColumn('row')}>
          Back to the first column
        </Button>
      </div>
      <DataGrid<WideRow>
        aria-label="20,000 grouped rows by 80 columns"
        data={rows}
        columns={columns}
        grouping={grouping}
        height={400}
        rowHeight={32}
        locale="en-US"
        ref={api}
      />
      <p className="demo-status">Scroll sideways: the group indent, the captions and the pinned # column stay in place while only the visible columns render.</p>
    </>
  );
}
