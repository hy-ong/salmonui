// Tree mode browser page (tests/browser/tree.spec.ts): a nested
// project plan with a checkbox cascade, a flat self-referential grid with
// row drag and the indent / outdent toolbar items, and a lazy grid whose
// children load on expand.
//
//   ?mode=nested   nested rows, tree.checkbox cascade, multiple selection (default)
//   ?mode=flat     parentIdField rows, rowDrag, toolbar indent / outdent
//   ?mode=lazy     hasChildrenField + loadChildren (?fail=1: the first load fails;
//                  &delay=ms: load time, default 150)
//   &dir=rtl       right-to-left
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';

interface Task {
  readonly id: string;
  readonly name: string;
  readonly hours: number;
  readonly parentId?: string | null;
  readonly children?: Task[];
  readonly lazy?: boolean;
}

declare global {
  interface Window {
    __gridApi?: DataGridApi<any> | null;
    __mountMs?: number;
    __events: { type: string; [key: string]: unknown }[];
  }
}

window.__events = [];
const log = (type: string, fields: Record<string, unknown> = {}) => window.__events.push({ type, ...fields });

const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'nested';
const dir = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';

const nested: Task[] = [
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

const flat: Task[] = [
  { id: 'f1', name: 'Design', hours: 5, parentId: null },
  { id: 'f2', name: 'Wireframes', hours: 3, parentId: 'f1' },
  { id: 'f3', name: 'Review', hours: 1, parentId: 'f1' },
  { id: 'f4', name: 'Ship', hours: 2, parentId: null },
  { id: 'f5', name: 'Retro', hours: 1, parentId: null },
];

const lazyRoots: Task[] = [
  { id: 'l1', name: 'Folder A', hours: 0, lazy: true },
  { id: 'l2', name: 'Folder B', hours: 0, lazy: true },
];

const columns: DataGridColumn<Task>[] = [
  { field: 'name', header: 'Task', width: 260 },
  { field: 'id', header: 'ID', primaryKey: true, width: 90 },
  { field: 'hours', header: 'Hours', type: 'number', width: 100 },
];

let failNext = params.has('fail');
const loadDelay = Number(params.get('delay') ?? 150);

function Page() {
  const common = {
    'aria-label': 'Tasks',
    id: 'tasks',
    columns,
    height: 420,
    dir,
    ref: (api: DataGridApi<Task> | null) => {
      window.__gridApi = api;
    },
    onTreeToggle: (e: { rowId: string; expanded: boolean; source: string }) => log('treeToggle', { rowId: e.rowId, expanded: e.expanded, source: e.source }),
    onReady: () => {
      window.__mountMs = performance.now();
    },
  } as const;
  if (mode === 'flat') {
    return (
      <DataGrid<Task>
        {...common}
        data={flat}
        tree={{ parentIdField: 'parentId' }}
        rowDrag
        toolbar={['indent', 'outdent']}
        onRowDrop={(e) => log('rowDrop', { rowIds: e.rowIds, position: e.position, parentId: e.parentId })}
      />
    );
  }
  if (mode === 'lazy') {
    return (
      <DataGrid<Task>
        {...common}
        data={lazyRoots}
        tree={{
          hasChildrenField: 'lazy',
          loadChildren: async ({ rowId }) => {
            await new Promise((r) => setTimeout(r, loadDelay));
            if (failNext) {
              failNext = false;
              throw new Error('offline');
            }
            return [0, 1, 2].map((i) => ({ id: `${rowId}-${i}`, name: `Item ${i}`, hours: i, parentId: rowId }));
          },
        }}
        onError={(e) => log('error', { action: e.action })}
      />
    );
  }
  return (
    <DataGrid<Task>
      {...common}
      data={nested}
      tree={{ checkbox: { cascade: true } }}
      selection={{ multiple: true }}
      onSelectionChange={(e) => log('selectionChange', { target: e.target, rowIds: e.rowIds })}
    />
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
