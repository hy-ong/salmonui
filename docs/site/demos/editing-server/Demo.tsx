'use client';

import { useState } from 'react';
import { createLocalDataSource, type DataSource } from '@salmonui/data-grid/engine';
import { type WriteRequest, type WriteResult } from '@salmonui/core/data';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useDemoStore, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const OUTCOMES = [
  { value: 'reject-names', label: 'rejects names containing “reject”' },
  { value: 'accept', label: 'accepts everything' },
  { value: 'offline', label: 'offline (request fails)' },
];

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 170, validation: { required: true } },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Outcome = 'accept' | 'reject-names' | 'offline';

/**
 * A simulated server behind `dataSource.write()`: every save is one request
 * with `added`, `changed` and `deleted`. The server rejects
 * customer names containing "reject" with a field error (partial write) or
 * fails the whole request while "offline"; the grid keeps the drafts with the
 * errors.
 */
function createDemoServer(outcome: { current: Outcome }, push: (entry: string) => void): DataSource<Order> {
  const store = createLocalDataSource(createOrders(80, 13), { getRowId: (row) => row.id });
  return {
    mode: 'local',
    read: (request) => store.read(request),
    subscribe: (listener) => store.subscribe(listener),
    capabilities: { write: true },
    async write(request: WriteRequest<Order>): Promise<WriteResult<Order>> {
      push(`write (${request.mode}): +${request.added.length} ~${request.changed.length} −${request.deleted.length}`);
      await delay(500);
      if (outcome.current === 'offline') {
        push('write failed: server unavailable');
        throw new Error('Server unavailable');
      }
      const rejected = outcome.current === 'reject-names' ? request.changed.filter((c) => c.row.customer.toLowerCase().includes('reject')) : [];
      if (rejected.length === 0) {
        push('write applied');
        return store.write(request);
      }
      const accepted = await store.write({ ...request, changed: request.changed.filter((c) => !rejected.includes(c)) });
      push(`write partial: rejected ${rejected.map((c) => c.rowId).join(', ')}`);
      return {
        ...accepted,
        status: 'partial',
        changed: accepted.changed ?? [],
        cellErrors: Object.fromEntries(rejected.map((c) => [`${c.rowId}:customer`, ['The server rejected this customer name.']])),
      };
    },
  };
}

export default function EditingServerDemo() {
  const [log, push] = useEventLog();
  const [outcome, outcomeStore] = useDemoStore<Outcome>('reject-names');
  // A mutable box the data source reads at write time (the source is created once).
  const [box] = useState<{ current: Outcome }>(() => ({ current: 'reject-names' }));
  const [source] = useState(() => createDemoServer(box, push));
  const choose = (next: Outcome) => {
    box.current = next;
    outcomeStore.set(next);
  };
  return (
    <>
      <div className="demo-toolbar">
        <label>
          server
          <Select aria-label="server" data={OUTCOMES} value={outcome} onValueChange={(value) => value != null && choose(value as Outcome)} />
        </label>
      </div>
      <DataGrid<Order>
        aria-label="Orders saved through dataSource.write"
        data={source}
        columns={columns}
        height={320}
        locale="en-US"
        currency="USD"
        editing={{ mode: 'batch', confirmDiscard: false }}
        toolbar={['add', 'delete', 'save', 'cancel']}
      />
      <p className="demo-status">
        Edit a few customers (type “reject” in one), then Save: one request carries every change. Pending cells show
        while the request runs; rejected cells keep their draft with the server message.
      </p>
      <EventLog entries={log} label="Server requests" />
    </>
  );
}
