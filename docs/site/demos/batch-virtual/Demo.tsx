'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

// 100,000 virtualized rows in batch mode: drafts live in the core edit
// module, keyed by row id, so they survive scrolling rows out of the DOM.
// Group captions are not records and never edit.
const orders = createOrders(100_000, 17);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 120 },
  { field: 'customer', header: 'Customer', width: 160 },
  { field: 'country', header: 'Country', width: 130 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80, validation: { min: 1 } },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

export default function BatchVirtualDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [grouped, setGrouped] = useState(false);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={grouped} onCheckedChange={(checked) => setGrouped(checked)}>
          Group by country
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => api.current?.scrollToRow('ORD-109999')}>
          Scroll to the last row
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.scrollToRow('ORD-10000')}>
          Scroll to the first row
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            const preview = api.current?.getBatchPreview();
            push(`pending: ${preview?.dirtyCellCount ?? 0} dirty cells, ${preview?.addedRowIds.length ?? 0} added, ${preview?.deletedRowIds.length ?? 0} deleted`);
          }}
        >
          Read pending changes
        </Button>
      </div>
      <DataGrid<Order>
        key={grouped ? 'grouped' : 'flat'}
        aria-label="Batch editing over 100,000 virtualized rows"
        data={orders}
        columns={columns}
        height={360}
        locale="en-US"
        currency="USD"
        ref={api}
        editing={{ mode: 'batch', confirmDiscard: false, guardUnsaved: false }}
        toolbar={['save', 'cancel']}
        {...(grouped ? { grouping: { groupBy: ['country'] } } : {})}
        onSave={(e) => push(`saved: ~${e.changed.length} rows`)}
      />
      <p className="demo-status">Edit a cell, scroll to the end and back: the draft and its mark stay. Group captions expand and collapse on Enter; they never open an editor.</p>
      <EventLog entries={log} />
    </>
  );
}
