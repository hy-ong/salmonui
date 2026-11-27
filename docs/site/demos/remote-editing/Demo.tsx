'use client';

import { useState } from 'react';
import { createJsonDataSource, isWireWriteRequest, ProtocolError, type JsonTransport } from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridColumn, type DataGridEditing } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders } from '../../lib/fixtures';
import type { RemoteOrder } from '../../lib/remote';

const FIELDS = ['id', 'customer', 'country', 'quantity', 'unitPrice'] as const;
type EditableOrder = Pick<RemoteOrder, (typeof FIELDS)[number]>;

const columns: DataGridColumn<EditableOrder>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 120 },
  { field: 'customer', header: 'Customer', width: 160, validation: { required: true } },
  { field: 'country', header: 'Country', width: 130 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 90, defaultValue: 1 },
  { field: 'unitPrice', header: 'Price', type: 'number', format: 'C2', align: 'end', width: 110, defaultValue: 10 },
];

let nextId = 30_000;
const editing: DataGridEditing<EditableOrder> = {
  mode: 'batch',
  confirmDelete: false,
  newRow: () => ({ id: `ORD-${nextId++}`, customer: 'New customer', country: 'Malaysia' }),
};

/**
 * The "server": the reference protocol handler from `@salmonui/data/server`
 * over a private copy of 200 orders, reached through its in-process
 * transport with 120 ms of latency. A private table per mounted demo keeps
 * writes out of the shared /api/orders table.
 */
function createServer(log: (entry: string) => void): { transport: JsonTransport; failNextWrite(): void } {
  const rows = createOrders(200, 5).map(({ id, customer, country, quantity, unitPrice }) => ({ id, customer, country, quantity, unitPrice }));
  const inner = createJsonQueryHandler(rows, { key: 'id', fields: FIELDS }).transport();
  let fail = false;
  const transport: JsonTransport = async (request, ctx) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (isWireWriteRequest(request)) {
      const { added, changed, removed } = request.write;
      log(`write: ${added.length} added, ${changed.length} changed (${changed.map((c) => `${String(c.key)} ${Object.keys(c.set).join('+')}`).join(', ') || '-'}), ${removed.length} removed`);
      if (fail) {
        fail = false;
        log('write rejected by the server');
        throw new ProtocolError('unavailable', 'The orders service is unavailable');
      }
    }
    return inner(request, ctx);
  };
  return { transport, failNextWrite: () => void (fail = true) };
}

export default function RemoteEditingDemo() {
  const [log, push] = useEventLog();
  // Created once per mounted grid (data sources are initial-only).
  const [server] = useState(() => createServer(push));
  const [source] = useState(() => createJsonDataSource<EditableOrder>({ transport: server.transport, key: 'id', fields: FIELDS, rowShape: 'object' }));
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={server.failNextWrite}>
          Fail the next save
        </Button>
      </div>
      <DataGrid<EditableOrder>
        aria-label="Remote orders edited in batch mode"
        data={source}
        columns={columns}
        height={340}
        locale="en-US"
        currency="USD"
        editing={editing}
        toolbar={['add', 'delete', 'save', 'cancel']}
        // onSave fires once the write settled; status tells applied, partial, rejected and error apart.
        onSave={(e) => push(`save: +${e.added.length} ~${e.changed.length} −${e.deleted.length}, ${e.status}`)}
        onError={(e) => push(`onError (${e.action}): ${e.error.message}`)}
      />
      <p className="demo-status">Edit cells, add or delete rows, then Save: all pending changes go to the server as one write request.</p>
      <EventLog entries={log} label="Server requests" />
    </>
  );
}
