// Tree mode selection cascade, editing, row moves (drag, indent and
// outdent) and lazy remote children in the core.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDataGridEngine,
  createFilterModule,
  createFocusModule,
  createLocalDataSource,
  createSelectionApi,
  createSelectionModule,
  createSortModule,
  type ColumnDef,
  type DataSource,
  type DataGridModule,
  type EditState,
  type WriteRequest,
} from '@salmonui/data-grid/engine';
import { createEditModule } from '@salmonui/data-grid/engine/edit';
import { computeDropPoint, createRowDragDropModule } from '@salmonui/data-grid/engine/row-drag-drop';
import { createTreeModule, flattenTree, type TreeMethods, type TreeOptions } from '@salmonui/data-grid/engine/tree';

interface Node {
  readonly id: string;
  readonly name: string;
  readonly n: number;
  readonly parentId?: string | null;
  readonly lazy?: boolean;
}

const columns: ColumnDef<Node>[] = [{ field: 'id', primaryKey: true }, { field: 'name' }, { field: 'n', type: 'number' }];

/** a [a1, a2 [a21]], b [b1], c */
function rows(): Node[] {
  return [
    { id: 'a', name: 'Alpha', n: 3, parentId: null },
    { id: 'a1', name: 'Apple', n: 2, parentId: 'a' },
    { id: 'a2', name: 'Avocado', n: 1, parentId: 'a' },
    { id: 'a21', name: 'Acorn', n: 5, parentId: 'a2' },
    { id: 'b', name: 'Beta', n: 1, parentId: null },
    { id: 'b1', name: 'Banana', n: 9, parentId: 'b' },
    { id: 'c', name: 'Gamma', n: 4, parentId: null },
  ];
}

type Modules = readonly DataGridModule<Node, any, any, string>[];

function recording(data: readonly Node[]) {
  const local = createLocalDataSource<Node>(data, { getRowId: (r) => r.id });
  const writes: WriteRequest<Node>[] = [];
  const source: DataSource<Node> = {
    ...local,
    write(request) {
      writes.push(request);
      return local.write(request);
    },
  };
  return { source, writes, local };
}

function make(tree: TreeOptions<Node> = {}, extra: Record<string, unknown> = {}, data: readonly Node[] = rows()) {
  const { source, writes } = recording(data);
  const engine = createDataGridEngine<Node, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: source,
    modules: [
      createFilterModule<Node>(),
      createSortModule<Node>(),
      createSelectionModule<Node>(),
      createFocusModule<Node>(),
      createTreeModule<Node>(),
      createEditModule<Node>(),
      createRowDragDropModule<Node>(),
    ],
    selection: { type: 'multiple' },
    tree: { parentIdField: 'parentId', ...tree },
    ...extra,
  });
  const api = (engine as unknown as { tree: { [K in keyof TreeMethods<Node>]: TreeMethods<Node>[K] extends (ctx: never, ...args: infer A) => infer R ? (...args: A) => R : never } }).tree;
  return { engine, tree: api, writes, selection: createSelectionApi(engine) };
}

type Engine = ReturnType<typeof make>['engine'];

function visibleIds(engine: Engine): string[] {
  const out: string[] = [];
  for (let i = 0; i < engine.getSnapshot().rows.count; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('tree checkbox cascade', () => {
  it('checking a parent selects its subtree; parent state derives from descendants', () => {
    const { engine, tree, selection } = make({ checkbox: { cascade: true } });
    assert.equal(engine.dispatch({ type: 'tree.check', rowId: 'a' }).status, 'applied');
    assert.deepEqual([...selection.getSelectedRowIds()].sort(), ['a', 'a1', 'a2', 'a21']);
    assert.equal(tree.checkState('a'), 'checked');
    engine.dispatch({ type: 'tree.check', rowId: 'a21' });
    assert.deepEqual([...selection.getSelectedRowIds()].sort(), ['a1']);
    assert.equal(tree.checkState('a'), 'mixed');
    assert.equal(tree.checkState('a2'), 'unchecked');
    assert.equal(tree.checkState('a1'), 'checked');
    // Checking the last child completes its ancestors.
    engine.dispatch({ type: 'tree.check', rowId: 'a21' });
    assert.deepEqual([...selection.getSelectedRowIds()].sort(), ['a', 'a1', 'a2', 'a21']);
    assert.equal(tree.checkState('a'), 'checked');
    // A mixed parent checks its whole subtree.
    engine.dispatch({ type: 'tree.check', rowId: 'a1', checked: false });
    assert.equal(tree.checkState('a'), 'mixed');
    engine.dispatch({ type: 'tree.check', rowId: 'a' });
    assert.equal(tree.checkState('a'), 'checked');
    engine.dispatch({ type: 'tree.check', rowId: 'a' });
    assert.deepEqual(selection.getSelectedRowIds(), []);
  });

  it('plain selection commands keep the derived state in sync; collapse never deselects; hidden descendants cascade', () => {
    const { engine, tree, selection } = make({ checkbox: { cascade: true } });
    engine.dispatch({ type: 'tree.collapse', rowId: 'a' });
    engine.dispatch({ type: 'tree.check', rowId: 'a' });
    assert.ok(selection.getSelectedRowIds().includes('a21'), 'hidden descendant selected');
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    engine.dispatch({ type: 'tree.collapse', rowId: 'a' });
    assert.equal(selection.getSelectedRowIds().length, 4, 'collapse keeps the selection');
    selection.selectRows(['a1'], { mode: 'remove' });
    assert.equal(tree.checkState('a'), 'mixed');
    selection.selectRows(['b1'], { mode: 'add' });
    assert.equal(tree.checkState('b'), 'mixed');
    selection.selectRows(['b'], { mode: 'add' });
    assert.equal(tree.checkState('b'), 'checked');
  });

  it("'filtered' cascades over kept rows only", () => {
    const { engine, selection, tree } = make({ checkbox: { cascade: 'filtered' } });
    engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'n', operator: 'greaterThan', value: 1 }] });
    // Kept: a (3) [a1 (2), a2 (context) [a21 (5)]], b (context) [b1 (9)], c.
    engine.dispatch({ type: 'tree.check', rowId: 'a' });
    assert.deepEqual([...selection.getSelectedRowIds()].sort(), ['a', 'a1', 'a2', 'a21']);
    engine.dispatch({ type: 'tree.check', rowId: 'a', checked: false });
    engine.dispatch({ type: 'tree.setOptions', filterMode: 'none' });
    // Kept: a [a1, a21], b1, c — a2 is filtered out and not cascaded.
    engine.dispatch({ type: 'tree.check', rowId: 'a' });
    assert.deepEqual([...selection.getSelectedRowIds()].sort(), ['a', 'a1', 'a21']);
    assert.equal(tree.checkState('a'), 'checked');
  });

  it('without a cascade the checkbox selects the row only', () => {
    const { engine, selection, tree } = make({ checkbox: true });
    engine.dispatch({ type: 'tree.check', rowId: 'a' });
    assert.deepEqual(selection.getSelectedRowIds(), ['a']);
    assert.equal(tree.checkState('a'), 'checked');
    assert.equal(tree.checkState('a1'), 'unchecked');
  });
});

describe('tree editing', () => {
  it('deleting a parent deletes its subtree, filtered rows included', () => {
    const { engine, writes } = make();
    engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'name', operator: 'equal', value: 'Alpha' }] });
    engine.dispatch({ type: 'edit.deleteRecords', rowIds: ['a'] });
    assert.deepEqual(writes.at(-1)?.deleted.map((d) => d.rowId).sort(), ['a', 'a1', 'a2', 'a21']);
    engine.dispatch({ type: 'filter.clear' });
    assert.deepEqual(visibleIds(engine), ['b', 'b1', 'c']);
  });

  it("newRowPosition 'child', 'above' and 'below' place the added row next to the focused row", () => {
    const { engine, writes } = make({}, { edit: { newRowPosition: 'child' } });
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'a2', columnId: 'name' } });
    engine.dispatch({ type: 'edit.addRecord', values: { id: 'x', name: 'X', n: 0 } });
    const placements = (engine.getModuleState<EditState>('edit') as EditState).addedTreePlacements;
    assert.ok(placements);
    assert.deepEqual(Object.values(placements), [{ position: 'child', anchorId: 'a2', parentId: 'a2' }]);
    engine.dispatch({ type: 'edit.commit' });
    const write = writes.at(-1) as WriteRequest<Node>;
    assert.equal(write.added[0]?.parentId, 'a2');
    assert.equal(write.added[0]?.row.parentId, 'a2');
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'x', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'edit.addRecord', values: { id: 'y', name: 'Y', n: 0 }, position: 'above', relativeTo: 'a1' });
    engine.dispatch({ type: 'edit.commit' });
    assert.equal(writes.at(-1)?.added[0]?.parentId, 'a');
    assert.deepEqual(writes.at(-1)?.moved, { rowIds: ['y'], targetRowId: 'a1', position: 'before', parentId: 'a' });
    engine.dispatch({ type: 'edit.addRecord', values: { id: 'z', name: 'Z', n: 0 }, position: 'below', relativeTo: 'b' });
    engine.dispatch({ type: 'edit.commit' });
    assert.equal(writes.at(-1)?.added[0]?.parentId, null);
    assert.deepEqual(visibleIds(engine), ['a', 'y', 'a1', 'a2', 'a21', 'x', 'b', 'b1', 'z', 'c']);
  });
});

describe('tree row moves', () => {
  it('drop zones: top quarter before, middle half into, bottom quarter after', () => {
    const { engine } = make();
    const model = engine.getSnapshot().rows;
    assert.deepEqual({ ...computeDropPoint(model, 2, 0.1) }, { index: 2, rowId: 'a2', kind: 'data', position: 'before', groupId: null, parentId: 'a' });
    assert.equal(computeDropPoint(model, 2, 0.5).position, 'into');
    assert.equal(computeDropPoint(model, 2, 0.5).parentId, 'a2');
    assert.equal(computeDropPoint(model, 2, 0.9).position, 'after');
  });

  it('drag a parent into another row: the subtree travels, the write carries moved and the changed parent id', () => {
    const { engine, writes } = make();
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 'a2' });
    engine.dispatch({ type: 'rowDragDrop.over', index: engine.getRowIndex('c'), fraction: 0.5 });
    const over = (engine.getModuleState<{ drag: { over: { position: string; valid: boolean; parentId?: string } } }>('rowDragDrop')?.drag.over);
    assert.equal(over?.position, 'into');
    assert.equal(over?.valid, true);
    engine.dispatch({ type: 'rowDragDrop.drop' });
    const write = writes.at(-1) as WriteRequest<Node>;
    assert.deepEqual(write.moved, { rowIds: ['a2'], targetRowId: 'c', position: 'after', parentId: 'c' });
    assert.deepEqual(write.changed.map((c) => [c.rowId, c.row.parentId, c.changedColumnIds]), [['a2', 'c', ['parentId']]]);
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'b', 'b1', 'c', 'a2', 'a21']);
    assert.equal(engine.getRowSnapshot('a21')?.depth, 2);
  });

  it('a row cannot drop into or next to its own descendant', () => {
    const { engine } = make();
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 'a' });
    engine.dispatch({ type: 'rowDragDrop.over', index: engine.getRowIndex('a21'), fraction: 0.5 });
    const state = () => engine.getModuleState<{ drag: { over: { valid: boolean; reason: string | null } } | null; lastDrop: { status: string; reason: string | null } | null }>('rowDragDrop');
    assert.deepEqual([state()?.drag?.over.valid, state()?.drag?.over.reason], [false, 'descendant']);
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.deepEqual([state()?.lastDrop?.status, state()?.lastDrop?.reason], ['invalid', 'descendant']);
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.move', rowIds: ['a'], targetRowId: 'a2', position: 'into' }), { status: 'rejected', reason: 'descendant' });
  });

  it('moveRows with into and before; nested selections move once', () => {
    const { engine, writes } = make();
    assert.equal(engine.dispatch({ type: 'rowDragDrop.move', rowIds: ['a2', 'a21'], targetRowId: 'b', position: 'into' }).status, 'applied');
    assert.deepEqual(writes.at(-1)?.moved, { rowIds: ['a2'], targetRowId: 'b1', position: 'after', parentId: 'b' });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'b', 'b1', 'a2', 'a21', 'c']);
    engine.dispatch({ type: 'rowDragDrop.move', rowIds: ['c'], targetRowId: 'a1', position: 'before' });
    assert.deepEqual(visibleIds(engine), ['a', 'c', 'a1', 'b', 'b1', 'a2', 'a21']);
    assert.equal(engine.getRowSnapshot('c')?.parentId, 'a');
  });

  it('indent makes rows children of their previous sibling; outdent makes them siblings of their parent', () => {
    const { engine, writes, tree } = make();
    assert.equal(tree.canIndent(['a2']), true);
    assert.equal(tree.canIndent(['a1']), false);
    assert.equal(tree.canOutdent(['a']), false);
    assert.equal(engine.dispatch({ type: 'tree.indent', rowIds: ['a2'] }).status, 'applied');
    assert.deepEqual(writes.at(-1)?.moved, { rowIds: ['a2'], targetRowId: 'a1', position: 'after', parentId: 'a1' });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    assert.equal(engine.getRowSnapshot('a2')?.depth, 2);
    assert.deepEqual(engine.dispatch({ type: 'tree.indent', rowIds: ['a'] }), { status: 'rejected', reason: 'noPreviousSibling' });
    assert.equal(engine.dispatch({ type: 'tree.outdent', rowIds: ['a2'] }).status, 'applied');
    assert.equal(engine.getRowSnapshot('a2')?.parentId, 'a');
    assert.equal(engine.dispatch({ type: 'tree.outdent', rowIds: ['a2'] }).status, 'applied');
    assert.equal(engine.getRowSnapshot('a2')?.parentId, null);
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    assert.deepEqual(engine.dispatch({ type: 'tree.outdent', rowIds: ['a2'] }), { status: 'rejected', reason: 'root' });
    assert.deepEqual(engine.dispatch({ type: 'tree.indent', rowIds: ['a1', 'b1'] }), { status: 'rejected', reason: 'mixedParents' });
  });

  it('moves are refused while sorted (row order would not show)', () => {
    const { engine } = make();
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n', direction: 'asc' }] });
    assert.deepEqual(engine.dispatch({ type: 'tree.indent', rowIds: ['a1'] }), { status: 'rejected', reason: 'sorted' });
  });
});

describe('tree lazy children ( core core)', () => {
  it('expanding a lazy row loads its children once; errors retry', async () => {
    let fail = true;
    const calls: string[] = [];
    const data: Node[] = [
      { id: 'p', name: 'P', n: 1, parentId: null, lazy: true },
      { id: 'q', name: 'Q', n: 1, parentId: null, lazy: true },
    ];
    const { engine, tree } = make(
      {
        hasChildrenField: 'lazy',
        loadChildren: async ({ rowId }) => {
          calls.push(rowId);
          if (rowId === 'q' && fail) throw new Error('boom');
          return [{ id: `${rowId}1`, name: 'child', n: 1, parentId: rowId }];
        },
      },
      {},
      data,
    );
    assert.equal(tree.getTreeRow('p')?.hasChildren, true);
    assert.equal(tree.getTreeRow('p')?.loadStatus, 'idle');
    engine.dispatch({ type: 'tree.collapseAll' });
    engine.dispatch({ type: 'tree.expand', rowId: 'p' });
    await Promise.resolve();
    assert.equal(tree.getTreeRow('p')?.loadStatus, 'loading');
    await settle();
    assert.equal(tree.getTreeRow('p')?.loadStatus, 'loaded');
    assert.deepEqual(visibleIds(engine), ['p', 'p1', 'q']);
    engine.dispatch({ type: 'tree.collapse', rowId: 'p' });
    engine.dispatch({ type: 'tree.expand', rowId: 'p' });
    await settle();
    assert.deepEqual(calls, ['p'], 'loaded children are cached');
    engine.dispatch({ type: 'tree.expand', rowId: 'q' });
    await settle();
    assert.equal(tree.getTreeRow('q')?.loadStatus, 'error');
    assert.deepEqual(engine.dispatch({ type: 'tree.retry', rowId: 'p' }), { status: 'rejected', reason: 'notFailed' });
    fail = false;
    assert.equal(engine.dispatch({ type: 'tree.retry', rowId: 'q' }).status, 'applied');
    await settle();
    assert.equal(tree.getTreeRow('q')?.loadStatus, 'loaded');
    assert.deepEqual(visibleIds(engine), ['p', 'p1', 'q', 'q1']);
  });

  it('a data layer reports children it loaded itself through tree.loaded', () => {
    const data: Node[] = [{ id: 'p', name: 'P', n: 1, lazy: true }, { id: 'k', name: 'K', n: 1 }];
    const { engine, tree } = make({ hasChildrenField: 'lazy' }, {}, data);
    engine.dispatch({ type: 'tree.loaded', rowId: 'p', status: 'loaded', childIds: ['k'] });
    assert.equal(tree.getTreeRow('k')?.parentId, 'p');
    assert.deepEqual(visibleIds(engine), ['p', 'k']);
  });

  it('getTreeRow().expanded is false for a never-loaded lazy parent; a toggle expands and loads it (SSR aria-expanded)', async () => {
    const data: Node[] = [{ id: 'p', name: 'P', n: 1, parentId: null, lazy: true }];
    const { engine, tree } = make({ hasChildrenField: 'lazy', loadChildren: async ({ rowId }) => [{ id: `${rowId}1`, name: 'child', n: 1, parentId: rowId }] }, {}, data);
    assert.equal(tree.isExpanded('p'), true, 'the default still expands it');
    assert.equal(tree.getTreeRow('p')?.expanded, false);
    assert.equal(engine.dispatch({ type: 'tree.toggle', rowId: 'p' }).status, 'applied');
    await Promise.resolve();
    assert.equal(tree.getTreeRow('p')?.loadStatus, 'loading');
    await settle();
    assert.equal(tree.getTreeRow('p')?.expanded, true);
    assert.deepEqual(visibleIds(engine), ['p', 'p1']);
  });
});

interface NestedNode {
  readonly id: string;
  readonly name: string;
  readonly n: number;
  readonly children?: readonly NestedNode[];
}

/** The same shape as `rows()`, nested under `children`. */
function makeNested(wrap: (local: DataSource<NestedNode>) => DataSource<NestedNode> = (s) => s) {
  const data: NestedNode[] = [
    { id: 'a', name: 'Alpha', n: 3, children: [{ id: 'a1', name: 'Apple', n: 2 }, { id: 'a2', name: 'Avocado', n: 1, children: [{ id: 'a21', name: 'Acorn', n: 5 }] }] },
    { id: 'b', name: 'Beta', n: 1, children: [{ id: 'b1', name: 'Banana', n: 9 }] },
    { id: 'c', name: 'Gamma', n: 4 },
  ];
  const inner = wrap(createLocalDataSource<NestedNode>(flattenTree(data, 'children'), { getRowId: (r) => r.id }));
  const writes: WriteRequest<NestedNode>[] = [];
  const source: DataSource<NestedNode> = {
    ...inner,
    write(request) {
      writes.push(request);
      return (inner.write as NonNullable<DataSource<NestedNode>['write']>)(request);
    },
  };
  const engine = createDataGridEngine<NestedNode, readonly DataGridModule<NestedNode, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns: [{ field: 'id', primaryKey: true }, { field: 'name' }, { field: 'n', type: 'number' }],
    dataSource: source,
    modules: [createSortModule<NestedNode>(), createFocusModule<NestedNode>(), createTreeModule<NestedNode>(), createRowDragDropModule<NestedNode>()],
    tree: { childrenField: 'children' },
  });
  const tree = (engine as unknown as { tree: { getTreeRow(id: string): { parentId: string | null; depth: number } | null } }).tree;
  const ids = (): string[] => Array.from({ length: engine.getSnapshot().rows.count }, (_, i) => engine.getRowIdAt(i) as string);
  return { engine, tree, writes, ids };
}

describe('tree row moves of nested (childrenField) data', () => {
  it('indent and outdent change the parent of nested rows; the write carries moved.parentId and no changed rows', () => {
    const { engine, tree, writes, ids } = makeNested();
    assert.equal(engine.dispatch({ type: 'tree.indent', rowIds: ['a2'] }).status, 'applied');
    assert.deepEqual(writes.at(-1)?.moved, { rowIds: ['a2'], targetRowId: 'a1', position: 'after', parentId: 'a1' });
    assert.deepEqual(writes.at(-1)?.changed, []);
    assert.equal(tree.getTreeRow('a2')?.parentId, 'a1');
    assert.equal(engine.getRowSnapshot('a2')?.depth, 2);
    assert.equal(engine.getRowSnapshot('a21')?.depth, 3, 'the subtree travels');
    assert.deepEqual(ids(), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    assert.equal(engine.dispatch({ type: 'tree.outdent', rowIds: ['a2'] }).status, 'applied');
    assert.equal(tree.getTreeRow('a2')?.parentId, 'a');
    assert.equal(engine.dispatch({ type: 'tree.outdent', rowIds: ['a2'] }).status, 'applied');
    assert.equal(tree.getTreeRow('a2')?.parentId, null);
    assert.equal(engine.getRowSnapshot('a21')?.depth, 1);
    assert.deepEqual(engine.dispatch({ type: 'tree.outdent', rowIds: ['a2'] }), { status: 'rejected', reason: 'root' });
  });

  it('a drop into another nested row moves the row with its subtree', () => {
    const { engine, tree, ids } = makeNested();
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 'a2' });
    engine.dispatch({ type: 'rowDragDrop.over', index: engine.getRowIndex('c'), fraction: 0.5 });
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.equal(tree.getTreeRow('a2')?.parentId, 'c');
    assert.deepEqual(ids(), ['a', 'a1', 'b', 'b1', 'c', 'a2', 'a21']);
    assert.equal(engine.dispatch({ type: 'rowDragDrop.move', rowIds: ['b1'], targetRowId: 'a', position: 'into' }).status, 'applied');
    assert.equal(tree.getTreeRow('b1')?.parentId, 'a');
    assert.deepEqual(ids(), ['a', 'a1', 'b1', 'b', 'c', 'a2', 'a21']);
  });

  it('a write that fails synchronously leaves the parent unchanged', () => {
    const { engine, tree } = makeNested((local) => ({
      ...local,
      write: () => {
        throw new Error('offline');
      },
    }));
    engine.dispatch({ type: 'tree.indent', rowIds: ['a2'] });
    assert.equal(tree.getTreeRow('a2')?.parentId, 'a');
  });
});

describe('carried tree index (moves splice the pre-order instead of rebuilding it)', () => {
  function seeded(seed: number): (k: number) => number {
    let state = seed >>> 0;
    return (k) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return (state >>> 8) % k;
    };
  }

  /** Flat rows, parents drawn among the earlier rows (some roots). */
  function forest(count: number, rand: (k: number) => number): Node[] {
    const out: Node[] = [];
    for (let i = 0; i < count; i++) out.push({ id: `r${i}`, name: `n${i}`, n: i, parentId: i === 0 || rand(5) === 0 ? null : `r${rand(i)}` });
    return out;
  }

  const build = (local: DataSource<Node>) =>
    createDataGridEngine<Node, Modules>({
      getRowId: (r) => r.id,
      columns,
      dataSource: local,
      modules: [createSelectionModule<Node>(), createFocusModule<Node>(), createTreeModule<Node>(), createEditModule<Node>(), createRowDragDropModule<Node>()],
      tree: { parentIdField: 'parentId' },
      rowDrag: true,
      dev: false,
    });
  type Tree = { getTreeRow(id: string): { depth: number; parentId: string | null; posinset: number; setsize: number; childCount: number } | null; getChildRowIds(id: string | null): readonly string[] };
  const treeOfEngine = (engine: ReturnType<typeof build>) => (engine as unknown as { tree: Tree }).tree;
  const shape = (engine: ReturnType<typeof build>, rowIds: readonly string[]) => {
    const tree = treeOfEngine(engine);
    return rowIds.map((id) => {
      const info = tree.getTreeRow(id);
      return info && [id, info.depth, info.parentId, info.posinset, info.setsize, info.childCount];
    });
  };

  for (const seed of [7, 11, 23]) {
    it(`matches a rebuilt index after random moves, indents, outdents and parent edits, collapsed rows too (seed ${seed})`, () => {
      const rand = seeded(seed);
      const local = createLocalDataSource<Node>(forest(160, rand), { getRowId: (r) => r.id });
      const engine = build(local);
      const allIds = local.getRows().map((r) => r.id);
      const patchParent = (id: string, parentId: string | null): void => {
        const row = local.getRows().find((r) => r.id === id) as Node;
        local.patch({ upsert: [{ ...row, parentId }] });
      };
      let applied = 0;
      let repair: string | null = null;
      for (let step = 0; step < 250; step++) {
        const id = allIds[rand(allIds.length)] as string;
        const other = allIds[rand(allIds.length)] as string;
        const third = allIds[rand(allIds.length)] as string;
        const op = repair !== null ? -1 : rand(5);
        let status = 'applied';
        if (op === -1) {
          // Undo the cycle of the step before (a broken cycle is never carried, so the rest of the run would rebuild).
          patchParent(repair as string, null);
          repair = null;
        } else if (op === 0) status = engine.dispatch({ type: 'tree.indent', rowIds: [id] }).status;
        else if (op === 1) status = engine.dispatch({ type: 'tree.outdent', rowIds: [id] }).status;
        else if (op === 2) status = engine.dispatch({ type: 'rowDragDrop.move', rowIds: rand(3) ? [id] : [id, third], targetRowId: other, position: (['into', 'before', 'after'] as const)[rand(3)] }).status;
        else if (op === 3) {
          // A parent id edit in place (plain delta): a new parent, a root, or now and then a cycle (the rebuild breaks it).
          const child = treeOfEngine(engine).getChildRowIds(id)[0];
          const cycle = child !== undefined && rand(8) === 0;
          patchParent(id, cycle ? (child as string) : rand(6) === 0 ? null : other);
          if (cycle) repair = id;
        } else {
          // A source reorder (before / after a row of any parent).
          status = engine.dispatch({ type: 'rowDragDrop.move', rowIds: [id], targetRowId: other, position: rand(2) ? 'before' : 'after' }).status;
        }
        if (status === 'applied') applied++;
        const fresh = build(createLocalDataSource<Node>(local.getRows(), { getRowId: (r) => r.id }));
        assert.deepEqual(visibleIds(engine as unknown as Engine), visibleIds(fresh as unknown as Engine), `step ${step}: visible order`);
        assert.deepEqual(shape(engine, allIds), shape(fresh, allIds), `step ${step}: tree rows`);
        // Collapsing a row hides exactly its subtree (the `next` ends).
        const c = allIds[rand(allIds.length)] as string;
        for (const e of [engine, fresh]) e.dispatch({ type: 'tree.collapse', rowId: c });
        assert.deepEqual(visibleIds(engine as unknown as Engine), visibleIds(fresh as unknown as Engine), `step ${step}: collapsed ${c}`);
        for (const e of [engine, fresh]) e.dispatch({ type: 'tree.expand', rowId: c });
        fresh.dispose();
      }
      assert.ok(applied > 125, `applied ${applied} of 250`);
    });
  }
});
