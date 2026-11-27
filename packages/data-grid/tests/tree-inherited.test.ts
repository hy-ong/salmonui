// Tree mode with the inherited Data Grid features: selection kept across collapse, detail rows
// following their tree row, export options passed through the instance
// API, persisted expansion, adaptive cards, the tree column following
// column chrome, row spans bounded by parent rows, lookup columns and
// validation, templates and theming, globalization, the shared methods and
// events, and the development warnings of the props a tree ignores.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataGrid, type DataGridColumn, type DataGridProps } from '@salmonui/data-grid';
import { count, newInstance } from './fixtures.ts';

interface Task {
  readonly id: string;
  readonly name: string;
  readonly hours: number;
  readonly team?: string;
  readonly ownerId?: number;
  readonly children?: Task[];
}

const nested = (): Task[] => [
  {
    id: 'a',
    name: 'Alpha',
    hours: 1.5,
    team: 'P',
    ownerId: 1,
    children: [
      { id: 'a1', name: 'Alpha one', hours: 2, team: 'X', ownerId: 2, children: [{ id: 'a1x', name: 'Alpha one x', hours: 1, team: 'X', ownerId: 1 }] },
      { id: 'a2', name: 'Alpha two', hours: 3, team: 'X', ownerId: 2 },
    ],
  },
  { id: 'b', name: 'Beta', hours: 1234.5, team: 'X', ownerId: 1 },
];

const columns: DataGridColumn<Task>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 80 },
  { field: 'name', header: 'Name', width: 200 },
  { field: 'hours', header: 'Hours', type: 'number', width: 90 },
];

function html(props: Partial<DataGridProps<Task>> = {}): string {
  return renderToString(createElement(DataGrid as (p: DataGridProps<Task>) => ReactElement, { 'aria-label': 'Tasks', data: nested(), columns, tree: true, timeZone: 'UTC', ...props } as DataGridProps<Task>));
}

function rowTag(markup: string, rowId: string): string {
  const m = markup.match(new RegExp(`<div[^>]*role="row"[^>]*data-row-id="${rowId}"[^>]*>`));
  assert.ok(m, `row ${rowId}`);
  return m[0];
}

const ids = (inst: { engine: { getSnapshot(): { rows: { count: number } }; getRowIdAt(i: number): string | undefined } }): string[] => {
  const out: string[] = [];
  const n = inst.engine.getSnapshot().rows.count;
  for (let i = 0; i < n; i++) out.push(inst.engine.getRowIdAt(i) as string);
  return out;
};

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function captureWarnings<T>(run: () => T): { result: T; warnings: string[] } {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(' '));
  try {
    return { result: run(), warnings };
  } finally {
    console.warn = original;
  }
}

describe('selection across collapse', () => {
  it('collapsing never deselects; the checkbox cascade reaches hidden descendants', () => {
    const inst = newInstance<Task>({ data: nested(), columns, tree: { checkbox: { cascade: true } }, selection: { multiple: true } }, ':sel42:');
    const unmount = inst.mount();
    try {
      inst.api.selectRows(['a1x', 'a2']);
      inst.api.collapseTreeRows('a1');
      assert.deepEqual([...inst.api.getSelectedRowIds()].sort(), ['a1x', 'a2']);
      inst.api.collapseAllTreeRows();
      assert.deepEqual(inst.api.getVisibleRows().map((r) => r.id), ['a', 'b']);
      assert.deepEqual([...inst.api.getSelectedRowIds()].sort(), ['a1x', 'a2'], 'rows hidden by a collapse stay selected');
      inst.api.clearSelection();
      // Every parent is collapsed: the cascade still selects the whole (hidden) subtree.
      inst.dispatchFrom('api', { type: 'tree.check', rowId: 'a' });
      assert.deepEqual([...inst.api.getSelectedRowIds()].sort(), ['a', 'a1', 'a1x', 'a2']);
      inst.api.expandAllTreeRows();
      assert.deepEqual([...inst.api.getSelectedRowIds()].sort(), ['a', 'a1', 'a1x', 'a2']);
    } finally {
      unmount();
    }
  });
});

describe('detail rows in tree mode', () => {
  const renderDetail = ({ row }: { row: Task }) => createElement('p', { className: 'probe-detail' }, `Detail ${row.id}`);

  it('the server renders the detail row right after its tree row', () => {
    const out = html({ renderDetail, defaultExpandedDetails: ['a1'] } as Partial<DataGridProps<Task>>);
    assert.match(out, /role="treegrid"/);
    const a1 = out.indexOf('data-row-id="a1"');
    const detail = out.indexOf('data-row-id="__detail:a1"');
    const a1x = out.indexOf('data-row-id="a1x"');
    assert.ok(a1 >= 0 && detail > a1 && a1x > detail, 'detail row between a1 and its child a1x');
    assert.match(out, /<p class="probe-detail">Detail a1<\/p>/);
  });

  it('the detail row follows its row and hides when an ancestor collapses', () => {
    const inst = newInstance<Task>({ data: nested(), columns, tree: true, renderDetail, defaultExpandedDetails: ['a1x'] }, ':det19:');
    const unmount = inst.mount();
    try {
      assert.deepEqual(ids(inst), ['a', 'a1', 'a1x', '__detail:a1x', 'a2', 'b']);
      inst.api.collapseTreeRows('a1');
      assert.deepEqual(ids(inst), ['a', 'a1', 'a2', 'b']);
      inst.api.collapseTreeRows('a');
      assert.deepEqual(ids(inst), ['a', 'b']);
      inst.api.expandAllTreeRows();
      assert.deepEqual(ids(inst), ['a', 'a1', 'a1x', '__detail:a1x', 'a2', 'b'], 'the detail stays expanded under its row');
    } finally {
      unmount();
    }
  });
});

describe('export options through the instance API in tree mode', () => {
  it("exportToCsv passes tree and treeDepthColumn: 'expanded' writes the visible rows, 'all' every row with its depth", async () => {
    const inst = newInstance<Task>({ data: nested(), columns, tree: true }, ':csv70:');
    const unmount = inst.mount();
    try {
      inst.api.collapseTreeRows('a1');
      const visible = await inst.api.exportToCsv({ download: false });
      assert.ok(visible);
      assert.doesNotMatch(visible.data, /a1x/);
      const all = await inst.api.exportToCsv({ download: false, tree: 'all', treeDepthColumn: true });
      assert.ok(all);
      const lines = all.data.trim().split(/\r?\n/);
      assert.match(lines[0] as string, /Depth/);
      assert.ok(lines.some((l) => /a1x/.test(l) && /(^|,)2(,|$)/.test(l)), 'a1x is written with depth 2');
      const named = await inst.api.exportToCsv({ download: false, tree: 'all', treeDepthColumn: 'Level' });
      assert.match((named?.data ?? '').split(/\r?\n/)[0] as string, /Level/);
    } finally {
      unmount();
    }
  });

  it('exportToExcel hands tree and outlineCollapsed to the writer with the tree engine', async () => {
    let seen: { source: unknown; options: Record<string, unknown> } | null = null;
    const writer = async (source: unknown, options?: Record<string, unknown>) => {
      seen = { source, options: options ?? {} };
      return { data: new Uint8Array([1]), fileName: 'x.xlsx', mimeType: 'application/octet-stream' };
    };
    const inst = newInstance<Task>({ data: nested(), columns, tree: true, exportWriters: { excel: async () => ({ exportXlsx: writer }) } }, ':xlsx70:');
    const unmount = inst.mount();
    try {
      inst.api.collapseTreeRows('a');
      const file = await inst.api.exportToExcel({ download: false, tree: 'all', outlineCollapsed: true });
      assert.ok(file);
      const got = seen as unknown as { source: { tree?: unknown; rows(): Iterable<{ kind: string; id?: string; depth?: number; collapsed?: true; hidden?: true }> }; options: Record<string, unknown> };
      assert.equal(got.options['outlineCollapsed'], true);
      // The writer gets the tree export model: every row with its depth and the collapsed outline state.
      const rows = [...got.source.rows()].filter((r) => r.kind === 'data');
      assert.ok(got.source.tree);
      assert.deepEqual(
        rows.map((r) => `${r.id}:${r.depth}${r.collapsed ? ' collapsed' : ''}${r.hidden ? ' hidden' : ''}`),
        ['a:0 collapsed', 'a1:1 hidden', 'a1x:2 hidden', 'a2:1 hidden', 'b:0'],
      );
    } finally {
      unmount();
    }
  });
});

describe('persisted expansion', () => {
  it('persistState saves after a toggle; a new grid restores the expansion', async () => {
    const store = new Map<string, unknown>();
    const storage = { load: (key: string) => store.get(key) ?? null, save: (key: string, state: unknown) => void store.set(key, JSON.parse(JSON.stringify(state))), remove: (key: string) => void store.delete(key) };
    const first = newInstance<Task>({ id: 'tp', data: nested(), columns, tree: true, persistState: { storage } }, ':tp1:');
    const off = first.mount();
    try {
      await tick();
      first.api.toggleTreeRow('a1');
      await tick();
      const saved = store.get('salmon-data-grid:tp') as { tree?: { expandedRows?: Record<string, boolean> } } | undefined;
      assert.equal(saved?.tree?.expandedRows?.['a1'], false);
    } finally {
      off();
    }
    const second = newInstance<Task>({ id: 'tp', data: nested(), columns, tree: true, persistState: { storage } }, ':tp2:');
    const off2 = second.mount();
    try {
      await tick();
      assert.equal(second.api.getTreeRow('a1')?.expanded, false);
      assert.deepEqual(second.api.getVisibleRows().map((r) => r.id), ['a', 'a1', 'a2', 'b']);
    } finally {
      off2();
    }
  });
});

describe('adaptive cards', () => {
  it('vertical cards keep the toggle and read "Level n" instead of the indentation', () => {
    const out = html({ adaptive: { rowLayout: 'vertical' } } as Partial<DataGridProps<Task>>);
    assert.match(out, /salmon-data-grid-card/);
    assert.match(out, /<span class="salmon-data-grid-tree-level">Level 1<\/span>/);
    assert.match(out, /<span class="salmon-data-grid-tree-level">Level 3<\/span>/);
    assert.match(out, /aria-label="Collapse a"/);
    assert.doesNotMatch(out, /--salmon-data-grid-tree-depth:2/);
  });
});

describe('column chrome moves the tree column', () => {
  it('hiding, reordering and pinning: the tree column is the next visible data column', () => {
    const inst = newInstance<Task>({ data: nested(), columns, tree: true }, ':col80:');
    const unmount = inst.mount();
    try {
      const treeCol = () => (inst.features.parts.treeCell as { is(i: unknown, c: string): boolean }).is;
      const which = () => ['id', 'name', 'hours'].find((c) => treeCol()(inst, c));
      assert.equal(which(), 'id');
      inst.engine.dispatch({ type: 'columns.hide', keys: ['id'] });
      assert.equal(which(), 'name');
      inst.engine.dispatch({ type: 'columns.show', keys: ['id'] });
      inst.engine.dispatch({ type: 'columns.move', columnId: 'hours', toIndex: 0 });
      assert.equal(which(), 'hours');
      inst.engine.dispatch({ type: 'columns.move', columnId: 'hours', toIndex: 2 });
      inst.engine.dispatch({ type: 'columns.setFreeze', columnId: 'name', freeze: 'left' } as never);
      assert.equal(which(), 'name', 'a pinned column leads the visible order');
    } finally {
      unmount();
    }
  });
});

describe('row spans in tree mode', () => {
  it('a merged row span ends at the next row shallower than its first row', () => {
    const spanned: DataGridColumn<Task>[] = [...columns, { field: 'team', header: 'Team', width: 80, rowSpan: true } as DataGridColumn<Task>];
    const out = html({ columns: spanned });
    // a1 (depth 1) merges a1x (2) and a2 (1); b (depth 0) starts again.
    assert.match(out, /data-row-id="a1"[\s\S]*?data-column-id="team"[^>]*aria-rowspan="3"|aria-rowspan="3"[^>]*data-column-id="team"/);
    assert.doesNotMatch(out, /aria-rowspan="4"/);
    // Without the tree the same rows merge across the parent boundary.
    const flatRows = [
      { id: 'a', name: 'Alpha', hours: 0, team: 'P' },
      { id: 'a1', name: 'A1', hours: 0, team: 'X' },
      { id: 'a1x', name: 'A1x', hours: 0, team: 'X' },
      { id: 'a2', name: 'A2', hours: 0, team: 'X' },
      { id: 'b', name: 'B', hours: 0, team: 'X' },
    ];
    assert.match(html({ columns: spanned, tree: false, data: flatRows }), /aria-rowspan="4"/);
  });

  it('an explicit row span is clamped at the parent boundary', () => {
    const spanned: DataGridColumn<Task>[] = [...columns, { field: 'team', header: 'Team', width: 80, rowSpan: ({ rowId }: { rowId: string }) => (rowId === 'a2' ? 3 : 1) } as DataGridColumn<Task>];
    const out = html({ columns: spanned });
    // a2 (depth 1) would cover b (depth 0): clamped to one row, so no span at all.
    assert.doesNotMatch(out, /aria-rowspan/);
  });
});

describe('lookup columns and validation', () => {
  const owners = [
    { id: 1, label: 'Ada' },
    { id: 2, label: 'Grace' },
  ];
  const fk: DataGridColumn<Task>[] = [
    ...columns.map((c) => (c.field === 'name' ? ({ ...c, validation: { required: true, minLength: 3 } } as DataGridColumn<Task>) : c)),
    { field: 'ownerId', header: 'Owner', width: 120, lookup: { data: owners, keyField: 'id', displayField: 'label' } } as DataGridColumn<Task>,
  ];

  it('lookup display values render in tree rows on the server', () => {
    const out = html({ columns: fk });
    assert.match(out, /data-row-id="a1x"[\s\S]*?data-column-id="ownerId"[^>]*>(?:<[^>]+>)*Ada/);
    assert.match(out, /data-row-id="a2"[\s\S]*?data-column-id="ownerId"[^>]*>(?:<[^>]+>)*Grace/);
  });

  it('validation rejects an invalid tree row edit and keeps the row in place', async () => {
    const inst = newInstance<Task>({ data: nested(), columns: fk, tree: true, editing: { mode: 'row' } }, ':val83:');
    const unmount = inst.mount();
    try {
      await tick(50);
      assert.equal(inst.api.updateRow('a1x', { name: 'x' }).status, 'rejected');
      assert.equal(inst.api.getTreeRow('a1x')?.depth, 2);
      assert.equal(inst.api.updateRow('a1x', { name: 'Renamed' }).status === 'rejected', false);
      await inst.api.whenEditSettled();
      assert.equal(inst.engine.getRow('a1x')?.name, 'Renamed');
      assert.equal(inst.api.getTreeRow('a1x')?.parentId, 'a1');
    } finally {
      unmount();
    }
  });
});

describe('templates and theming', () => {
  it('rowClassName, getCellProps, classNames, grid lines and alternate rows apply to tree rows', () => {
    const out = html({
      rowClassName: (row: Task) => `depth-${row.id.length}`,
      getCellProps: ({ rowId }: { rowId: string }) => ({ 'data-probe': rowId }),
      classNames: { row: 'my-row' },
      gridLines: 'both',
    } as Partial<DataGridProps<Task>>);
    assert.match(out, /role="treegrid"[^>]*data-grid-lines="both"/);
    assert.match(rowTag(out, 'a1x'), /class="salmon-data-grid-row my-row depth-3"/);
    assert.match(rowTag(out, 'a1'), /data-alt=""/);
    assert.match(out, /data-probe="a1x"/);
    // The tree column keeps its toggle with a renderCell template.
    const tpl = html({ columns: [{ ...columns[0], renderCell: () => createElement('em', null, 'T') } as DataGridColumn<Task>, ...columns.slice(1)] });
    assert.equal(count(tpl, /<button[^>]*salmon-data-grid-tree-toggle/), 2);
    assert.equal(count(tpl, /<em>T<\/em>/), 5);
  });
});

describe('globalization', () => {
  it('locale formats tree cells, localeText names the toggles, RTL keeps the treegrid', () => {
    const out = html({
      locale: 'de-DE',
      dir: 'rtl',
      columns: [columns[0] as DataGridColumn<Task>, columns[1] as DataGridColumn<Task>, { ...columns[2], format: 'N1' } as DataGridColumn<Task>],
      localeText: { treeCollapse: '{row} zuklappen', treeExpand: '{row} aufklappen' },
    } as Partial<DataGridProps<Task>>);
    assert.match(out, /role="treegrid"[^>]*dir="rtl"/);
    assert.match(out, /1\.234,5/);
    assert.match(out, /aria-label="a zuklappen"/);
  });
});

describe('shared methods and events', () => {
  it('sort, filter, search, selection and focus act on the tree with their events', () => {
    const events: string[] = [];
    const inst = newInstance<Task>(
      {
        data: nested(),
        columns,
        tree: true,
        sorting: true,
        filtering: true,
        search: true,
        selection: { multiple: true },
        onSortChange: () => events.push('sortChange'),
        onFilterChange: () => events.push('filterChange'),
        onSearchChange: () => events.push('searchChange'),
        onSelectionChange: () => events.push('selectionChange'),
      },
      ':api86:',
    );
    const unmount = inst.mount();
    try {
      // Sorting orders siblings, never across parents.
      assert.equal(inst.api.sortColumn('hours', 'desc').status, 'applied');
      assert.deepEqual(ids(inst), ['b', 'a', 'a2', 'a1', 'a1x']);
      inst.api.clearSorting();
      // Filtering keeps the ancestors of a match (default filterMode).
      inst.api.filterColumn('name', 'equal', 'Alpha one x');
      assert.deepEqual(ids(inst), ['a', 'a1', 'a1x']);
      assert.equal(inst.api.getTreeRow('a')?.context, true);
      inst.api.clearFiltering();
      inst.api.search('two');
      assert.deepEqual(ids(inst), ['a', 'a2']);
      inst.api.clearSearch();
      inst.api.selectRows(['a2']);
      assert.deepEqual([...inst.api.getSelectedRowIds()], ['a2']);
      assert.equal(inst.api.getRowInfo?.('a2')?.rowIndex ?? inst.engine.getRowIndex('a2'), 3);
      assert.deepEqual(
        [...new Set(events)].sort(),
        ['filterChange', 'searchChange', 'selectionChange', 'sortChange'],
      );
      // Rows of every depth answer the row methods.
      assert.equal(inst.api.getSelectedRows()[0]?.name, 'Alpha two');
      assert.equal(inst.api.getVisibleRows().length, 5);
    } finally {
      unmount();
    }
  });
});

describe('bulk toggles are cancelable', () => {
  it('collapseAll, expandAll and levels fire onBeforeTreeToggle per changing parent; a cancel stops the whole command', () => {
    const before: string[] = [];
    const after: string[] = [];
    let cancel = true;
    const inst = newInstance<Task>(
      {
        data: nested(),
        columns,
        tree: true,
        onBeforeTreeToggle: (e: { rowId: string; expanded: boolean; preventDefault(): void }) => {
          before.push(`${e.rowId}:${e.expanded}`);
          if (cancel) e.preventDefault();
        },
        onTreeToggle: (e: { rowId: string; expanded: boolean }) => after.push(`${e.rowId}:${e.expanded}`),
      },
      ':bulk24:',
    );
    const unmount = inst.mount();
    try {
      assert.equal(inst.api.collapseAllTreeRows().status, 'rejected');
      assert.equal(inst.api.getTreeRow('a')?.expanded, true);
      assert.equal(inst.api.getTreeRow('a1')?.expanded, true);
      assert.deepEqual(before, ['a:false'], 'the first cancel stops the command');
      assert.deepEqual(after, []);
      cancel = false;
      before.length = 0;
      assert.equal(inst.api.collapseAllTreeRows().status, 'applied');
      assert.deepEqual(before, ['a:false', 'a1:false']);
      assert.deepEqual(after, ['a:false', 'a1:false']);
      before.length = 0;
      cancel = true;
      assert.equal(inst.api.expandTreeLevel(0).status, 'rejected');
      assert.equal(inst.api.getTreeRow('a')?.expanded, false);
      assert.deepEqual(before, ['a:true']);
    } finally {
      unmount();
    }
  });
});

describe('props a tree ignores', () => {
  it('grouping and childGrid warn once in development; the tree wins', () => {
    const { result: grouped, warnings } = captureWarnings(() => newInstance<Task>({ data: nested(), columns, tree: true, grouping: { fields: ['hours'] } }, ':g87:'));
    assert.ok(warnings.some((w) => /`grouping` is ignored in tree mode \(tree wins\)/.test(w)), warnings.join('\n'));
    assert.equal(grouped.api.getTreeRow('a1x')?.depth, 2);
    assert.deepEqual(ids(grouped), ['a', 'a1', 'a1x', 'a2', 'b'], 'no group caption rows');
    const childGrid = { data: [], parentField: 'id', childField: 'taskId', columns: [{ field: 'x', header: 'X' }] };
    const { result: child, warnings: w2 } = captureWarnings(() => newInstance<Task>({ data: nested(), columns, tree: true, childGrid }, ':c87:'));
    assert.ok(w2.some((w) => /`childGrid` does not combine with `tree` \(tree wins\)/.test(w)), w2.join('\n'));
    assert.deepEqual(ids(child), ['a', 'a1', 'a1x', 'a2', 'b']);
    // Without tree no warning.
    const { warnings: none } = captureWarnings(() => newInstance<Task>({ data: nested(), columns, grouping: { fields: ['hours'] } }, ':n87:'));
    assert.ok(!none.some((w) => /tree mode/.test(w)));
  });
});
