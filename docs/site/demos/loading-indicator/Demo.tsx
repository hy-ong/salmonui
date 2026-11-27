'use client';

import { useRef, useState } from 'react';
import { createControlledDataSource } from '@salmonui/data';
import type { DataSourceRequest } from '@salmonui/core/data';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridLoadingContext } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 160 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

const paging = { pageSize: 10 };

const INDICATORS = [
  { value: 'spinner', label: 'spinner' },
  { value: 'skeleton', label: 'skeleton' },
];

/** Every read of the demo "server" takes this long, so each loading phase stays on screen. */
const LATENCY = 700;

function renderLoading({ phase }: DataGridLoadingContext) {
  return <span className="demo-loading">Loading ({phase})…</span>;
}

/** An in-memory order table behind a controlled source with an artificial delay. */
function createServer(log: (entry: string) => void) {
  const table = createOrders(300, 71);
  const source = createControlledDataSource<Order>({
    onQueryChange: async (request: DataSourceRequest) => {
      const p = request.query.paging;
      const range = request.range ?? (p ? { start: (p.page - 1) * p.pageSize, end: p.page * p.pageSize } : { start: 0, end: table.length });
      log(`read: rows ${range.start + 1}-${Math.min(range.end, table.length)}`);
      await new Promise((resolve) => setTimeout(resolve, LATENCY));
      return { version: request.version, rows: table.slice(range.start, range.end), totalRowCount: table.length };
    },
  });
  // A change the grid is not told about: only refresh() shows it.
  const touch = () => {
    // ORD-10001 is the second row (ids start at ORD-10000).
    const first = table[1]!;
    table[1] = { ...first, customer: `${first.customer.replace(/ \(changed\)$/, '')} (changed)` };
  };
  return { source, touch };
}

export default function LoadingIndicatorDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [log, push] = useEventLog();
  const [server] = useState(() => createServer(push));
  const [indicator, setIndicator] = useState<'spinner' | 'skeleton'>('spinner');
  const [custom, setCustom] = useState(false);
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.setLoading(true)}>
          setLoading(true)
        </Button>
        <Button variant="outline" onClick={() => api.current?.setLoading(false)}>
          setLoading(false)
        </Button>
        <Button variant="outline" onClick={server.touch}>
          Change ORD-10001 on the server
        </Button>
        <Button variant="outline" onClick={() => api.current?.refresh()}>
          refresh()
        </Button>
        <label>
          loadingIndicator{' '}
          <Select aria-label="loadingIndicator" data={INDICATORS} value={indicator} onValueChange={(value) => value != null && setIndicator(value as 'spinner' | 'skeleton')} />
        </label>
        <Checkbox checked={custom} onCheckedChange={(checked) => setCustom(checked)}>
          renderLoading
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Orders from a slow source with a loading indicator"
        data={server.source}
        columns={columns}
        paging={paging}
        loadingIndicator={indicator}
        {...(custom ? { renderLoading } : {})}
        height={340}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onViewChange={(e) => push(`onViewChange: ${e.reason}, ${e.rowCount} of ${e.totalRowCount} rows`)}
      />
      <p className="demo-status">Every read takes {LATENCY} ms. Change the page to see the indicator; refresh() re-reads the current page.</p>
      <EventLog entries={log} />
    </>
  );
}
