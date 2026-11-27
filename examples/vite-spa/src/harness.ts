// Query-flag test harness for the browser specs, loaded with a dynamic import only when the
// page URL has a query string. Keeping it (and `locale-de`, the lookup and lazy-group helpers)
// out of the entry chunk keeps the default page inside the test:examples initial-load budget.
// It has no runtime imports of React or the library (`h` is passed in): a dynamic chunk that
// imports shared modules makes the bundler split the shared chunks further, which costs more
// initial gzip than the harness saves.
import type { createElement, CSSProperties } from 'react';
import type { DataGridColumn, DataGridProps, DataGridSelection } from '@salmonui/data-grid';
import type { DataSourceResult } from '@salmonui/core/data';
import type { DataSource } from '@salmonui/data-grid/engine';
import type { AppProps } from './App.tsx';
import type { Row } from './fixture.ts';
import { applyLookup } from './lookup.ts';
import { germanLocaleText } from '../../../docs/site/lib/locale-de.ts';

export interface HarnessSetup {
  columns: DataGridColumn<Row>[];
  extra: Partial<DataGridProps<Row>>;
  features: AppProps['features'];
  /** `?secondGrid`: render a second, searchable grid. */
  secondGrid: boolean;
}

/** Applies every URL switch to the fixture and returns the grid configuration. */
export function configure(params: URLSearchParams, rows: Row[], columns: DataGridColumn<Row>[], h: typeof createElement): HarnessSetup {
  const num = (name: string): number | undefined => {
    const v = params.get(name);
    return v === null ? undefined : Number(v);
  };
  if (params.has('frozenRight')) {
    const last = columns[columns.length - 1];
    if (last) columns[columns.length - 1] = { ...last, pinned: 'end' };
  }
  // ?fixedCols=s2,s3: those columns go to the fixed zone (`pinned: 'center'`).
  for (const field of params.get('fixedCols')?.split(',') ?? []) {
    const at = columns.findIndex((c) => c.field === field);
    const c = columns[at];
    if (c) columns[at] = { ...c, pinned: 'center' };
  }
  // ?span: the s3 cell spans three columns on every 5th row (column `colSpan`).
  if (params.has('span')) {
    const at = columns.findIndex((c) => c.field === 's3');
    const s3 = columns[at];
    if (s3) columns[at] = { ...s3, colSpan: ({ rowIndex }) => (rowIndex % 5 === 0 ? 3 : 1) };
  }
  // ?rowSpan: the s2 cell spans three rows on every 6th row, row virtualization left on.
  if (params.has('rowSpan')) {
    const at = columns.findIndex((c) => c.field === 's2');
    const s2 = columns[at];
    if (s2) columns[at] = { ...s2, rowSpan: ({ rowIndex }) => (rowIndex % 6 === 0 ? 3 : 1) };
  }
  // ?longRowSpan: the s1 cell spans 20,000 rows from every 20,000th row (spans that start far above the window).
  if (params.has('longRowSpan')) {
    const at = columns.findIndex((c) => c.field === 's1');
    const s1 = columns[at];
    if (s1) columns[at] = { ...s1, rowSpan: ({ rowIndex }) => (rowIndex % 20_000 === 0 ? 20_000 : 1) };
  }
  // ?lookup: s2 holds keys 0..3 shown through a local lookup column "Status" (lookup.ts).
  if (params.has('lookup')) applyLookup(rows, columns);
  if (params.has('wrap')) {
    const second = columns[2];
    if (second) columns[2] = { ...second, width: 120 };
    for (let i = 0; i < rows.length; i += 7) {
      const row = rows[i] as Record<string, unknown>;
      row['s1'] = `${String(row['s1'])} wraps onto several lines in this row`;
    }
  }
  // ?colWidths: mount-time `%` and `'auto'` widths: s0 is 25% of the viewport,
  // s1 content-fits once after mount, s2 content-fits but is capped at 60 px with ellipsis overflow.
  if (params.has('colWidths')) {
    for (let i = 0; i < columns.length; i++) {
      const c = columns[i] as DataGridColumn<Row>;
      if (c.field === 's0') columns[i] = { ...c, width: '25%' };
      else if (c.field === 's1') columns[i] = { ...c, width: 'auto' };
      else if (c.field === 's2') columns[i] = { ...c, width: 'auto', maxWidth: 60, overflow: 'ellipsis' };
    }
  }
  // ?stacked groups the leaf columns under two header levels.
  let gridColumns: DataGridColumn<Row>[] = columns;
  if (params.has('stacked')) {
    const [idCol, ...rest] = columns;
    const groups: DataGridColumn<Row>[] = [];
    for (let i = 0; i < rest.length; i += 10) {
      const block = rest.slice(i, i + 10);
      groups.push({
        id: `g${i / 10}`,
        header: `Group ${i / 10}`,
        columns: [
          { id: `g${i / 10}a`, header: `Part ${i / 10}A`, columns: block.slice(0, 5) },
          { id: `g${i / 10}b`, header: `Part ${i / 10}B`, columns: block.slice(5) },
        ],
      });
    }
    gridColumns = [idCol as DataGridColumn<Row>, ...groups];
  }

  // Column chrome switches: ?chrome turns on the column menu, context menu, chooser and toolbar;
  // ?filterUi=excel|checklist|menu|row; ?frozenRows=2&frozenBottom=1&frozenCols=1 (sticky rows, pinned columns).
  const events: unknown[] = [];
  (window as { __chromeEvents?: unknown[] }).__chromeEvents = events;
  const extra: Partial<DataGridProps<Row>> = {};
  if (params.has('chrome')) {
    extra.columnMenu = true;
    extra.contextMenu = true;
    extra.columnChooser = true;
    extra.toolbar = ['add', 'edit', 'delete', 'save', 'cancel', 'columnChooser', 'exportExcel', 'exportPdf', 'exportCsv', 'print', 'expandAll', 'collapseAll', { id: 'custom', label: 'Custom', align: 'start' }, 'search'];
    extra.onToolbarItemClick = (e) => events.push({ type: 'toolbar', id: e.item.id, source: e.source });
    extra.onColumnMenuItemClick = (e) => events.push({ type: 'columnMenu', id: e.item.id, field: e.field, source: e.source });
    extra.onContextMenuItemClick = (e) => events.push({ type: 'contextMenu', id: e.item.id, target: e.target, source: e.source });
    extra.onColumnPinChange = (e) => events.push({ type: 'pin', field: e.field, pinned: e.pinned });
    extra.onColumnResizeEnd = (e) => events.push({ type: 'resizeEnd', field: e.field, width: e.width });
    extra.onColumnDrop = (e) => events.push({ type: 'drop', field: e.field, toIndex: e.toIndex });
    // ?tbrender: render items without a label (overflow menu text falls back to the title, the rendered text,
    // an aria-label inside, then the id).
    if (params.has('tbrender')) {
      extra.toolbar = [
        ...(extra.toolbar as NonNullable<DataGridProps<Row>['toolbar']>),
        { id: 'withTitle', title: 'Refresh data', render: () => h('span', { 'aria-hidden': true }, '↻') },
        { id: 'withText', render: () => h('span', null, 'Live status') },
        { id: 'iconOnly', render: () => h('span', { 'aria-label': 'Sync now' }) },
      ];
    }
  }
  // Export and print: ?export loads the writers on demand and records the events
  // into window.__outputEvents; window.__cancelNext = true cancels the next before-event.
  const outputEvents: unknown[] = [];
  (window as { __outputEvents?: unknown[] }).__outputEvents = outputEvents;
  if (params.has('export')) {
    extra.exportWriters = { excel: () => import('@salmonui/export/xlsx'), pdf: () => import('@salmonui/export/pdf') };
    const cancel = (e: { preventDefault(): void }) => {
      if ((window as { __cancelNext?: boolean }).__cancelNext) {
        (window as { __cancelNext?: boolean }).__cancelNext = false;
        e.preventDefault();
      }
    };
    extra.onBeforeExport = (e) => {
      outputEvents.push({ type: e.type, format: e.format, source: e.source });
      cancel(e);
    };
    extra.onExport = (e) => outputEvents.push({ type: e.type, format: e.format, source: e.source, fileName: e.file.fileName, size: typeof e.file.data === 'string' ? e.file.data.length : e.file.data.byteLength });
    extra.onBeforePrint = (e) => {
      outputEvents.push({ type: e.type, scope: e.scope, source: e.source });
      cancel(e);
    };
    extra.onAfterPrint = (e) => outputEvents.push({ type: e.type, scope: e.scope });
    if (params.has('printPage')) extra.printing = { scope: 'page' };
  }
  // ?resizeMode=auto|normal: column fit mode; resize ends go to window.__chromeEvents.
  if (params.has('resizeMode')) {
    extra.resizeMode = params.get('resizeMode') === 'auto' ? 'auto' : 'normal';
    extra.onColumnResizeEnd = (e) => events.push({ type: 'resizeEnd', field: e.field, width: e.width, previousWidth: e.previousWidth });
  }
  // ?colEvents: column resize and drag events with their time go to window.__colEvents (tests/browser/column-drag-perf.spec.ts asserts at most one event per pointer move).
  if (params.has('colEvents')) {
    const colEvents: { type: string; field: string; at: number; width?: number; toIndex?: number }[] = [];
    (window as { __colEvents?: unknown[] }).__colEvents = colEvents;
    extra.onColumnResizeStart = (e) => colEvents.push({ type: e.type, field: e.field, at: performance.now(), width: e.width });
    extra.onColumnResize = (e) => colEvents.push({ type: e.type, field: e.field, at: performance.now(), width: e.width });
    extra.onColumnResizeEnd = (e) => colEvents.push({ type: e.type, field: e.field, at: performance.now(), width: e.width });
    extra.onColumnDragStart = (e) => colEvents.push({ type: e.type, field: e.field, at: performance.now(), toIndex: e.toIndex });
    extra.onColumnDrag = (e) => colEvents.push({ type: e.type, field: e.field, at: performance.now(), toIndex: e.toIndex });
    extra.onColumnDrop = (e) => colEvents.push({ type: e.type, field: e.field, at: performance.now(), toIndex: e.toIndex });
  }
  // ?rowTemplate: a row template (`renderRow`) that keeps the row props and the default
  // cells and flags rows by a value (paint only); row virtualization stays on.
  if (params.has('rowTemplate')) {
    extra.renderRow = ({ row, rowProps, cells }) => (
      h('div', { ...rowProps, className: `${rowProps.className} app-template-row`, 'data-template': '', 'data-flag': row['b9'] ? '' : undefined }, cells)
    );
  }
  // ?detail: a detail template on every row (renderDetail scroll gates in scroll-perf.spec.ts).
  if (params.has('detail')) extra.renderDetail = ({ row }) => h('div', { className: 'app-detail' }, 'Detail of ', row.id);
  // ?merge=rows|columns|both merges equal adjacent values grid-wide (mergeCells).
  if (params.has('merge')) {
    const merge = params.get('merge');
    extra.mergeCells = merge === 'columns' ? 'columns' : merge === 'both' ? true : 'rows';
  }
  if (params.has('filterUi')) extra.filtering = { ui: (params.get('filterUi') ?? 'excel') as 'excel' };
  // ?parts: every DataGridPart gets classNames `part-<name>` and styles `--part: <name>`.
  if (params.has('parts')) {
    const parts = ['root', 'toolbar', 'header', 'headerCell', 'body', 'row', 'cell', 'footer', 'pager', 'groupDropArea', 'groupCaption', 'detailRow', 'columnMenu', 'contextMenu', 'filterMenu', 'editor', 'empty', 'loading'] as const;
    extra.classNames = Object.fromEntries(parts.map((p) => [p, `part-${p}`]));
    extra.styles = Object.fromEntries(parts.map((p) => [p, { '--part': p } as CSSProperties]));
  }
  // Query UI switches: ?qsort[=multi] ?qfilter=row|menu|checklist|excel ?qfilterOp ?qimmediate=ms
  // ?qpage=<pageSize>&qsizes ?qsearch[=text] ?qevents (records the before/after events, as JSON, into
  // window.__queryEvents; window.__cancelNext = true cancels the next before-event).
  if (params.has('qsort')) extra.sorting = { multiple: params.get('qsort') === 'multi' };
  if (params.has('qfilter')) {
    extra.filtering = {
      ui: (params.get('qfilter') || 'row') as 'row',
      ...(params.has('qfilterOp') ? { showOperators: true } : {}),
      ...(params.has('qimmediate') ? { trigger: 'input' as const, debounce: Number(params.get('qimmediate') || 0) } : {}),
    };
  }
  // ?qbuilder: the filter builder dialog with its toolbar item.
  if (params.has('qbuilder')) {
    extra.filtering = { ...(typeof extra.filtering === 'object' ? extra.filtering : {}), builder: true };
    extra.toolbar = [...((extra.toolbar as string[] | undefined) ?? []), 'filterBuilder'] as never;
  }
  // ?qsyncUrl[=param] adds `paging.syncUrl` (read on mount, so it is a URL switch).
  if (params.has('qpage')) extra.paging = { pageSize: Number(params.get('qpage') || 50), ...(params.has('qsizes') ? { pageSizeOptions: [10, 50, 100, 'all' as const] } : {}), ...(params.has('qsyncUrl') ? { syncUrl: params.get('qsyncUrl') ? { param: params.get('qsyncUrl') as string } : true } : {}) };
  if (params.has('qsearch')) {
    extra.search = { text: params.get('qsearch') ?? '' };
    extra.toolbar ??= ['search'];
  }
  const queryEvents: unknown[] = [];
  (window as { __queryEvents?: unknown[] }).__queryEvents = queryEvents;
  if (params.has('qevents')) {
    const record = (e: { readonly type: string; preventDefault(): void }) => {
      queryEvents.push(JSON.parse(JSON.stringify(e)));
      if (e.type.startsWith('before') && (window as { __cancelNext?: boolean }).__cancelNext) {
        (window as { __cancelNext?: boolean }).__cancelNext = false;
        e.preventDefault();
      }
    };
    extra.onBeforeSortChange = record;
    extra.onSortChange = record;
    extra.onBeforeFilterChange = record;
    extra.onFilterChange = record;
    extra.onBeforeSearchChange = record;
    extra.onSearchChange = record;
    extra.onBeforePageChange = record;
    extra.onPageChange = record;
    extra.onError = (e) => queryEvents.push({ type: e.type, action: e.action, message: e.error.message });
  }
  // Persistence and globalization switches: ?persist (persistState under id "spa", localStorage), ?locale=de-DE,
  // ?gridDir=rtl|auto (the grid `dir` prop), ?l10n (the German sample catalog).
  // window.__setExtra(patch) re-renders the grid with more props (locale switch gates).
  if (params.has('persist')) {
    extra.id = 'spa';
    extra.persistState = true;
  }
  // ?gridHeight=auto|<px>: the grid height (getPageSizeForHeight test).
  if (params.has('gridHeight')) extra.height = params.get('gridHeight') === 'auto' ? 'auto' : Number(params.get('gridHeight'));
  if (params.has('rowHeight')) extra.rowHeight = num('rowHeight') as number;
  if (params.has('locale')) extra.locale = params.get('locale') ?? 'en-US';
  if (params.has('gridDir')) extra.dir = params.get('gridDir') as 'ltr' | 'rtl' | 'auto';
  if (params.has('l10n')) extra.localeText = germanLocaleText;
  // Adaptive UI: ?adaptive=vertical|horizontal [&adaptiveTarget=mobile|desktop|both].
  if (params.has('adaptive')) {
    extra.adaptive = {
      rowLayout: params.get('adaptive') === 'vertical' ? 'vertical' : 'horizontal',
      target: (params.get('adaptiveTarget') ?? 'both') as 'both',
    };
  }
  // Row and cell click events: ?rowEvents records them to window.__rowEvents;
  // ?rowEvents=prevent cancels the built-in action from onRowClick / onRowDoubleClick.
  if (params.has('rowEvents')) {
    const rowEvents: unknown[] = [];
    (window as { __rowEvents?: unknown[] }).__rowEvents = rowEvents;
    const prevent = params.get('rowEvents') === 'prevent';
    const rec = (e: { readonly type: string; readonly rowId: string; readonly field: string | null; readonly rowIndex: number; preventDefault(): void }) => {
      rowEvents.push({ type: e.type, rowId: e.rowId, field: e.field, rowIndex: e.rowIndex });
      if (prevent && e.type.startsWith('row')) e.preventDefault();
    };
    extra.onRowClick = rec;
    extra.onRowDoubleClick = rec;
    extra.onCellClick = rec;
    extra.onCellDoubleClick = rec;
  }
  if (params.has('frozenRows') ||params.has('frozenBottom') || params.has('frozenCols')) {
    extra.stickyRows = num('frozenRows') ?? 0;
    extra.stickyBottomRows = num('frozenBottom') ?? 0;
    extra.pinnedColumns = { start: num('frozenCols') ?? 0 };
  }
  // Row pinning: ?pinRows=r10,r20 pins rows by id (an empty value turns pinning on with nothing pinned).
  if (params.has('pinRows')) extra.defaultPinnedRows = (params.get('pinRows') ?? '').split(',').filter(Boolean);

  // Feature switches: ?sort&filter&paging=50&sel=multiple|checkbox|cell|both&cellMode=box&columnsSel&controlled&dir=rtl&selected=r1,r2
  // `sel=checkbox` adds a `type: 'selection'` column (the checkbox column) in front.
  const sel = params.get('sel');
  const selection: DataGridSelection | false | undefined =
    sel === null
      ? undefined
      : sel === 'checkbox'
        ? { multiple: true, ...(params.has('checkboxOnly') ? { checkboxOnly: true } : {}) }
        : sel === 'none'
          ? false
          : {
              multiple: sel !== 'single',
              mode: sel === 'cell' ? 'cell' : sel === 'both' ? 'both' : 'row',
              ...(params.get('cellMode') === 'box' || params.get('cellMode') === 'boxWithBorder' ? { cellRange: params.get('cellMode') as 'box' | 'boxWithBorder' } : {}),
              ...(params.has('columnsSel') ? { columns: true } : {}),
              ...(params.has('persist') ? { persistent: true } : {}),
            };
  if (sel === 'checkbox') gridColumns = [{ type: 'selection' }, ...gridColumns];
  // ?rowNumber adds a `type: 'rowNumber'` column in front; ?viewEvents records onViewChange into window.__queryEvents.
  if (params.has('rowNumber')) gridColumns = [{ type: 'rowNumber', pinned: 'start' }, ...gridColumns];
  if (params.has('viewEvents')) extra.onViewChange = (e) => queryEvents.push({ type: e.type, reason: e.reason, rowCount: e.rowCount, totalRowCount: e.totalRowCount, source: e.source });
  const features = {
    sort: params.has('sort'),
    filter: params.has('filter'),
    paging: params.has('paging') ? Number(params.get('paging') || 50) : null,
    selection,
    controlled: params.has('controlled'),
    dir: (params.get('dir') as 'ltr' | 'rtl' | null) ?? null,
    defaultSelectedRowIds: params.get('selected')?.split(','),
    // ?group=s0,b9 groups by those columns; ?aggs adds footer, group footer and caption aggregates on n4..n6.
    group: params.get('group')?.split(',').filter(Boolean) ?? null,
    aggregates: params.has('aggs'),
    collapsed: params.has('collapsed'),
    search: params.has('search') || params.has('chrome'),
  };

  // ?keyBindings=<json> sets the initial `keyBindings` prop. ?secondGrid adds a second,
  // searchable grid with its own search label. window.__setMounted(false) unmounts the
  // whole app, like a route change.
  if (params.has('keyBindings')) extra.keyBindings = JSON.parse(params.get('keyBindings') || '{}') as Record<string, string[]>;

  // Editing switches: ?edit=row|batch|dialog|cell, ?econfirm (confirmDelete), ?ecommands
  // (command column first), ?enosaveconfirm (confirmSave: false), ?enodiscard (confirmDiscard: false), ?etoolbar
  // (edit toolbar items), ?eundo (undo/redo), ?eguard (guardUnsaved), ?enewrow[=bottom] (showNewRow), ?erowrule (validateRow rejects s1 = "ROW"). Edit events go to window.__editEvents; s1 is
  // required (validation tests).
  const editEvents: unknown[] = [];
  (window as { __editEvents?: unknown[] }).__editEvents = editEvents;
  if (params.has('edit')) {
    const mode = (params.get('edit') || 'row') as 'row' | 'batch' | 'dialog' | 'cell';
    extra.editing = {
      mode,
      confirmDelete: params.has('econfirm'),
      ...(params.has('enosaveconfirm') ? { confirmSave: false } : {}),
      ...(params.has('enodiscard') ? { confirmDiscard: false } : {}),
      undo: params.has('eundo'),
      ...(params.has('eguard') ? { guardUnsaved: true } : {}),
      ...(params.has('enewrow') ? { showNewRow: true, newRowPosition: params.get('enewrow') === 'bottom' ? ('bottom' as const) : ('top' as const) } : {}),
      ...(params.has('erowrule') ? { validateRow: (row: Record<string, unknown>) => (row['s1'] === 'ROW' ? 'Text 1 cannot be ROW for this row.' : null) } : {}),
    };
    if (params.has('etoolbar')) extra.toolbar = ['add', 'edit', 'delete', 'save', 'cancel'];
    gridColumns = gridColumns.map((c) => (c.field === 's1' ? { ...c, validation: { required: true } } : c));
    if (params.has('ecommands')) {
      gridColumns = [{ id: 'commands', header: 'Commands', width: 170, commands: [{ type: 'edit' }, { type: 'delete' }, { type: 'save' }, { type: 'cancel' }] }, ...gridColumns];
    }
    const record = (e: { readonly type: string }) => editEvents.push({ type: e.type, ...(('rowId' in e) ? { rowId: (e as { rowId: unknown }).rowId } : {}) });
    extra.onEditStart = record;
    extra.onSave = record;
    extra.onAdd = record;
    extra.onDelete = record;
    extra.onEditCancel = record;
    // ?efill: fill handle. Clipboard before-events are recorded with their data; window.__clipboardHook(e)
    // may change `data` or call preventDefault().
    if (params.has('efill')) extra.editing = { ...extra.editing, fillHandle: true };
    const hook = (e: { readonly type: string; data?: string; preventDefault(): void }) => {
      (window as { __clipboardHook?: (e: unknown) => void }).__clipboardHook?.(e);
      editEvents.push(JSON.parse(JSON.stringify(e)));
    };
    extra.onBeforeCopy = hook;
    extra.onBeforePaste = hook;
    extra.onBeforeFill = hook;
  }
  // ?rowHeights: conditional `getRowHeight`: every third row is 64 px, the others 32 px.
  if (params.has('rowHeights')) extra.getRowHeight = (row) => (Number(String(row.id).slice(1)) % 3 === 0 ? 64 : 32);
  // ?lazyGroups: lazy grouping by s0 over a fake remote source. window.__lazyRemote:
  // `hold` parks group-children reads in `pending` until release(); `fail` rejects them.
  if (params.has('lazyGroups')) {
    const lazy = {
      hold: false,
      fail: false,
      pending: [] as (() => void)[],
      release(): void {
        for (const run of this.pending.splice(0)) run();
      },
    };
    (window as { __lazyRemote?: typeof lazy }).__lazyRemote = lazy;
    const source: DataSource<Row> = {
      mode: 'remote',
      capabilities: { lazyGroups: true },
      read: (request) =>
        new Promise<DataSourceResult<Row>>((resolve, reject) => {
          const path = request.groupPath ?? [];
          const run = (): void => {
            if (lazy.fail && path.length > 0) return reject(new Error('Group load failed'));
            const match = rows.filter((r) => path.every((s) => r[s.columnId] === s.key));
            const level = request.query.grouping[path.length];
            if (level) {
              const keys = [...new Set(match.map((r) => String(r[level.columnId])))].sort();
              const envelopes = keys.map((key) => ({ kind: 'group' as const, key, columnId: level.columnId, groupPath: [...path, { columnId: level.columnId, key }], count: match.filter((r) => r[level.columnId] === key).length }));
              return resolve({ version: request.version, rows: envelopes as unknown as Row[], totalRowCount: envelopes.length, performed: ['search', 'filter', 'sort', 'group', 'aggregate'] });
            }
            const range = request.range ?? { start: 0, end: match.length };
            resolve({ version: request.version, rows: match.slice(range.start, range.end), totalRowCount: match.length, pageInfo: { hasNextPage: range.end < match.length } });
          };
          if (lazy.hold && path.length > 0) lazy.pending.push(run);
          else setTimeout(run, 0);
        }),
    };
    extra.data = source;
    extra.grouping = { groupBy: ['s0'], lazy: true };
  }

  return { columns: gridColumns, extra, features, secondGrid: params.has('secondGrid') };
}
