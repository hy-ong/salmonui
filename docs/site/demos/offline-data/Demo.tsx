'use client';

import { useState } from 'react';
import { createOfflineDataSource } from '@salmonui/data';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { useDemoStore } from '../../components/demo-kit';
import { demoFetch, type RemoteOrder } from '../../lib/remote';

const columns: DataGridColumn<RemoteOrder>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

export default function OfflineDataDemo() {
  const [status, statusStore] = useDemoStore('Loading…');
  const [source] = useState(() =>
    createOfflineDataSource<RemoteOrder>({
      // One fetch, then sorting and filtering run locally. Server rendering
      // leaves the load pending (demoFetch); the browser loads after hydration.
      load: async (signal) => {
        const response = await demoFetch('/api/orders?limit=3000', { signal: signal as AbortSignal });
        const rows = (await response.json()) as RemoteOrder[];
        statusStore.set(`Loaded ${rows.length} rows once; sorting and filtering are local.`);
        return rows;
      },
      onError: (error) => statusStore.set(`Load failed: ${String(error)}`),
    }),
  );
  return (
    <>
      <DataGrid<RemoteOrder>
        aria-label="Orders loaded once and queried offline"
        data={source}
        columns={columns}
        sorting
        filtering
        height={340}
        locale="en-US"
        currency="USD"
      />
      <p className="demo-status" role="status">
        {status}
      </p>
    </>
  );
}
