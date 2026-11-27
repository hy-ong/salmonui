'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi } from '@salmonui/data-grid';
import { createWideRows, type WideRow } from '../../lib/fixtures';
import { createWideColumns } from '../../lib/wide';

const rows = createWideRows(100_000);
const columns = createWideColumns(100);

export default function VirtualizationDemo() {
  const api = useRef<DataGridApi<WideRow> | null>(null);
  const [range, setRange] = useState('');
  const readRange = () => {
    const current = api.current?.getRenderedRange();
    const cells = api.current?.element?.querySelectorAll('.salmon-data-grid-rows .salmon-data-grid-cell').length ?? 0;
    if (current) setRange(`rows ${current.rows.start}-${current.rows.end}, columns ${current.columns.start}-${current.columns.end}, ${cells} body cells in the DOM`);
  };
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.scrollToRow('50000', { align: 'center' })}>
          Scroll to row 50,000
        </Button>
        <Button variant="outline" onClick={() => api.current?.scrollToColumn('n80')}>
          Scroll to column 80
        </Button>
        <Button variant="outline" onClick={readRange}>
          Read rendered range
        </Button>
      </div>
      <DataGrid<WideRow>
        aria-label="100,000 rows by 100 columns"
        data={rows}
        columns={columns}
        height={420}
        rowHeight={32}
        locale="en-US"
        virtualization={{ rowOverscan: 6, columnOverscan: 2 }}
        ref={api}
      />
      <p className="demo-status" role="status">
        {range || 'Scroll the grid, then read the rendered range: the DOM only holds the viewport plus overscan.'}
      </p>
    </>
  );
}
