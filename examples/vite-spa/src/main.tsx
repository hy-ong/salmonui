import { StrictMode, createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { createSearchModule } from '@salmonui/data-grid/engine';
import { DataGrid, type DataGridApi, type DataGridProps } from '@salmonui/data-grid';
import { App, type AppProps } from './App.tsx';
import { createFixture, type Row } from './fixture.ts';
import type { HarnessSetup } from './harness.ts';

declare global {
  interface Window {
    // One program merges every page's Window globals; keep the shared ones identical.
    __gridApi?: DataGridApi<any> | null;
    __mountMs?: number;
    __fixtureMs?: number;
  }
}

const params = new URLSearchParams(location.search);
const num = (name: string): number | undefined => {
  const v = params.get(name);
  return v === null ? undefined : Number(v);
};

// Event logs the browser specs read (the harness replaces the ones its switches record into).
for (const name of ['__chromeEvents', '__outputEvents', '__queryEvents', '__editEvents', '__groupEvents', '__selectionChanges']) {
  (window as unknown as Record<string, unknown[]>)[name] = [];
}

const DEFAULT_FEATURES: AppProps['features'] = {
  sort: false,
  filter: false,
  paging: null,
  selection: undefined,
  controlled: false,
  dir: null,
  defaultSelectedRowIds: undefined,
  group: null,
  aggregates: false,
  collapsed: false,
  search: false,
};

function Root({ setup, secondModules, ...props }: Omit<AppProps, 'extra' | 'columns' | 'features'> & { setup: HarnessSetup; secondModules: DataGridProps<Row>['modules'] | null }) {
  const [more, setMore] = useState<Partial<DataGridProps<Row>>>({});
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    (window as { __setExtra?: (patch: Partial<DataGridProps<Row>>) => void }).__setExtra = (patch) => setMore((m) => ({ ...m, ...patch }));
    (window as { __setMounted?: (value: boolean) => void }).__setMounted = setMounted;
  }, []);
  if (!mounted) return <p className="app__unmounted">Unmounted</p>;
  return (
    <>
      <App {...props} columns={setup.columns} features={setup.features} extra={{ ...setup.extra, ...more }} />
      {secondModules ? (
        <DataGrid<Row> id="second" aria-label="Second grid" data={props.rows.slice(0, 50)} columns={setup.columns.slice(0, 4)} height={300} modules={secondModules} search toolbar={['search']} localeText={{ searchLabel: 'Search second grid' }} />
      ) : null}
    </>
  );
}

async function boot(): Promise<void> {
  let fixtureMs = 0;
  let t0 = performance.now();
  const { rows, columns } = createFixture(num('rows') ?? 100_000, num('cols') ?? 100);
  fixtureMs += performance.now() - t0;
  // The URL switches (harness.ts) are test-harness code: they load only when the URL has a query,
  // so the default page's initial load is the library plus this bootstrap.
  let setup: HarnessSetup = { columns, extra: {}, features: DEFAULT_FEATURES, secondGrid: false };
  if (location.search.length > 1) {
    const { configure } = await import('./harness.ts');
    t0 = performance.now();
    setup = configure(params, rows, columns, createElement);
    fixtureMs += performance.now() - t0;
  }
  window.__fixtureMs = fixtureMs;

  const mountStart = performance.now();
  performance.mark('salmonui:mount-start');
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <Root
        setup={setup}
        secondModules={setup.secondGrid ? [createSearchModule<Row>()] : null}
        rows={rows}
        maxScrollHeight={num('maxScrollHeight')}
        estimatedRowHeight={params.has('wrap') ? 36 : undefined}
        onSelectionChange={(change) => {
          (window as { __selectionChanges?: unknown[] }).__selectionChanges?.push({ count: change.rowIds.length, source: change.source, scope: change.scope, added: change.added.length, removed: change.removed.length });
        }}
        onGroupEvent={(event) => {
          (window as { __groupEvents?: unknown[] }).__groupEvents?.push(event);
        }}
        onApi={(api) => {
          window.__gridApi = api;
        }}
      />
    </StrictMode>,
  );
  // First painted viewport: the frame after the commit that rendered it.
  requestAnimationFrame(() => {
    setTimeout(() => {
      performance.mark('salmonui:mount-painted');
      window.__mountMs = performance.now() - mountStart;
    }, 0);
  });
}

void boot();
