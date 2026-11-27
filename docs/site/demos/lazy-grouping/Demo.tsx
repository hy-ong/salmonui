'use client';

import { useRef, useState } from 'react';
import { createJsonDataSource } from '@salmonui/data';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridAggregateRow, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { demoFetch, type RemoteOrder } from '../../lib/remote';

const columns: DataGridColumn<RemoteOrder>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'city', header: 'City', width: 130 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 140 },
];

// Caption aggregates are computed by the server and arrive with the group captions.
const aggregates: DataGridAggregateRow<RemoteOrder>[] = [
  { columns: [{ field: 'amount', type: 'sum', format: 'C0', renderGroupCaption: ({ formatted }) => <span>Σ {formatted['sum']}</span> }] },
];

// Initial grouping; a constant (the options prop is reactive).
const grouping = { groupBy: ['country', 'city'], lazy: true, lazyChunkSize: 50 };
// with paging, each root request pages the top-level groups.
const paging = { pageSize: 3 };
// with infiniteScroll, scrolling near the end of a group's
// loaded rows appends its next chunk (Load more stays for the keyboard).
const infiniteScroll = { threshold: 10 };

export default function LazyGroupingDemo() {
  const api = useRef<DataGridApi<RemoteOrder> | null>(null);
  const [log, push] = useEventLog();
  const [bigOnly, setBigOnly] = useState(false);
  const [paged, setPaged] = useState(false);
  const [onScroll, setOnScroll] = useState(false);
  const [source] = useState(() =>
    createJsonDataSource<RemoteOrder>({
      url: '/api/orders?delay=300',
      fetch: demoFetch,
      key: 'id',
      // The group requests: group path and page travel in one request.
      onRequest: (event) => {
        const wire = event.request as { groupPath?: { key: unknown }[]; query?: { page?: unknown } };
        if (wire.groupPath) push(`group [${wire.groupPath.map((s) => String(s.key)).join(' / ')}] page ${JSON.stringify(wire.query?.page ?? null)}`);
      },
      onResponse: (event) => push(`${event.kind}: ${Math.round(event.durationMs)} ms`),
    }),
  );
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox
          checked={bigOnly}
          onCheckedChange={(checked) => {
            setBigOnly(checked);
            if (checked) api.current?.filterColumn('amount', 'greaterThan', 500);
            else api.current?.clearFiltering();
          }}
        >
          Amount &gt; 500 (reloads loaded groups)
        </Checkbox>
        <Checkbox
          checked={paged}
          onCheckedChange={(checked) => {
            setPaged(checked);
            setOnScroll(false);
            setBigOnly(false);
          }}
        >
          Page the countries (3 per page)
        </Checkbox>
        <Checkbox
          checked={onScroll}
          onCheckedChange={(checked) => {
            setOnScroll(checked);
            setPaged(false);
            setBigOnly(false);
          }}
        >
          Load more on scroll (infiniteScroll)
        </Checkbox>
      </div>
      {/* Paging and infinite scroll are modules chosen at mount, so switching them remounts the grid (key). */}
      <DataGrid<RemoteOrder>
        key={paged ? 'paged' : onScroll ? 'infinite' : 'scrolling'}
        aria-label="Lazily loaded order groups"
        data={source}
        columns={columns}
        sorting
        filtering
        height={400}
        locale="en-US"
        currency="USD"
        ref={api}
        aggregates={aggregates}
        grouping={grouping}
        {...(paged ? { paging } : {})}
        {...(onScroll ? { infiniteScroll } : {})}
        onGroupToggle={(event) => push(`${event.expanded ? 'expand' : 'collapse'} ${event.path.map((p) => String(p.key)).join(' / ')} (lazy: ${event.lazy})`)}
      />
      <EventLog entries={log} label="Requests and group events" />
    </>
  );
}
