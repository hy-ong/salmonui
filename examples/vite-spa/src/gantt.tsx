// Gantt browser page (tests/browser/gantt*.spec.ts): scenarios in
// `[data-scenario]` blocks with a fixed locale, zone and dates. Gantt APIs are
// on `window.__ganttApi[id]`, events in `window.__ganttEvents`.
//
//   ?set=perf      10,000 tasks with dependencies (performance gates)
//   ?set=grid      grid-pane scenarios (tests/browser/gantt-grid.spec.ts, GGRID rows)
//   ?set=rows      chart, timeline, export and API scenarios (tests/browser/gantt-rows.spec.ts)
//   ?ssr=1         renderToString in the browser, then hydrateRoot
//   ?dir=rtl       the basic scenario right to left
//   ?only=<id>     one scenario of the set
import { useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import '@salmonui/overlays/tooltip/styles.css';
import '@salmonui/gantt/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { Gantt, type GanttApi, type GanttProps } from '@salmonui/gantt';
import { editing, rowDrag, tree } from '@salmonui/data-grid/features';
import { createControlledDataSource } from '@salmonui/data';

type Task = Record<string, unknown>;

declare global {
  interface Window {
    __ganttApi: Record<string, GanttApi<Task>>;
    __ganttEvents: { id: string; type: string; value: unknown }[];
    __mountMs?: number;
    __hydrated?: boolean;
    __serverHtml?: string;
    /** g-write: how the next writes settle, the writes held, and a mount switch. */
    __ganttWrite: { mode: 'resolve' | 'reject' | 'hold'; held: (() => void)[] };
    /** g-skeleton / g-mask: release the held read or children load. */
    __ganttRelease: Record<string, () => void>;
  }
}

window.__ganttApi = {};
window.__ganttEvents = [];
window.__ganttWrite = { mode: 'resolve', held: [] };
window.__ganttRelease = {};
const params = new URLSearchParams(location.search);

const json = (v: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'function' ? undefined : x)));
  } catch {
    return null;
  }
};
const log = (id: string, type: string) => (value: unknown) => {
  window.__ganttEvents.push({ id, type, value: json(value) });
};

export const PROJECT: Task[] = [
  { id: 1, title: 'Product launch', parentId: null },
  { id: 2, title: 'Plan', parentId: 1 },
  { id: 3, title: 'Scope', start: '2026-03-02', duration: 2, progress: 100, parentId: 2, baselineStart: '2026-03-02', baselineEnd: '2026-03-03', notes: 'Agree on the scope' },
  { id: 4, title: 'Estimate', duration: 3, progress: 40, predecessors: '3FS', parentId: 2, resources: [{ id: 'r1', unit: 100 }] },
  { id: 5, title: 'Build', parentId: 1 },
  { id: 6, title: 'Backend', duration: 5, progress: 20, predecessors: '4FS', parentId: 5, resources: [{ id: 'r2', unit: 100 }] },
  { id: 7, title: 'Frontend', duration: 4, predecessors: '4FS+1d', parentId: 5, resources: [{ id: 'r2', unit: 100 }] },
  { id: 8, title: 'Integrate', duration: 2, predecessors: '6FS,7FS', parentId: 5 },
  { id: 9, title: 'Release', duration: 0, predecessors: '8', parentId: 1 },
];
export const RESOURCES = [
  { id: 'r1', name: 'Ana' },
  { id: 'r2', name: 'Ben' },
];

function Block({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section data-scenario={id} data-salmon-a11y-root="" style={{ display: 'block', margin: 8 }}>
      <h2 style={{ fontSize: 12, margin: '0 0 4px' }}>{id}</h2>
      {children}
    </section>
  );
}

function Scenario({ id, ...props }: { id: string } & Partial<GanttProps<Task>>) {
  // `?only=<id>` renders one scenario (debugging).
  if (params.get('only') && params.get('only') !== id) return null;
  return (
    <Block id={id}>
      <Gantt<Task>
        id={id}
        data={PROJECT}
        taskFields={{ parentId: 'parentId' }}
        timeZone="UTC"
        locale="en-US"
        height={420}
        resources={RESOURCES}
        // The server render (?ssr=1) needs the tree feature synchronously, as a server build has it.
        features={[tree, editing]}
        ref={(api) => {
          if (api) window.__ganttApi[id] = api;
        }}
        onTaskChange={log(id, 'taskChange')}
        onTaskbarEditStart={log(id, 'taskbarEditStart')}
        onTaskbarEditEnd={log(id, 'taskbarEditEnd')}
        onDependencyChange={log(id, 'dependencyChange')}
        onZoomChange={log(id, 'zoomChange')}
        onTaskbarClick={log(id, 'taskbarClick')}
        {...props}
      />
    </Block>
  );
}

/** 10,000 tasks: 1,000 parents of 9 chained leaves, each chain linked to the next. */
export function bigProject(): Task[] {
  const out: Task[] = [];
  let id = 1;
  for (let p = 0; p < 1000; p++) {
    const parent = id++;
    out.push({ id: parent, title: `Phase ${p + 1}`, parentId: null });
    for (let c = 0; c < 9; c++) {
      const tid = id++;
      out.push({ id: tid, title: `Task ${tid}`, parentId: parent, duration: 1 + (tid % 3), progress: (tid * 7) % 100, ...(tid === 2 ? { start: '2026-01-05' } : { predecessors: String(tid === parent + 1 ? tid - 2 : tid - 1) }) });
    }
  }
  return out;
}

const writers = { excel: () => import('@salmonui/export/xlsx'), pdf: () => import('@salmonui/export/gantt') } as unknown as NonNullable<GanttProps<Task>['exportWriters']>;
const OWNER = { field: 'owner', header: 'Owner', width: 90, pinned: 'start' as const, valueGetter: (row: Task) => `Owner ${row['id']}` };

/** Lazy children: phase 1 loads its tasks on expand. */
const LAZY: Task[] = [
  { id: 1, title: 'Phase A', start: '2026-03-02', duration: 5, parentId: null, hasChildren: true },
  { id: 2, title: 'Phase B', start: '2026-03-09', duration: 3, parentId: null },
];
const loadChildren = ({ rowId }: { rowId: unknown }): Promise<Task[]> => {
  window.__ganttEvents.push({ id: 'g-lazy', type: 'loadChildren', value: String(rowId) });
  return new Promise((r) =>
    setTimeout(
      () =>
        r([
          { id: 11, title: 'A1', start: '2026-03-02', duration: 2, parentId: 1 },
          { id: 12, title: 'A2', duration: 4, predecessors: '11', parentId: 1 },
        ]),
      150,
    ),
  );
};

/** A controlled remote source: flat rows with their own parent field. */
const remote = createControlledDataSource<Task>({
  onQueryChange: (request) => {
    window.__ganttEvents.push({ id: 'g-remote', type: 'query', value: json(request) });
    const rows = PROJECT.map((r) => ({ ...r }));
    return { version: request.version, rows, totalRowCount: rows.length };
  },
});

/** A writable remote source: writes resolve, reject or wait as `window.__ganttWrite.mode` says. */
const writable = createControlledDataSource<Task>({
  onQueryChange: (request) => {
    const rows = PROJECT.map((r) => ({ ...r }));
    return { version: request.version, rows, totalRowCount: rows.length };
  },
  onDataChange: (request) => {
    const entry = { ids: [...request.added.map((a) => String(a.tempId)), ...request.changed.map((c) => String(c.rowId)), ...request.deleted.map((d) => String(d.rowId))], hasSignal: typeof request.signal?.aborted === 'boolean', mode: request.mode, changed: json(request.changed.map((c) => ({ rowId: c.rowId, row: c.row, columns: c.changedColumnIds }))) };
    window.__ganttEvents.push({ id: 'g-write', type: 'write', value: entry });
    request.signal.addEventListener?.('abort', () => window.__ganttEvents.push({ id: 'g-write', type: 'writeAborted', value: entry.ids }));
    const answer = () => ({ version: request.version, status: 'applied' as const, changed: request.changed.map((c) => ({ rowId: c.rowId, row: c.row })) });
    const mode = window.__ganttWrite.mode;
    if (mode === 'reject') return Promise.reject(new Error('Server said no'));
    if (mode === 'hold') return new Promise((resolve) => window.__ganttWrite.held.push(() => resolve(answer())));
    return Promise.resolve(answer());
  },
});

function Writable() {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button type="button" data-testid="unmount-write" onClick={() => setMounted((m) => !m)}>
        Toggle g-write
      </button>
      {mounted ? <Scenario id="g-write" data={writable} onError={log('g-write', 'error')} /> : null}
    </>
  );
}

/** A remote read held until released: the grid's skeleton and the chart's. */
const slow = createControlledDataSource<Task>({
  onQueryChange: (request) =>
    new Promise((resolve) => {
      window.__ganttRelease['g-skeleton'] = () => resolve({ version: request.version, rows: PROJECT.map((r) => ({ ...r })), totalRowCount: PROJECT.length });
    }),
});
const heldChildren = ({ rowId }: { rowId: unknown }): Promise<Task[]> =>
  new Promise((r) => {
    window.__ganttRelease['g-mask'] = () =>
      r([
        { id: 11, title: 'A1', start: '2026-03-02', duration: 2, parentId: rowId },
        { id: 12, title: 'A2', duration: 4, predecessors: '11', parentId: rowId },
      ]);
  });

function Reactive() {
  const [data, setData] = useState<Task[]>(PROJECT);
  return (
    <>
      <button type="button" data-testid="replace-data" onClick={() => setData([{ id: 1, title: 'Only', parentId: null }, { id: 2, title: 'Child', start: '2026-04-06', duration: 2, parentId: 1 }])}>
        Replace data
      </button>
      <Scenario id="g-reactive" data={data} sorting onViewChange={log('g-reactive', 'viewChange')} />
    </>
  );
}

/** Grid-pane scenarios (GGRID rows). */
function GridSet() {
  const id = 'g-query';
  return (
    <>
      <Scenario
        id={id}
        height={560}
        sorting
        filtering
        search
        columnMenu
        reorderable
        resizable
        columnChooser
        selection={{ multiple: true }}
        toolbar={['search']}
        columns={['id', 'title', 'start', 'end', 'duration', OWNER, { field: 'notes', header: 'Notes', hidden: true }]}
        onSortChange={log(id, 'sortChange')}
        onFilterChange={log(id, 'filterChange')}
        onSearchChange={log(id, 'searchChange')}
        onSelectionChange={log(id, 'selectionChange')}
        onColumnReorder={log(id, 'columnReorder')}
        onColumnResizeEnd={log(id, 'columnResizeEnd')}
        onColumnVisibilityChange={log(id, 'columnVisibilityChange')}
      />
      <Scenario id="g-filter" filtering treeFilterMode="none" />
      <Scenario id="g-lines" gridLines="none" highlightOnHover={false} />
      <Scenario id="g-drag" rowDrag features={[tree, editing, rowDrag]} onRowDrop={log('g-drag', 'rowDrop')} />
      <Scenario
        id="g-lazy"
        data={LAZY}
        hasChildrenField="hasChildren"
        loadChildren={loadChildren}
        onBeforeTreeToggle={(e) => {
          window.__ganttEvents.push({ id: 'g-lazy', type: 'beforeTreeToggle', value: { rowId: String(e.rowId), expanded: e.expanded } });
          if ((window as unknown as { __ganttVetoToggle?: boolean }).__ganttVetoToggle) e.preventDefault();
        }}
        onTreeToggle={(e) => window.__ganttEvents.push({ id: 'g-lazy', type: 'treeToggle', value: { rowId: String(e.rowId), expanded: e.expanded } })}
      />
      <Scenario id="g-remote" data={remote} />
      <Reactive />
      <Writable />
      <Scenario id="g-skeleton" data={slow} loadingIndicator="skeleton" />
      <Scenario id="g-mask" data={LAZY} hasChildrenField="hasChildren" loadChildren={heldChildren} />
      <Scenario id="g-adaptive" adaptive={{ breakpoint: 700 }} />
    </>
  );
}

/** Two years of monthly tasks. */
const LONG: Task[] = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, title: `Month ${i + 1}`, start: new Date(Date.UTC(2026, 0, 5 + i * 30)).toISOString().slice(0, 10), duration: 5, parentId: null }));
const EDIT: Task[] = PROJECT.map((r) => (r['id'] === 7 ? { ...r, manual: true, start: '2026-03-16', duration: 3 } : r));

/** Chart, timeline, export and API scenarios (GANTT rows). */
function RowsSet() {
  return (
    <>
      <Scenario
        id="r-split"
        splitter={{ position: 300, minSize: 120 }}
        onSplitterResizeStart={log('r-split', 'splitterResizeStart')}
        onSplitterResize={log('r-split', 'splitterResize')}
        onSplitterResizeEnd={log('r-split', 'splitterResizeEnd')}
      />
      <Scenario id="r-cols" columns={['id', 'title', 'start']} splitter={{ columnIndex: 1 }} />
      <Scenario id="r-grid" panes="grid" />
      <Scenario id="r-chart" panes="chart" />
      <Scenario id="r-long" data={LONG} timeline={{ infinite: true }} onChartPointerMove={log('r-long', 'chartPointerMove')} onRowDoubleClick={log('r-long', 'rowDoubleClick')} />
      <Scenario
        id="r-edit"
        data={EDIT}
        taskMode="custom"
        onSave={log('r-edit', 'save')}
        onBeforeSave={log('r-edit', 'beforeSave')}
        columns={['serialNumber', 'title', 'start', 'end', 'duration', 'progress', 'notes']}
        contextMenu
        sorting
        criticalPath
        baselines
        exportWriters={writers}
        onBeforeExport={log('r-edit', 'beforeExport')}
        onExport={log('r-edit', 'export')}
        onContextMenuItemClick={log('r-edit', 'contextMenuItemClick')}
      />
    </>
  );
}

function Page() {
  if (params.get('set') === 'grid') return <GridSet />;
  if (params.get('set') === 'rows') return <RowsSet />;
  if (params.get('set') === 'perf') {
    const data = bigProject();
    return (
      <Block id="perf">
        <Gantt<Task>
          id="perf"
          data={data}
          taskFields={{ parentId: 'parentId' }}
          timeZone="UTC"
          locale="en-US"
          height={600}
          editing
          ref={(api) => {
            if (api) window.__ganttApi['perf'] = api;
          }}
        />
      </Block>
    );
  }
  const dir = params.get('dir') === 'rtl' ? 'rtl' : undefined;
  return (
    <>
      <Scenario
        id="basic"
        {...(dir ? { dir } : {})}
        toolbar={['add', 'edit', 'delete', 'expandAll', 'collapseAll', 'search', 'previousTimeSpan', 'nextTimeSpan', 'zoomIn', 'zoomOut', 'zoomToFit', 'indent', 'outdent', 'criticalPath', 'csvExport', 'undo', 'redo']}
        columns={['id', 'title', 'start', 'end', 'duration', 'progress', 'predecessors', 'resources']}
        baselines
        undo
        highlightWeekends
        holidays={[{ start: '2026-03-20', label: 'Holiday' }]}
        markers={[{ date: '2026-03-16', label: 'Review' }]}
        labels={{ end: 'title' }}
        contextMenu
      />
      <Scenario id="readonly" readOnly />
    </>
  );
}

const container = document.getElementById('root') as HTMLElement;
const t0 = performance.now();
if (params.get('ssr') === '1') {
  const serverRender = async (): Promise<string> => {
    let html = renderToString(<Page />);
    for (let i = 0; i < 100 && html.includes('data-salmon-pending'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      html = renderToString(<Page />);
    }
    return html;
  };
  void serverRender().then((html) => {
    window.__serverHtml = html;
    container.innerHTML = html;
    hydrateRoot(container, <Page />, { onRecoverableError: (e) => console.error('recoverable', e) });
    requestAnimationFrame(() => (window.__hydrated = true));
  });
} else {
  createRoot(container).render(<Page />);
}
requestAnimationFrame(() => (window.__mountMs = performance.now() - t0));
