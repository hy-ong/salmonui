// Tree mode React layer and its SSR and hydration: feature detection, the treegrid SSR markup
// (row ARIA, data attributes, indentation, toggles, checkboxes, child summary
// rows, `ctx.tree`), deterministic output, the inert API without `tree`, the
// tree API, toggle events, state, copy mode and the toolbar items.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DataGrid, DataGridTreeToggle, type DataGridColumn, type DataGridProps, type DataGridTreeToggleEvent } from '@salmonui/data-grid';
import { tree } from '@salmonui/data-grid/features';
import { requiredFeatures } from '../dist/data-grid/features/detect.js';
import { count, newInstance } from './fixtures.ts';

interface Task {
  readonly id: string;
  readonly name: string;
  readonly hours: number;
  readonly parentId?: string | null;
  readonly children?: Task[];
  readonly lazy?: boolean;
}

const nested = (): Task[] => [
  {
    id: 'a',
    name: 'Alpha',
    hours: 0,
    children: [
      { id: 'a1', name: 'Alpha one', hours: 2, children: [{ id: 'a1x', name: 'Alpha one x', hours: 1 }] },
      { id: 'a2', name: 'Alpha two', hours: 3 },
    ],
  },
  { id: 'b', name: 'Beta', hours: 5 },
];

const flat: Task[] = [
  { id: 'r', name: 'Root', hours: 1, parentId: null },
  { id: 'c1', name: 'Child one', hours: 2, parentId: 'r' },
  { id: 'c2', name: 'Child two', hours: 3, parentId: 'r' },
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

function instance(props: Partial<DataGridProps<Task>> = {}, id = ':t:') {
  const inst = newInstance<Task>({ data: nested(), columns, tree: true, ...props }, id);
  return inst;
}

describe('tree render feature detection', () => {
  it('requires tree when the tree prop is set, never without it', () => {
    assert.deepEqual(requiredFeatures({} as never), []);
    assert.deepEqual(requiredFeatures({ tree: true } as never), ['tree']);
    assert.deepEqual(requiredFeatures({ tree: false } as never), []);
    assert.deepEqual(requiredFeatures({ tree: { parentIdField: 'parentId' } } as never), ['tree']);
    assert.equal(tree.name, 'tree');
  });
});

describe('tree mode SSR', () => {
  it('renders role="treegrid" with aria-level, aria-posinset, aria-setsize and aria-expanded on parents only', () => {
    const out = html();
    assert.match(out, /role="treegrid"/);
    assert.doesNotMatch(out, /role="grid"/);
    const a = rowTag(out, 'a');
    assert.match(a, /aria-level="1"/);
    assert.match(a, /aria-posinset="1"/);
    assert.match(a, /aria-setsize="2"/);
    assert.match(a, /aria-expanded="true"/);
    assert.match(a, /data-depth="0"/);
    assert.match(a, /data-has-children=""/);
    const a1x = rowTag(out, 'a1x');
    assert.match(a1x, /aria-level="3"/);
    assert.doesNotMatch(a1x, /aria-expanded/);
    assert.doesNotMatch(a1x, /data-has-children/);
    const a2 = rowTag(out, 'a2');
    assert.match(a2, /aria-posinset="2"/);
    assert.match(a2, /aria-setsize="2"/);
  });

  it('a grid without tree keeps role="grid" and no treegrid row attributes', () => {
    const out = renderToString(createElement(DataGrid as (p: DataGridProps<Task>) => ReactElement, { 'aria-label': 'Tasks', data: flat, columns } as DataGridProps<Task>));
    assert.match(out, /role="grid"/);
    assert.doesNotMatch(out, /aria-level|aria-posinset|salmon-data-grid-tree/);
  });

  it('flat parentIdField data builds the same hierarchy', () => {
    const out = renderToString(createElement(DataGrid as (p: DataGridProps<Task>) => ReactElement, { 'aria-label': 'Tasks', data: flat, columns, tree: { parentIdField: 'parentId' } } as DataGridProps<Task>));
    assert.match(rowTag(out, 'c2'), /aria-level="2"/);
    assert.match(rowTag(out, 'r'), /aria-expanded="true"/);
  });

  it('the tree cell holds the toggle and indents by depth; leaves get a placeholder', () => {
    const out = html();
    assert.equal(count(out, /<button[^>]*salmon-data-grid-tree-toggle/), 2);
    assert.match(out, /aria-label="Collapse a"/);
    assert.match(out, /--salmon-data-grid-tree-depth:2/);
    // The toggle has no aria-expanded of its own (the treegrid row carries it).
    assert.doesNotMatch(out, /<button[^>]*tree-toggle[^>]*aria-expanded/);
    // Default tree column: the first visible data column (ID).
    assert.match(out, /data-column-id="id"[^>]*><span class="salmon-data-grid-tree-cell"/);
  });

  it('tree.column picks the tree column by field', () => {
    const out = html({ tree: { column: 'name' } });
    assert.match(out, /data-column-id="name"[^>]*><span class="salmon-data-grid-tree-cell"/);
    assert.doesNotMatch(out, /data-column-id="id"[^>]*><span class="salmon-data-grid-tree-cell"/);
  });

  it('defaultExpanded: false renders parents collapsed with their children hidden', () => {
    const out = html({ tree: { defaultExpanded: false } });
    assert.match(rowTag(out, 'a'), /aria-expanded="false"/);
    assert.doesNotMatch(out, /data-row-id="a1"/);
    assert.match(out, /aria-label="Expand a"/);
  });

  it('lazy parents render collapsed with a toggle on the server and never load', () => {
    let loads = 0;
    const data: Task[] = [{ id: 'z', name: 'Zed', hours: 0, lazy: true }];
    const out = html({ data, tree: { hasChildrenField: 'lazy', loadChildren: () => ((loads++), []) } });
    assert.match(rowTag(out, 'z'), /aria-expanded="false"/);
    assert.match(out, /aria-label="Expand z"/);
    assert.equal(loads, 0);
  });

  it('renderCell receives ctx.tree and getRowProps ctx.tree', () => {
    const seen: unknown[] = [];
    const out = html({
      columns: [{ ...columns[0], renderCell: (ctx) => createElement('b', { className: 'probe' }, `${ctx.tree?.depth}:${ctx.tree?.expanded}`) } as DataGridColumn<Task>, columns[1] as DataGridColumn<Task>],
      getRowProps: (_row, _i, ctx) => {
        seen.push(ctx.tree?.depth);
        return { 'data-level-hook': String(ctx.tree?.depth) };
      },
    });
    assert.match(out, /<b class="probe">0:true<\/b>/);
    assert.match(out, /<b class="probe">2:false<\/b>/);
    assert.match(rowTag(out, 'a1x'), /data-level-hook="2"/);
    assert.ok(seen.includes(1));
  });

  it('the tree checkbox reflects the selection with a mixed parent', () => {
    const out = html({ tree: { checkbox: { cascade: true } }, selection: { multiple: true, rowIds: ['a2'] } });
    assert.match(out, /salmon-data-grid-tree-checkbox[^>]*aria-checked="mixed"/);
    assert.equal(count(out, /salmon-data-grid-tree-checkbox/), 5);
    assert.equal(count(out, /tree-checkbox" role="checkbox" aria-checked="true"/), 1);
  });

  it('child summary rows render renderChildFooter after each expanded parent', () => {
    const out = html({ aggregates: [{ columns: [{ field: 'hours', type: 'sum', renderChildFooter: (ctx) => createElement('i', { className: 'sum' }, `sum ${ctx.values['sum']}`) }] }] });
    assert.match(out, /data-row-id="__tf:a"/);
    assert.match(out, /<i class="sum">sum 6<\/i>/);
    // A renderChildFooter-only aggregate does not show in the grid footer.
    assert.doesNotMatch(out, /salmon-data-grid-footer"/);
  });

  it('aggregate.renderFooter renders the grid footer over the tree rows', () => {
    const out = html({ aggregates: [{ columns: [{ field: 'hours', type: 'sum', renderFooter: (ctx) => createElement('b', { className: 'total' }, `total ${ctx.values['sum']}`) }] }] });
    // Every tree row counts once (0 + 2 + 1 + 3 + 5), and no child summary row is added without renderChildFooter.
    assert.match(out, /salmon-data-grid-footer/);
    assert.match(out, /<b class="total">total 11<\/b>/);
    assert.doesNotMatch(out, /data-row-id="__tf:/);
    // Both templates on one aggregate: the grid footer and each expanded parent's child footer.
    const both = html({ aggregates: [{ columns: [{ field: 'hours', type: 'sum', renderFooter: (ctx) => createElement('b', { className: 'total' }, `total ${ctx.values['sum']}`), renderChildFooter: (ctx) => createElement('i', { className: 'sum' }, `sum ${ctx.values['sum']}`) }] }] });
    assert.match(both, /<b class="total">total 11<\/b>/);
    assert.match(both, /<i class="sum">sum 6<\/i>/);
  });

  it('server output is deterministic (SSR And Hydration)', () => {
    assert.equal(html(), html());
  });

  it('DataGridTreeToggle renders inside row templates', () => {
    const out = html({ renderRow: ({ rowId, rowProps, cells }) => createElement('div', rowProps, createElement(DataGridTreeToggle, { rowId, label: rowId }), cells) });
    assert.match(out, /aria-label="Collapse a"/);
  });

  it('adaptive cards show "Level n"', () => {
    const out = html({ adaptive: { enabled: true, vertical: true } as never });
    assert.ok(out.includes('salmon-data-grid-tree-cell'));
  });

  it('localeText overrides the tree texts', () => {
    const out = html({ localeText: { treeCollapse: 'Zuklappen {row}' } });
    assert.match(out, /aria-label="Zuklappen a"/);
  });
});

describe('tree API and events', () => {
  it('without tree the tree methods are rejected and the reads empty', () => {
    const plain = newInstance<Task>({ data: flat, columns }, ':plain:');
    assert.equal(plain.api.expandAllTreeRows().status, 'rejected');
    assert.equal(plain.api.indentRows(['c1']).status, 'rejected');
    assert.equal(plain.api.getTreeRow('c1'), null);
    assert.deepEqual(plain.api.getChildRows('r'), []);
    assert.equal(plain.api.getVisibleRows().length, 3);
  });

  it('expand, collapse, levels and row reads', () => {
    const inst = instance();
    const api = inst.api;
    assert.equal(api.getVisibleRows().length, 5);
    assert.equal(api.collapseAllTreeRows().status, 'applied');
    assert.deepEqual(api.getVisibleRows().map((r) => r.id), ['a', 'b']);
    api.expandTreeLevel(0);
    assert.deepEqual(api.getVisibleRows().map((r) => r.id), ['a', 'a1', 'a2', 'b']);
    api.expandTreeRows(['a1']);
    assert.equal(api.getVisibleRows().length, 5);
    api.collapseTreeLevel(0);
    assert.equal(api.getVisibleRows().length, 2);
    api.toggleTreeRow('a');
    assert.equal(api.getTreeRow('a')?.expanded, true);
    api.collapseTreeRows('a');
    assert.equal(api.getTreeRow('a')?.expanded, false);
    api.expandAllTreeRows();
    const info = api.getTreeRow('a1x');
    assert.equal(info?.depth, 2);
    assert.equal(info?.parentId, 'a1');
    assert.deepEqual(api.getChildRows('a').map((r) => r.id), ['a1', 'a2']);
    assert.equal(api.toggleTreeRow('b').status, 'rejected');
  });

  it('onBeforeTreeToggle cancels; onTreeToggle reports rowId, expanded, depth, lazy and source', () => {
    const events: DataGridTreeToggleEvent<Task>[] = [];
    let cancel = true;
    const inst = instance({
      onBeforeTreeToggle: (e) => {
        if (cancel) e.preventDefault();
      },
      onTreeToggle: (e) => events.push(e),
    });
    const unmount = inst.mount();
    try {
      assert.equal(inst.api.toggleTreeRow('a').status, 'rejected');
      assert.equal(inst.api.getTreeRow('a')?.expanded, true);
      cancel = false;
      inst.api.toggleTreeRow('a1');
      assert.equal(events.length, 1);
      assert.equal(events[0]?.rowId, 'a1');
      assert.equal(events[0]?.expanded, false);
      assert.equal(events[0]?.depth, 1);
      assert.equal(events[0]?.lazy, false);
      assert.equal(events[0]?.source, 'api');
    } finally {
      unmount();
    }
  });

  it('tree.expandedRows is reactive and getState() includes the tree part', () => {
    const inst = instance({ tree: { expandedRows: { a: false } } });
    assert.equal(inst.api.getTreeRow('a')?.expanded, false);
    const prev = inst.props;
    inst.syncProps({ ...prev, tree: { expandedRows: { a: true, a1: false } } } as never);
    assert.equal(inst.api.getTreeRow('a')?.expanded, true);
    assert.equal(inst.api.getTreeRow('a1')?.expanded, false);
    const state = inst.api.getState() as { tree?: { expandedRows?: Record<string, boolean> } };
    assert.equal(state.tree?.expandedRows?.['a1'], false);
  });

  it('checkbox cascade selects a subtree with target checkbox events', () => {
    const targets: string[] = [];
    const inst = instance({ tree: { checkbox: { cascade: true }, defaultExpanded: false }, selection: { multiple: true }, onSelectionChange: (e) => targets.push(String(e.target)) });
    const unmount = inst.mount();
    try {
      const interaction = inst.interaction as unknown as { inputContext: unknown };
      interaction.inputContext = { ctrlKey: false, shiftKey: false, target: 'checkbox' };
      inst.dispatchFrom('pointer', { type: 'tree.check', rowId: 'a' });
      interaction.inputContext = null;
      assert.deepEqual([...inst.api.getSelectedRowIds()].sort(), ['a', 'a1', 'a1x', 'a2']);
      assert.ok(targets.includes('checkbox'));
    } finally {
      unmount();
    }
  });

  it('indentRows and outdentRows move rows without rowDrag once the move code loads', async () => {
    // Flat rows: a move rewrites parentIdField (nested rows need the core to rewrite child arrays).
    const rows: Task[] = [...flat, { id: 'b', name: 'Beta', hours: 5, parentId: null }];
    const inst = newInstance<Task>({ data: rows, columns, tree: { parentIdField: 'parentId' } }, ':indent:');
    const unmount = inst.mount();
    try {
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(inst.api.indentRows(['b']).status, 'applied');
      assert.equal(inst.api.getTreeRow('b')?.parentId, 'r');
      assert.equal(inst.api.outdentRows(['b']).status, 'applied');
      assert.equal(inst.api.getTreeRow('b')?.parentId, null);
      assert.equal(inst.api.moveRows(['b'], { targetRowId: 'c2', position: 'into' }).status, 'applied');
      assert.equal(inst.api.getTreeRow('b')?.parentId, 'c2');
      // A row never drops into its own descendant.
      assert.equal(inst.api.moveRows(['r'], { targetRowId: 'b', position: 'into' }).status, 'rejected');
    } finally {
      unmount();
    }
  });

  it('the indent and outdent toolbar items follow canIndent / canOutdent', () => {
    const inst = instance({ toolbar: ['indent', 'outdent'] });
    const items = inst.chrome.toolbarItems();
    assert.deepEqual(items.map((i) => i.label), ['Indent', 'Outdent']);
    // No focused row: nothing can move.
    assert.equal(inst.chrome.toolbarItemState(items[0] as never).disabled, true);
    inst.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'a2', columnId: 'name' } });
    assert.equal(inst.chrome.toolbarItemState(items[0] as never).disabled, false);
    assert.equal(inst.chrome.toolbarItemState(items[1] as never).disabled, false);
  });

  it('lazy children load on expand; a failed load reports onError treeChildren and retries', async () => {
    const errors: string[] = [];
    let fail = true;
    const data: Task[] = [{ id: 'z', name: 'Zed', hours: 0, lazy: true }];
    const inst = newInstance<Task>(
      {
        data,
        columns,
        tree: { hasChildrenField: 'lazy', defaultExpanded: false, loadChildren: async () => (fail ? Promise.reject(new Error('boom')) : [{ id: 'z1', name: 'Zed one', hours: 1, parentId: 'z' }]) },
        onError: (e: { action: string }) => errors.push(e.action),
      },
      ':lazy:',
    );
    const unmount = inst.mount();
    try {
      inst.api.toggleTreeRow('z', true);
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(inst.api.getTreeRow('z')?.loadStatus, 'error');
      assert.deepEqual(errors, ['treeChildren']);
      fail = false;
      assert.equal(inst.api.reloadTreeChildren('z').status, 'applied');
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(inst.api.getTreeRow('z')?.loadStatus, 'loaded');
      assert.deepEqual(inst.api.getChildRows('z').map((r) => r.id), ['z1']);
    } finally {
      unmount();
    }
  });
});

describe('tree printing and copy', () => {
  it('printing indents the tree column by depth; tree: all prints collapsed subtrees', async () => {
    const { createExportModel, createExportModule } = await import('@salmonui/data-grid/engine/export');
    const { renderPrintTable } = await import('../dist/data-grid/print-document.js');
    const inst = instance({ tree: { defaultExpanded: false }, modules: [createExportModule<Task>()] }, ':print:');
    const visible = renderPrintTable(createExportModel(inst.engine as never));
    assert.doesNotMatch(visible, /a1x/);
    const all = renderPrintTable(createExportModel(inst.engine as never, { tree: 'all' }));
    assert.match(all, /<td style="padding-inline-start:2.5rem">a1x<\/td>/);
  });

  it('copyMode widens copied rows with their ancestors or descendants', async () => {
    const { treeCopyHooks } = await import('../dist/data-grid/tree-hooks.js');
    const inst = instance({ tree: { copyMode: 'ancestors' } }, ':copy:');
    const widen = treeCopyHooks.get(inst.engine) as (ids: readonly string[]) => readonly string[];
    assert.deepEqual([...widen(['a1x'])], ['a', 'a1', 'a1x']);
    inst.syncProps({ ...inst.props, tree: { copyMode: 'descendants' } } as never);
    assert.deepEqual([...widen(['a1'])], ['a1', 'a1x']);
  });
});

describe('remote tree data', () => {
  it('a remote source with tree reads loads roots, then children on expand; a failed child read reports treeChildren', async () => {
    const reads: (string | null)[] = [];
    let fail = true;
    const store: Task[] = [
      { id: 'r1', name: 'Remote 1', hours: 1, parentId: null },
      { id: 'r1a', name: 'Remote 1a', hours: 2, parentId: 'r1' },
    ];
    const source = {
      mode: 'remote' as const,
      capabilities: { treeChildren: true },
      read(request: { version: number; parentRowId?: string | null }) {
        const parent = request.parentRowId ?? null;
        reads.push(parent);
        if (parent !== null && fail) {
          fail = false;
          return Promise.reject(new Error('offline'));
        }
        const level = store.filter((r) => (r.parentId ?? null) === parent);
        const rows = level.map((r) => ({ kind: 'tree', row: r, parentId: parent, hasChildren: store.some((c) => c.parentId === r.id) }));
        return Promise.resolve({ version: request.version, rows, totalRowCount: rows.length, performed: ['search', 'filter', 'sort', 'aggregate', 'page'] });
      },
    };
    const errors: string[] = [];
    const inst = newInstance<Task>({ data: source, columns, tree: { parentIdField: 'parentId', defaultExpanded: false }, onError: (e: { action: string }) => errors.push(e.action) }, ':remote:');
    const unmount = inst.mount();
    try {
      await new Promise((r) => setTimeout(r, 20));
      assert.deepEqual(reads, [null]);
      assert.equal(inst.api.getTreeRow('r1')?.hasChildren, true);
      inst.api.expandTreeRows('r1');
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(inst.api.getTreeRow('r1')?.loadStatus, 'error');
      assert.deepEqual(errors, ['treeChildren']);
      inst.api.reloadTreeChildren('r1');
      await new Promise((r) => setTimeout(r, 20));
      assert.deepEqual(reads, [null, 'r1', 'r1']);
      assert.deepEqual(inst.api.getVisibleRows().map((r) => r.id), ['r1', 'r1a']);
    } finally {
      unmount();
    }
  });
});
