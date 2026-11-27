// Remote first page (client mount with the `remote` first page, mock server
// latency 0). The page
// generates the `remote` fixture (1,000,000 rows) before the mount, serves it
// through the `@salmonui/data/server` reference handler over an in-process
// transport (no network, latency 0) and mounts a DataGrid on `createJsonDataSource`.
//
//   ?mode=paging      server paging, page size 50 (default)
//   ?mode=infinite    infiniteScroll, blockSize 100
//   ?rows=<n>         fixture rows (default 1,000,000)
//
// window.__firstPageMs: from `root.render()` to the painted frame after the
// first data row is in the DOM. window.__serverMs: time spent in the handler
// (query + response serialization), which is server work, not client work.
// window.__readCount counts read requests. Setting window.__failReads = true makes
// every read reject (the default data error state).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { createJsonDataSource, type JsonTransport } from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';

interface Item {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly city: string;
  readonly amount: number;
  readonly ordered: Date;
  readonly active: boolean;
}

declare global {
  interface Window {
    // One program merges every page's Window globals; keep the shared ones identical.
    __gridApi?: DataGridApi<any> | null;
    __mountMs?: number;
    __firstPageMs?: number;
    __serverMs: number;
    __readCount: number;
    __failReads?: boolean;
  }
}

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'infinite' ? 'infinite' : 'paging';
const TOTAL = Number(params.get('rows') ?? 1_000_000);
const FIELDS = ['id', 'n', 'name', 'city', 'amount', 'ordered', 'active'];
const CITIES = ['Reims', 'Lyon', 'Bern', 'Graz', 'Porto', 'Turin', 'Ghent'];
const DATES = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)));

const data: Record<string, unknown>[] = new Array(TOTAL);
for (let i = 0; i < TOTAL; i++) {
  data[i] = { id: `r${i}`, n: i, name: `Customer ${i}`, city: CITIES[i % CITIES.length], amount: (i * 37) % 1000, ordered: DATES[(i * 7) % 365], active: i % 3 !== 0 };
}
const handler = createJsonQueryHandler(data, { key: 'id', fields: FIELDS, dict: ['city'] });

window.__serverMs = 0;
window.__readCount = 0;
// In-process transport: request and response go through JSON like a network hop; the
// handler and its response serialization are timed as server work.
const transport: JsonTransport = async (request, ctx) => {
  if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error('aborted');
  if (window.__failReads) throw new Error('The orders service is unavailable');
  const wire = JSON.parse(JSON.stringify(request));
  window.__readCount++;
  const t = performance.now();
  const body = JSON.stringify(handler.handle(wire));
  window.__serverMs += performance.now() - t;
  return JSON.parse(body);
};

const source = createJsonDataSource<Item>({ transport, key: 'id' });

const columns: DataGridColumn<Item>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 110 },
  { field: 'n', header: 'Row', type: 'number', width: 100 },
  { field: 'name', header: 'Name', width: 200 },
  { field: 'city', header: 'City', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'N0', width: 120 },
  { field: 'ordered', header: 'Ordered', type: 'date', format: 'yMMMd', width: 140 },
  { field: 'active', header: 'Active', type: 'boolean', displayAsCheckbox: true, width: 100 },
];

const host = document.getElementById('root') as HTMLElement;
const mountStart = performance.now();
// First data row in the DOM, then the painted marker (rAF, then a MessageChannel task).
const observer = new MutationObserver(() => {
  if (!host.querySelector('.salmon-data-grid-row[data-row-id="r0"] .salmon-data-grid-cell')) return;
  observer.disconnect();
  requestAnimationFrame(() => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      window.__firstPageMs = performance.now() - mountStart;
    };
    ch.port2.postMessage(0);
  });
});
observer.observe(host, { subtree: true, childList: true });
createRoot(host).render(
  <StrictMode>
    <DataGrid<Item>
      aria-label="Remote orders"
      data={source}
      columns={columns}
      height={600}
      timeZone="UTC"
      locale="en-US"
      {...(mode === 'infinite' ? { infiniteScroll: { blockSize: 100 } } : { paging: { pageSize: 50 } })}
      onReady={(api) => {
        window.__gridApi = api;
      }}
    />
  </StrictMode>,
);
requestAnimationFrame(() => {
  setTimeout(() => {
    window.__mountMs = performance.now() - mountStart;
  }, 0);
});
