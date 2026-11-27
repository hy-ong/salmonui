// Tree mode with the inherited Data Grid features (tests/browser/tree-features.spec.ts):
//
//   ?mode=edit     nested plan; &edit=row|cell|batch|dialog (default row), &pos=above|below|child,
//                  a command column, `name` validation (required, 3+ characters), toolbar add/edit/delete/update/cancel
//   ?mode=detail   nested plan with renderDetail on every row
//   ?mode=big      &roots=n (default 400) roots of 3 children with 3 grandchildren each, &cols=n extra
//                  columns (column virtualization), &checkbox, &detail, &batch, &cells (cell selection), &template
//   ?mode=cross    two tree grids (#left with rowDrag.targetId = &target, default "right") and a #bin element
//   ?mode=lazy     lazy parents with a slow loadChildren (skeleton rows while loading)
//   ?mode=persist  persistState in localStorage (key salmon-data-grid:persisted)
//   ?mode=adaptive adaptive vertical cards
//   ?mode=chrome   column menu, chooser, reorder, context menu and toolbar search
//   ?mode=infinite remote tree (&roots=n, default 300; 2 lazy children each) with infiniteScroll
//                  (blockSize 20, initialBlocks 2, threshold 5): root blocks on scroll, renderDetail, row editing,
//                  multiple selection; window.__treeReads logs the reads
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import type { DataSource } from '@salmonui/data-grid/engine';
import type { DataSourceRequest, DataSourceResult, WriteResult } from '@salmonui/core/data';
import { DataGrid, DataGridRow, DataGridTreeToggle, type DataGridApi, type DataGridColumn, type DataGridProps } from '@salmonui/data-grid';

interface Task {
  readonly id: string;
  readonly name: string;
  readonly hours: number;
  readonly parentId?: string | null;
  readonly children?: Task[];
  readonly lazy?: boolean;
  readonly [extra: string]: unknown;
}

declare global {
  interface Window {
    __gridApi?: DataGridApi<any> | null;
    __rightApi?: DataGridApi<any> | null;
    __mountMs?: number;
    __events: { type: string; [key: string]: unknown }[];
    __treeReads?: { parentRowId: string | null; start: number | null; end: number | null }[];
  }
}

window.__events = [];
const log = (type: string, fields: Record<string, unknown> = {}) => window.__events.push({ type, ...fields });

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'edit';

const plan = (): Task[] => [
  {
    id: 'p1',
    name: 'Planning',
    hours: 0,
    children: [
      { id: 'p1a', name: 'Scope', hours: 4, children: [{ id: 'p1a1', name: 'Interviews', hours: 6 }] },
      { id: 'p1b', name: 'Budget', hours: 3 },
    ],
  },
  { id: 'p2', name: 'Build', hours: 0, children: [{ id: 'p2a', name: 'Backend', hours: 20 }, { id: 'p2b', name: 'Frontend', hours: 18 }] },
  { id: 'p3', name: 'Launch', hours: 2 },
];

const baseColumns: DataGridColumn<Task>[] = [
  { field: 'name', header: 'Task', width: 260, validation: { required: true, minLength: 3 } },
  { field: 'id', header: 'ID', primaryKey: true, width: 110 },
  { field: 'hours', header: 'Hours', type: 'number', width: 100 },
];

const setApi = (api: DataGridApi<Task> | null) => {
  window.__gridApi = api;
};

const common = {
  'aria-label': 'Tasks',
  id: 'tasks',
  height: 420,
  ref: setApi,
  onTreeToggle: (e: { rowId: string; expanded: boolean }) => log('treeToggle', { rowId: e.rowId, expanded: e.expanded }),
  onReady: () => {
    window.__mountMs = performance.now();
  },
} as const;

function EditPage() {
  const editMode = (params.get('edit') ?? 'row') as 'row' | 'cell' | 'batch' | 'dialog';
  const pos = (params.get('pos') ?? 'child') as 'above' | 'below' | 'child';
  const columns: DataGridColumn<Task>[] = [
    ...baseColumns,
    { id: 'commands', header: 'Actions', width: 200, commands: [{ type: 'edit' }, { type: 'delete' }, { type: 'save' }, { type: 'cancel' }] },
  ];
  return (
    <DataGrid<Task>
      {...common}
      data={plan()}
      columns={columns}
      tree
      editing={{ mode: editMode, newRowPosition: pos, confirmSave: false, confirmDiscard: false }}
      toolbar={['add', 'edit', 'delete', 'save', 'cancel', 'indent', 'outdent']}
      onAdd={(e) => log('add', { rowId: e.rowId })}
      onSave={(e) => log('save', { rowIds: (e as unknown as { rowIds?: readonly string[] }).rowIds ?? null })}
    />
  );
}

const renderDetail = ({ row }: { row: Task }): ReactNode => <div className="probe-detail">Detail of {row.name}</div>;

function DetailPage() {
  return <DataGrid<Task> {...common} data={plan()} columns={baseColumns} tree renderDetail={renderDetail} defaultExpandedDetails={['p1a']} />;
}

/** `roots` roots, each with 3 children of 3 grandchildren (13 rows per root). */
function bigTree(roots: number, extra: number): Task[] {
  const out: Task[] = [];
  const fill = (id: string, name: string, hours: number, children?: Task[]): Task => {
    const t: Record<string, unknown> = { id, name, hours };
    for (let c = 0; c < extra; c++) t[`c${c}`] = `${id}.${c}`;
    if (children) t['children'] = children;
    return t as unknown as Task;
  };
  for (let r = 0; r < roots; r++) {
    const kids: Task[] = [];
    for (let k = 0; k < 3; k++) {
      const grand: Task[] = [];
      for (let g = 0; g < 3; g++) grand.push(fill(`r${r}-${k}-${g}`, `Leaf ${r}.${k}.${g}`, g + 1));
      kids.push(fill(`r${r}-${k}`, `Child ${r}.${k}`, k + 1, grand));
    }
    out.push(fill(`r${r}`, `Root ${r}`, r, kids));
  }
  return out;
}

function BigPage() {
  const extra = Number(params.get('cols') ?? 0);
  const columns: DataGridColumn<Task>[] = [...baseColumns];
  for (let c = 0; c < extra; c++) columns.push({ field: `c${c}`, header: `Col ${c}`, width: 120 });
  const props: Partial<DataGridProps<Task>> = {};
  if (params.has('detail')) Object.assign(props, { renderDetail, defaultExpandedDetails: ['r200-1'] });
  if (params.has('batch')) Object.assign(props, { editing: { mode: 'batch', confirmSave: false, confirmDiscard: false } });
  if (params.has('cells')) Object.assign(props, { selection: { mode: 'cell', multiple: true } });
  if (params.has('checkbox')) Object.assign(props, { selection: { multiple: true } });
  if (params.has('template')) {
    Object.assign(props, {
      renderRow: ({ rowId, rowProps, cells }: { rowId: string; rowProps: Record<string, unknown>; cells: ReactNode }) => (
        <DataGridRow {...(rowProps as object as Parameters<typeof DataGridRow>[0])} className={`${String(rowProps['className'] ?? '')} probe-template`}>
          <DataGridTreeToggle rowId={rowId} label={rowId} />
          {cells}
        </DataGridRow>
      ),
    });
  }
  return (
    <DataGrid<Task>
      {...common}
      height={500}
      {...(params.has('cols') ? { width: 900 } : {})}
      data={bigTree(Number(params.get('roots') ?? 400), extra)}
      columns={columns}
      tree={params.has('checkbox') ? { checkbox: { cascade: true } } : true}
      {...props}
    />
  );
}

function CrossPage() {
  const [dropped, setDropped] = useState<string[]>([]);
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <DataGrid<Task>
        aria-label="Left"
        id="left"
        data={plan()}
        columns={baseColumns}
        height={420}
        width={460}
        tree
        rowDrag={{ targetId: params.get('target') ?? 'right' }}
        ref={setApi}
        onRowDrop={(e) => {
          log('rowDrop', { rowIds: [...e.rowIds], rows: e.rows().map((r: Task) => r.id), targetGridId: e.targetGridId, target: e.target?.id ?? null });
          if (e.targetGridId === null) setDropped((d) => [...d, ...e.rows().map((r: Task) => r.id)]);
        }}
        onReady={() => {
          window.__mountMs = performance.now();
        }}
      />
      <DataGrid<Task>
        aria-label="Right"
        id="right"
        data={[{ id: 'z1', name: 'Inbox', hours: 0, children: [] }]}
        columns={baseColumns}
        height={420}
        width={460}
        tree
        rowDrag
        ref={(api) => {
          window.__rightApi = api;
        }}
      />
      <div id="bin" style={{ width: 160, height: 200, border: '2px dashed gray', padding: 8 }}>
        Bin: <span id="bin-ids">{dropped.join(',')}</span>
      </div>
    </div>
  );
}

function LazyPage() {
  return (
    <DataGrid<Task>
      {...common}
      data={[
        { id: 'l1', name: 'Folder A', hours: 0, lazy: true },
        { id: 'l2', name: 'Folder B', hours: 0, lazy: true },
      ]}
      columns={baseColumns}
      tree={{
        hasChildrenField: 'lazy',
        loadChildren: async ({ rowId }) => {
          await new Promise((r) => setTimeout(r, Number(params.get('delay') ?? 800)));
          return [0, 1, 2].map((i) => ({ id: `${rowId}-${i}`, name: `Item ${i}`, hours: i, parentId: rowId }));
        },
      }}
    />
  );
}

function PersistPage() {
  return <DataGrid<Task> {...common} id="persisted" data={plan()} columns={baseColumns} tree persistState />;
}

function AdaptivePage() {
  return <DataGrid<Task> {...common} data={plan()} columns={baseColumns} tree adaptive={{ rowLayout: 'vertical' }} />;
}

function ChromePage() {
  const columns: DataGridColumn<Task>[] = baseColumns.map((c) => ({ ...c, reorderable: true }) as DataGridColumn<Task>);
  return (
    <DataGrid<Task>
      {...common}
      data={plan()}
      columns={columns}
      tree
      sorting
      columnMenu
      contextMenu
      search
      selection={{ multiple: true }}
      toolbar={['search', 'columnChooser']}
      onContextMenuItemClick={(e) => log('contextMenuItemClick', { item: (e.item as { id?: string }).id ?? null, rowIds: [...e.rowIds] })}
    />
  );
}

/** Remote tree server: roots r0.. with two children each; the root level honours `range`. */
function remoteTree(roots: number): DataSource<Task> {
  let rows: Task[] = [];
  for (let r = 0; r < roots; r++) {
    rows.push({ id: `r${r}`, name: `Root ${r}`, hours: r, parentId: null });
    for (let k = 0; k < 2; k++) rows.push({ id: `r${r}-${k}`, name: `Child ${r}.${k}`, hours: k + 1, parentId: `r${r}` });
  }
  window.__treeReads = [];
  return {
    mode: 'remote',
    capabilities: { treeChildren: true, write: true },
    async read(request: DataSourceRequest): Promise<DataSourceResult<Task>> {
      const parent = request.parentRowId ?? null;
      window.__treeReads?.push({ parentRowId: parent, start: request.range?.start ?? null, end: request.range?.end ?? null });
      await new Promise((resolve) => setTimeout(resolve, 40));
      let level = rows.filter((t) => t.parentId === parent);
      const total = level.length;
      if (request.range) level = level.slice(request.range.start, request.range.end);
      const items = level.map((t) => ({ kind: 'tree' as const, row: t, parentId: parent, hasChildren: t.parentId === null, childCount: t.parentId === null ? 2 : 0 }));
      return { version: request.version, rows: items as unknown as Task[], totalRowCount: total };
    },
    async write(request): Promise<WriteResult<Task>> {
      for (const c of request.changed) rows = rows.map((t) => (t.id === c.rowId ? c.row : t));
      return { version: request.version, status: 'applied', changed: request.changed.map((c) => ({ rowId: c.rowId, row: c.row })) };
    },
  };
}

function InfinitePage() {
  const [source] = useState(() => remoteTree(Number(params.get('roots') ?? 300)));
  return (
    <DataGrid<Task>
      {...common}
      data={source}
      columns={baseColumns}
      tree={{ parentIdField: 'parentId' }}
      infiniteScroll={{ blockSize: 20, initialBlocks: 2, threshold: 5 }}
      renderDetail={renderDetail}
      selection={{ multiple: true }}
      editing={{ mode: 'row', confirmSave: false, confirmDiscard: false }}
      onSave={(e) => log('save', { rowIds: (e as unknown as { rowIds?: readonly string[] }).rowIds ?? null })}
    />
  );
}

const pages: Record<string, () => ReactNode> = { edit: EditPage, detail: DetailPage, big: BigPage, cross: CrossPage, lazy: LazyPage, persist: PersistPage, adaptive: AdaptivePage, chrome: ChromePage, infinite: InfinitePage };
const Page = pages[mode] ?? EditPage;

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
