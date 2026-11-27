// Infinite scroll browser page (tests/browser/infinite.spec.ts): a remote
// source over 1,000,000 generated rows that answers range reads after a
// delay, records every read in `window.__reads`, and echoes writes.
//
//   ?delay=<ms>     read latency (default 40)
//   ?unknown        no totalRowCount (the grid grows as blocks load)
//   ?cache[=<n>]    infiniteScroll.cache with maxBlocks n (default 3)
//   ?block=<n>      blockSize (default 100)
//   ?edit           cell editing (writes echo through a patch event)
//   ?add            row editing with newRowPosition 'bottom'; added rows are
//                   appended after the last row
//   ?fail           every read after the first fails (until window.__fail = false)
//   ?noskeleton     virtualization.skeletonRows: false (skeleton rows are the default)
//   ?total=<n>      row count (default 1,000,000)
//   ?hold           every read after the first stays pending (placeholders
//                   stay) until `window.__releaseReads()` lets the pending
//                   reads answer after `?delay`; held reads still abort
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import type { DataSourceEvent, DataSourceRequest, DataSourceResult, WriteRequest, WriteResult } from '@salmonui/core/data';
import type { DataSource } from '@salmonui/data-grid/engine';

interface Item {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly city: string;
  readonly amount: number;
}

declare global {
  interface Window {
    // One program merges every page's Window globals; keep the shared ones identical.
    __gridApi?: DataGridApi<any> | null;
    __mountMs?: number;
    __reads: { start: number; end: number; aborted: boolean; at: number }[];
    __fail?: boolean;
    /** With `?hold`, answers the reads held so far (later reads stay held). */
    __releaseReads?: () => void;
  }
}

const params = new URLSearchParams(location.search);
const TOTAL = Number(params.get('total') ?? 1_000_000);
const delay = Number(params.get('delay') ?? 40);
const CITIES = ['Reims', 'Lyon', 'Bern', 'Graz', 'Porto', 'Turin', 'Ghent'];
const edits = new Map<string, Item>();
/** Rows the server appended after the generated ones (`?add`). */
const appended: Item[] = [];
const total = (): number => TOTAL + appended.length;

const item = (i: number): Item => (i >= TOTAL ? (appended[i - TOTAL] as Item) : undefined) ?? edits.get(`r${i}`) ?? { id: `r${i}`, n: i, name: `Customer ${i}`, city: CITIES[i % CITIES.length] as string, amount: (i * 37) % 1000 };

window.__reads = [];
window.__fail = params.has('fail');
const listeners = new Set<(event: DataSourceEvent<Item>) => void>();
let first = true;
const heldReads = new Set<() => void>();
window.__releaseReads = () => {
  const release = [...heldReads];
  heldReads.clear();
  for (const answer of release) answer();
};

const source: DataSource<Item> = {
  mode: 'remote',
  read(request: DataSourceRequest): Promise<DataSourceResult<Item>> {
    const range = request.range ?? { start: 0, end: 100 };
    const record = { start: range.start, end: range.end, aborted: false, at: performance.now() };
    window.__reads.push(record);
    const failing = window.__fail === true && !first;
    const held = params.has('hold') && !first;
    first = false;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const answer = () => {
        timer = setTimeout(() => {
          if (failing && window.__fail) {
            reject(new Error('Block failed to load'));
            return;
          }
          const end = Math.min(range.end, total());
          const rows: Item[] = [];
          for (let i = range.start; i < end; i++) rows.push(item(i));
          resolve({
            version: request.version,
            rows,
            ...(params.has('unknown') ? {} : { totalRowCount: total() }),
            performed: ['search', 'filter', 'sort', 'page'],
            pageInfo: { hasNextPage: end < total() },
          });
        }, delay);
      };
      if (held) heldReads.add(answer);
      else answer();
      request.signal.addEventListener?.('abort', () => {
        heldReads.delete(answer);
        clearTimeout(timer);
        record.aborted = true;
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    });
  },
  async write(request: WriteRequest<Item>): Promise<WriteResult<Item>> {
    await new Promise((r) => setTimeout(r, 10));
    const changed = request.changed.map((c) => {
      edits.set(c.rowId, c.row);
      return { rowId: c.rowId, row: c.row };
    });
    // The server keys and appends added rows (a new row lands at the bottom).
    const added = request.added.map((a) => {
      const n = total();
      const row: Item = { ...a.row, id: `r${n}`, n };
      appended.push(row);
      return { tempId: a.tempId, row };
    });
    const event: DataSourceEvent<Item> = {
      type: 'patch',
      rows: [...changed.map((c) => c.row), ...added.map((a) => a.row)],
      updated: changed.map((c) => c.rowId),
      added: added.map((a) => a.row.id),
      removed: [],
    };
    for (const l of listeners) l(event);
    return { version: request.version, status: 'applied', added, changed, deleted: [] } as unknown as WriteResult<Item>;
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const columns: DataGridColumn<Item>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 110, editable: false },
  { field: 'n', header: 'Row', type: 'number', width: 100, editable: false },
  { field: 'name', header: 'Name', width: 200 },
  { field: 'city', header: 'City', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', width: 120 },
];

const cache = params.get('cache');
const mountStart = performance.now();
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <DataGrid<Item>
      aria-label="Infinite orders"
      data={source}
      columns={columns}
      height={600}
      timeZone="UTC"
      sorting
      selection={{ multiple: true }}
      {...(params.has('edit') ? { editing: { mode: 'cell' as const } } : {})}
      {...(params.has('add') ? { editing: { newRowPosition: 'bottom' as const } } : {})}
      {...(params.has('noskeleton') ? { virtualization: { skeletonRows: false } } : {})}
      infiniteScroll={{
        blockSize: Number(params.get('block') ?? 100),
        ...(cache !== null ? { cache: true, maxBlocks: Number(cache || 3) } : {}),
      }}
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
