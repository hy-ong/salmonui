'use client';

import { useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi } from '@salmonui/data-grid';
import { createWideRows, type WideRow } from '../../lib/fixtures';
import { createWideColumns } from '../../lib/wide';

const rows = createWideRows(1_000_000);
const columns = createWideColumns(8);

export default function MillionRowsDemo() {
  const api = useRef<DataGridApi<WideRow> | null>(null);
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.scrollToRow('999999', { align: 'end' })}>
          Scroll to the last row
        </Button>
        <Button variant="outline" onClick={() => api.current?.scrollToRow('0')}>
          Back to the top
        </Button>
      </div>
      {/* A percentage height needs a parent with a fixed height. */}
      <div className="demo-fill">
        <DataGrid<WideRow> aria-label="One million rows" data={rows} columns={columns} height="100%" locale="en-US" ref={api} />
      </div>
    </>
  );
}
