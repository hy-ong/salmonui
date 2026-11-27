'use client';

import { useMemo, useState } from 'react';
import { createJsonDataSource, type WireReadRequest } from '@salmonui/data';
import { DataGrid, type DataGridColumn, type DataGridFiltering } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { demoFetch, type RemoteOrder } from '../../lib/remote';

const columns: DataGridColumn<RemoteOrder>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  // An Excel filter over a remote source: its values come from facet requests.
  { field: 'customer', header: 'Customer', width: 150, filter: { ui: 'excel' } },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 80 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

// Initial filters with a nested OR group: (Japan OR Malaysia) AND amount >= 100.
// They are part of the first request; constants (the options props are reactive).
const filtering: DataGridFiltering = {
  ui: 'row',
  // Checklist values load 4 at a time (the next 4 as the list scrolls).
  checklistPageSize: 4,
  filters: [
    {
      logic: 'or',
      filters: [
        { field: 'country', operator: 'equal', value: 'Japan' },
        { field: 'country', operator: 'equal', value: 'Malaysia' },
      ],
    },
    { field: 'amount', operator: 'greaterThanOrEqual', value: 100 },
  ],
};
const paging = { pageSize: 20 };
type LoadingIndicator = NonNullable<DataGridFiltering['loadingIndicator']>;
const INDICATORS = [
  { value: 'skeleton', label: 'Skeleton' },
  { value: 'spinner', label: 'Spinner' },
];

/** The query part of a read request, as sent on the wire. */
function describe(request: WireReadRequest): string {
  const { where, search, page } = request.query;
  return JSON.stringify({ where, search, page });
}

export default function RemoteQueryDemo() {
  const [log, push] = useEventLog();
  // filtering.loadingIndicator: what the Excel filter shows while its values load.
  const [indicator, setIndicator] = useState<LoadingIndicator>('skeleton');
  // Same `filters` array: a new indicator does not re-apply the filters.
  const options = useMemo<DataGridFiltering>(() => ({ ...filtering, loadingIndicator: indicator }), [indicator]);
  // Created once per mounted grid (data sources are initial-only).
  const [source] = useState(() =>
    createJsonDataSource<RemoteOrder>({
      url: '/api/orders?delay=120',
      fetch: demoFetch,
      key: 'id',
      onRequest: (event) => {
        if (event.kind === 'facet') push(`facet: ${JSON.stringify((event.request as WireReadRequest).facet)}`);
        else if ('query' in event.request) push(`${event.kind}: ${describe(event.request)}`);
      },
    }),
  );
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Filter values loading{' '}
          <Select aria-label="Filter values loading" data={INDICATORS} value={indicator} onValueChange={(value) => value != null && setIndicator(value as LoadingIndicator)} />
        </label>
      </div>
      <DataGrid<RemoteOrder>
        aria-label="Remote orders filtered and searched on the server"
        data={source}
        columns={columns}
        filtering={options}
        search
        toolbar={['search']}
        paging={paging}
        height={360}
        locale="en-US"
        currency="USD"
      />
      <p className="demo-status">Filter, search or page: each change is one request carrying the whole query.</p>
      <EventLog entries={log} label="Requests" />
    </>
  );
}
