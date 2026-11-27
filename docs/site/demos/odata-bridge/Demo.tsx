'use client';

import { useState } from 'react';
import { createJsonDataSource, encodeRows, HttpError, isWireWriteRequest, ProtocolError, type JsonTransport } from '@salmonui/data';
import { DataGrid, type DataGridColumn, type DataGridPaging } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { demoFetch, type RemoteOrder } from '../../lib/remote';

const FIELDS = ['id', 'customer', 'country', 'product', 'amount'] as const;

const columns: DataGridColumn<RemoteOrder>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

const paging: DataGridPaging = { pageSize: 10 };

/**
 * A user-written transport: maps each Salmon UI protocol read to an
 * OData-style GET (`$orderby`, `$skip`, `$top`, `$count`, `$select`) and the
 * OData `{ value, @odata.count }` body back to protocol tuples. The same shape
 * bridges Web API, OData v2/v3/v4 or GraphQL backends.
 */
function createODataTransport(log: (entry: string) => void): JsonTransport {
  return async (request, { signal }) => {
    if (isWireWriteRequest(request)) throw new ProtocolError('unsupported', 'This bridge is read-only.');
    const q = request.query;
    if (q.where || q.search || q.group) throw new ProtocolError('unsupported', 'This bridge maps sorting and paging only.');
    const params: [string, string][] = [];
    if (q.sort?.length) params.push(['$orderby', q.sort.map((s) => `${s.field} ${s.dir}`).join(',')]);
    if (q.page && 'offset' in q.page) params.push(['$skip', String(q.page.offset)], ['$top', String(q.page.limit)]);
    if (request.count !== false) params.push(['$count', 'true']);
    const fields = q.select ?? FIELDS;
    params.push(['$select', fields.join(',')]);
    log(`GET /api/odata/orders?${params.map(([k, v]) => `${k}=${v}`).join('&')}`);
    const url = `/api/odata/orders?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
    const response = await demoFetch(url, { signal: signal as AbortSignal });
    if (!response.ok) throw new HttpError(response.status, response.statusText ?? '', await response.text());
    const body = (await response.json()) as { value: Record<string, unknown>[]; '@odata.count'?: number };
    const { rows } = encodeRows(body.value, { fields });
    return { v: 1, id: request.id, fields, rows, ...(body['@odata.count'] !== undefined ? { total: body['@odata.count'] } : {}) };
  };
}

export default function ODataBridgeDemo() {
  const [log, push] = useEventLog();
  // Created once per mounted grid (data sources are initial-only).
  const [source] = useState(() =>
    createJsonDataSource<RemoteOrder>({
      transport: createODataTransport(push),
      key: 'id',
      fields: FIELDS,
      rowShape: 'object',
      paging: { kind: 'offset' },
    }),
  );
  return (
    <>
      <DataGrid<RemoteOrder>
        aria-label="Orders from an OData-style endpoint through a custom transport"
        data={source}
        columns={columns}
        sorting
        paging={paging}
        height={360}
        locale="en-US"
        currency="USD"
      />
      <p className="demo-status">Sort a column or change the page: each request below is what the transport sent to the OData-style endpoint.</p>
      <EventLog entries={log} label="OData requests" />
    </>
  );
}
