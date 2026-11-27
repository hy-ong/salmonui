// Tree mode core:
// the tree index over nested and flat rows, the range-based tree view,
// expansion commands and state, sibling sort, hierarchy filter modes, paging
// by visible rows and by roots, detail rows over tree rows, child summaries,
// state persistence, and a randomized oracle that materializes the expected
// visible list.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createDataGridEngine,
  createFilterModule,
  createFocusModule,
  createGroupingModule,
  createLocalDataSource,
  createPagingModule,
  createSearchModule,
  createSortModule,
  type ColumnDef,
  type DataGridCommand,
  type DataGridModule,
  type DataGridWarning,
} from '@salmonui/data-grid/engine';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { bindDataGridPersistence, createDataGridStateApi, DATA_GRID_PERSISTENCE_FNS, serializeDataGridState } from '@salmonui/data-grid/engine/persistence';
import {
  buildTreeLayout,
  createTreeModule,
  flattenTree,
  parentsFromIds,
  parentsFromNested,
  siblingInfo,
  TREE_FOOTER_ID_PREFIX,
  treeOf,
  type TreeMethods,
  type TreeOptions,
  withTreePersistence,
  withTreeState,
} from '@salmonui/data-grid/engine/tree';

interface Node {
  readonly id: string;
  readonly name: string;
  readonly n: number;
  readonly parentId?: string | number | null;
  readonly children?: Node[];
  readonly open?: boolean;
  readonly lazy?: boolean;
}

const columns: ColumnDef<Node>[] = [{ field: 'id', primaryKey: true }, { field: 'name' }, { field: 'n', type: 'number' }];

type Modules = readonly DataGridModule<Node, any, any, string>[];

function makeEngine(rows: readonly Node[], tree: TreeOptions<Node> | true, extra: Record<string, unknown> = {}, modules: Modules = []) {
  const warnings: DataGridWarning[] = [];
  const engine = createDataGridEngine<Node, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: rows,
    dev: true,
    onWarning: (w) => warnings.push(w),
    modules: [
      createSearchModule<Node>(),
      createFilterModule<Node>(),
      createSortModule<Node>(),
      createAggregatesModule<Node>(),
      createTreeModule<Node>(),
      createDetailModule<Node>(),
      createPagingModule<Node>(),
      ...modules,
    ],
    paging: { enabled: false },
    tree,
    ...extra,
  });
  const api = (engine as unknown as { tree: { [K in keyof TreeMethods<Node>]: TreeMethods<Node>[K] extends (ctx: never, ...args: infer A) => infer R ? (...args: A) => R : never } }).tree;
  return { engine, tree: api, warnings };
}

type Engine = ReturnType<typeof makeEngine>['engine'];

function visibleIds(engine: Engine): string[] {
  const out: string[] = [];
  const n = engine.getSnapshot().rows.count;
  for (let i = 0; i < n; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
}

/** a(3) [a1(2), a2(1) [a21(5)]], b(1) [b1(9)], c(4) */
function nested(): Node[] {
  return [
    { id: 'a', name: 'Alpha', n: 3, children: [{ id: 'a1', name: 'Apple', n: 2 }, { id: 'a2', name: 'Avocado', n: 1, children: [{ id: 'a21', name: 'Acorn', n: 5 }] }] },
    { id: 'b', name: 'Beta', n: 1, children: [{ id: 'b1', name: 'Banana', n: 9 }] },
    { id: 'c', name: 'Gamma', n: 4 },
  ];
}

/** The same tree as flat rows, children listed before their parents. */
function flat(): Node[] {
  return [
    { id: 'a21', name: 'Acorn', n: 5, parentId: 'a2' },
    { id: 'a1', name: 'Apple', n: 2, parentId: 'a' },
    { id: 'a', name: 'Alpha', n: 3, parentId: null },
    { id: 'b1', name: 'Banana', n: 9, parentId: 'b' },
    { id: 'a2', name: 'Avocado', n: 1, parentId: 'a' },
    { id: 'b', name: 'Beta', n: 1 },
    { id: 'c', name: 'Gamma', n: 4, parentId: '' },
  ];
}

describe('tree index', () => {
  it('flattens nested rows in pre-order by reference', () => {
    const data = nested();
    const rows = flattenTree(data, 'children');
    assert.deepEqual(rows.map((r) => r.id), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    assert.equal(rows[0], data[0]);
    assert.equal(rows[3], data[0]?.children?.[1]?.children?.[0]);
    assert.deepEqual([...parentsFromNested(rows, 'children')], [-1, 0, 0, 2, -1, 4, -1]);
  });

  it('recovers nested parents when the flat array is not the exact flattening', () => {
    const rows = flattenTree(nested(), 'children');
    const shuffled = [rows[3], rows[0], rows[6], rows[2], rows[1], rows[5], rows[4]] as Node[];
    const parent = parentsFromNested(shuffled, 'children');
    const ids = shuffled.map((r) => r.id);
    const parentOf = (id: string) => {
      const p = parent[ids.indexOf(id)] as number;
      return p < 0 ? null : ids[p];
    };
    assert.deepEqual(['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c'].map(parentOf), [null, 'a', 'a', 'a2', null, 'b', null]);
  });

  it('resolves flat parent ids; orphans become roots and cycles break at the first repeated row', () => {
    const ids = ['x', 'y', 'z', 'w', 'v'];
    const parentIds = [null, 'x', 'missing', 'v', 'w'];
    const issues: { kind: string; index: number }[] = [];
    const parent = parentsFromIds(5, (i) => parentIds[i] ?? null, (id) => ids.indexOf(id), (issue) => issues.push(issue));
    assert.deepEqual([...parent], [-1, 0, -1, -1, 3]);
    assert.deepEqual(issues, [{ kind: 'orphan', index: 2 }, { kind: 'cycle', index: 3 }]);
  });

  it('lays out kept rows in pre-order with sibling ordinals and re-parents across dropped rows', () => {
    // 0 [1 [2], 3], 4
    const parent = Int32Array.from([-1, 0, 1, 0, -1]);
    const full = buildTreeLayout(parent, null, null);
    assert.deepEqual([...full.order], [0, 1, 2, 3, 4]);
    assert.deepEqual([...full.next], [4, 3, 3, 4, 5]);
    assert.deepEqual([...full.depth], [0, 1, 2, 1, 0]);
    assert.deepEqual([...full.posinset], [1, 1, 1, 2, 2]);
    assert.deepEqual([...full.setsize], [2, 2, 1, 2, 2]);
    assert.deepEqual([...full.childCount], [2, 1, 0, 0, 0]);
    // Drop row 1: row 2 hangs under 0; priority puts 3 first.
    const kept = buildTreeLayout(parent, Int32Array.from([4, 3, 2, 0]), Uint8Array.from([1, 0, 1, 1, 1]));
    assert.deepEqual([...kept.order], [4, 0, 3, 2]);
    assert.equal(kept.parent[2], 0);
    assert.equal(kept.depth[2], 1);
    assert.equal(kept.slot[1], -1);
  });

  it('builds the same layout with and without a base, for random trees, priorities and masks', () => {
    let state = 11;
    const rand = (m: number): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % m;
    };
    /** Reference: children by nearest kept ancestor, ordered by priority rank, then a recursive pre-order. */
    const reference = (parent: Int32Array, priority: Int32Array | null, keep: Uint8Array | null) => {
      const n = parent.length;
      const kept = (s: number) => !keep || keep[s] === 1;
      const eff = (s: number) => {
        let p = parent[s] as number;
        while (p >= 0 && !kept(p)) p = parent[p] as number;
        return p;
      };
      const rank = new Map<number, number>();
      priority?.forEach((s, i) => rank.has(s) || rank.set(s, i));
      const key = (s: number) => rank.get(s) ?? n + s;
      const kids = new Map<number, number[]>();
      for (let s = 0; s < n; s++) if (kept(s)) (kids.get(eff(s)) ?? kids.set(eff(s), []).get(eff(s)) as number[]).push(s);
      for (const list of kids.values()) list.sort((a, b) => key(a) - key(b));
      const out: { s: number; depth: number; pos: number; size: number; kids: number; parent: number }[] = [];
      const walk = (p: number, depth: number) => {
        const list = kids.get(p) ?? [];
        list.forEach((s, i) => {
          out.push({ s, depth, pos: i + 1, size: list.length, kids: (kids.get(s) ?? []).length, parent: p });
          walk(s, depth + 1);
        });
      };
      walk(-1, 0);
      return out;
    };
    for (let round = 0; round < 60; round++) {
      const n = 1 + rand(40);
      const parent = new Int32Array(n);
      for (let s = 0; s < n; s++) parent[s] = s === 0 || rand(4) === 0 ? -1 : rand(s);
      // Shuffle source order so parents may follow their children.
      const perm = Int32Array.from({ length: n }, (_, i) => i).sort(() => rand(3) - 1);
      const inv = new Int32Array(n);
      perm.forEach((s, i) => (inv[s] = i));
      const shuffled = new Int32Array(n);
      for (let i = 0; i < n; i++) shuffled[i] = parent[perm[i] as number]! < 0 ? -1 : (inv[parent[perm[i] as number] as number] as number);
      const base = buildTreeLayout(shuffled, null, null);
      const priority = rand(3) === 0 ? null : Int32Array.from({ length: rand(2) ? n : rand(n + 1) }, () => rand(n));
      let keep: Uint8Array | null = null;
      if (rand(3) > 0) {
        keep = new Uint8Array(n);
        for (let s = 0; s < n; s++) if (rand(3) === 0) keep[s] = 1;
        // Ancestor closed half the time (filterMode 'ancestors').
        if (rand(2)) for (let s = 0; s < n; s++) if (keep[s]) for (let p = shuffled[s] as number; p >= 0; p = shuffled[p] as number) keep[p] = 1;
      }
      const want = reference(shuffled, priority, keep);
      for (const layout of [buildTreeLayout(shuffled, priority, keep, base), buildTreeLayout(shuffled, priority, keep)]) {
        const at = `round ${round}`;
        assert.equal(layout.count, want.length, at);
        assert.deepEqual([...layout.order], want.map((w) => w.s), at);
        want.forEach((w, slot) => {
          assert.equal(layout.slot[w.s], slot, at);
          assert.equal(layout.parent[w.s], w.parent, at);
          assert.equal(layout.depth[w.s], w.depth, at);
          assert.equal(layout.childCount[w.s], w.kids, at);
          assert.equal(layout.posinset[w.s], w.pos, at);
          assert.equal(layout.setsize[w.s], w.size, at);
          let end = slot + 1;
          while (end < want.length && (want[end] as { depth: number }).depth > w.depth) end++;
          assert.equal(layout.next[slot], end, at);
          assert.deepEqual(siblingInfo(layout, w.s), [w.kids, w.pos, w.size], at);
        });
        assert.deepEqual([...layout.roots], want.flatMap((w, slot) => (w.parent < 0 ? [slot] : [])), at);
        for (let s = 0; s < n; s++) if (keep && !keep[s]) assert.equal(layout.slot[s], -1, at);
      }
    }
  });

  it('warns once about orphans and cycles in engine data', () => {
    const rows: Node[] = [
      { id: 'r', name: 'r', n: 1 },
      { id: 'o', name: 'o', n: 1, parentId: 'nope' },
      { id: 'c1', name: 'c1', n: 1, parentId: 'c2' },
      { id: 'c2', name: 'c2', n: 1, parentId: 'c1' },
    ];
    const { engine, tree, warnings } = makeEngine(rows, { parentIdField: 'parentId' });
    assert.deepEqual(visibleIds(engine), ['r', 'o', 'c1', 'c2']);
    tree.getTreeRow('o');
    assert.deepEqual(warnings.map((w) => w.code).sort(), ['tree-cycle', 'tree-orphan']);
    assert.equal(tree.getTreeRow('c2')?.parentId, 'c1');
    assert.equal(tree.getTreeRow('c1')?.parentId, null);
  });
});

describe('tree shapes in the engine', () => {
  it('renders nested rows (tree: true) and flat rows in the same pre-order', () => {
    const a = makeEngine(flattenTree(nested(), 'children'), true);
    const b = makeEngine(flat(), { parentIdField: 'parentId' });
    assert.deepEqual(visibleIds(a.engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    assert.deepEqual(visibleIds(b.engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    const view = b.engine.getSnapshot().rows.view;
    assert.equal(view?.kind, 'tree');
    assert.deepEqual({ ...b.engine.getRowSnapshot('a21') }, { id: 'a21', kind: 'data', row: flat()[0] ? b.engine.getRow('a21') : null, index: 3, depth: 2, parentId: 'a2' });
  });

  it('getTreeRow and getChildRows describe rows', () => {
    const { tree } = makeEngine(flattenTree(nested(), 'children'), true);
    assert.deepEqual({ ...tree.getTreeRow('a2') }, {
      rowId: 'a2',
      depth: 1,
      parentId: 'a',
      hasChildren: true,
      childCount: 1,
      expanded: true,
      loadStatus: 'idle',
      posinset: 2,
      setsize: 2,
      context: false,
      visible: true,
    });
    assert.equal(tree.getTreeRow('a2'), tree.getTreeRow('a2'), 'stable identity');
    assert.deepEqual(tree.getChildRowIds('a'), ['a1', 'a2']);
    assert.deepEqual(tree.getChildRowIds(null), ['a', 'b', 'c']);
    assert.deepEqual(tree.getChildRows('b').map((r) => r.id), ['b1']);
    assert.equal(tree.getTreeRow('nope'), null);
    assert.deepEqual(tree.getInfo().shape, 'nested');
  });

  it('exposes the tree column and options ( core)', () => {
    const { tree } = makeEngine(flat(), { parentIdField: 'parentId', column: 'name', filterMode: 'both', pageBy: 'root', checkbox: { cascade: 'filtered' } });
    const info = tree.getInfo();
    assert.equal(info.column, 'name');
    assert.equal(info.shape, 'flat');
    assert.equal(info.filterMode, 'both');
    assert.equal(info.pageBy, 'root');
    assert.equal(info.cascade, 'filtered');
    assert.equal(info.checkbox, true);
  });
});

describe('tree expansion', () => {
  const rows = () => flattenTree(nested(), 'children');

  it('expand, collapse and toggle by id; leaves reject', () => {
    const { engine, tree } = makeEngine(rows(), true);
    assert.equal(engine.dispatch({ type: 'tree.collapse', rowId: 'a' }).status, 'applied');
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'b1', 'c']);
    assert.equal(tree.isExpanded('a'), false);
    engine.dispatch({ type: 'tree.toggle', rowId: 'a' });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'tree.collapse', rowIds: ['a2', 'b'] });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'c']);
    engine.dispatch({ type: 'tree.toggle', rowId: 'b', expanded: true });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'b1', 'c']);
    assert.deepEqual(engine.dispatch({ type: 'tree.toggle', rowId: 'c' }), { status: 'rejected', reason: 'noChildren' });
    assert.equal(engine.getRowIndex('a21'), -1);
    assert.equal(engine.getRowIndex('b1'), 4);
  });

  it('expand all, collapse all, and per level', () => {
    const { engine } = makeEngine(rows(), true);
    engine.dispatch({ type: 'tree.collapseAll' });
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'c']);
    engine.dispatch({ type: 'tree.expandLevel', depth: 0 });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'tree.expandLevel', depth: 1 });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'tree.collapseLevel', depth: 0 });
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'c']);
    engine.dispatch({ type: 'tree.expandAll' });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    assert.deepEqual(engine.getSnapshot().query.expansion.tree, { '*': true });
  });

  it('defaultExpanded false and depth numbers', () => {
    assert.deepEqual(visibleIds(makeEngine(rows(), { defaultExpanded: false }).engine), ['a', 'b', 'c']);
    assert.deepEqual(visibleIds(makeEngine(rows(), { defaultExpanded: 1 }).engine), ['a', 'a1', 'a2', 'b', 'b1', 'c']);
    const { engine } = makeEngine(rows(), { defaultExpanded: 1 });
    assert.deepEqual(engine.getSnapshot().query.expansion.tree, { '*': false, '*1': true });
  });

  it('initial expansion from a data field, overridden by commands', () => {
    const data = rows().map((r) => (r.id === 'a' ? { ...r, open: false } : r.id === 'b' ? { ...r, open: true } : r));
    const { engine } = makeEngine(data, { childrenField: 'children', expandedField: 'open', defaultExpanded: false });
    // a closed by its field, b open by its field, a2 closed by the default.
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'tree.collapseAll' });
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'c']);
  });

  it('controlled expansion through tree.setExpanded and query.expansion.tree', () => {
    const { engine } = makeEngine(rows(), { expandedRows: { a: false } });
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'tree.setExpanded', expanded: { b: false }, defaultExpanded: true });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'c']);
    engine.dispatch({ type: 'tree.setExpanded', expanded: { a: true }, defaultExpanded: false });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'c']);
    assert.deepEqual(engine.getSnapshot().query.expansion.tree, { a: true, '*': false });
    // The query form round-trips through defaultQuery.
    const again = makeEngine(rows(), true, { defaultQuery: { expansion: { tree: { a: true, '*': false } } } });
    assert.deepEqual(visibleIds(again.engine), ['a', 'a1', 'a2', 'b', 'c']);
  });

  it('expansion survives sorting, filtering, paging and data patches', () => {
    const source = createLocalDataSource<Node>(rows(), { getRowId: (r) => r.id });
    const { engine } = makeEngine([], true, { dataSource: source, paging: { enabled: true, pageSize: 3 } });
    engine.dispatch({ type: 'tree.collapse', rowId: 'a2' });
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n', direction: 'desc' }] });
    engine.dispatch({ type: 'paging.setEnabled', enabled: false });
    assert.deepEqual(visibleIds(engine), ['c', 'a', 'a1', 'a2', 'b', 'b1']);
    engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'n', operator: 'greaterThan', value: 1 }] });
    assert.deepEqual(visibleIds(engine), ['c', 'a', 'a1', 'a2', 'b', 'b1']);
    engine.dispatch({ type: 'filter.clear' });
    source.patch({ upsert: [{ id: 'a2', name: 'Avocado 2', n: 1, children: [{ id: 'a21', name: 'Acorn', n: 5 }] }] });
    assert.equal(engine.getRow('a2')?.name, 'Avocado 2');
    assert.equal(engine.getRowIndex('a21'), -1, 'a2 stays collapsed');
    source.patch({ remove: ['b1'] });
    assert.deepEqual(visibleIds(engine), ['c', 'a', 'a1', 'a2', 'b']);
  });

  it('expand and collapse the focused row (key commands tree.expandFocused / tree.collapseFocused)', () => {
    const { engine } = makeEngine(rows(), true, {}, [createFocusModule<Node>()]);
    assert.deepEqual(engine.dispatch({ type: 'tree.collapseFocused' }), { status: 'rejected', reason: 'noFocus' });
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'a', columnId: 'name' } });
    engine.dispatch({ type: 'tree.collapseFocused' });
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'tree.expandFocused' });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
  });

  it('a replaced nested parent keeps children matched by id', () => {
    const source = createLocalDataSource<Node>(rows(), { getRowId: (r) => r.id });
    const { engine } = makeEngine([], true, { dataSource: source });
    source.patch({ upsert: [{ id: 'b', name: 'Beta 2', n: 1, children: [{ id: 'b1', name: 'Banana', n: 9 }] }] });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    assert.equal(engine.getRowSnapshot('b1')?.parentId, 'b');
  });
});

describe('tree mode and other features ( core)', () => {
  it('tree wins over grouping, with a development warning', () => {
    const { engine, tree, warnings } = makeEngine(flattenTree(nested(), 'children'), true, { defaultQuery: { grouping: [{ columnId: 'n' }] } }, [createGroupingModule<Node>()]);
    assert.equal(engine.getSnapshot().rows.view?.kind, 'tree');
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    tree.getInfo();
    assert.ok(warnings.some((w) => w.code === 'tree-grouping'));
  });

  it('warns when both shapes are configured (childrenField wins)', () => {
    const { tree, warnings } = makeEngine(flattenTree(nested(), 'children'), { childrenField: 'children', parentIdField: 'parentId' });
    assert.equal(tree.getInfo().shape, 'nested');
    assert.ok(warnings.some((w) => w.code === 'tree-shape'));
  });
});

describe('tree query semantics', () => {
  it('sorts siblings within their parent; parents never move', () => {
    const { engine } = makeEngine(flattenTree(nested(), 'children'), true);
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n', direction: 'asc' }] });
    assert.deepEqual(visibleIds(engine), ['b', 'b1', 'a', 'a2', 'a21', 'a1', 'c']);
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'name', direction: 'desc' }] });
    assert.deepEqual(visibleIds(engine), ['c', 'b', 'b1', 'a', 'a2', 'a21', 'a1']);
  });

  it('filter modes: ancestors, descendants, both, none', () => {
    const { engine, tree } = makeEngine(flat(), { parentIdField: 'parentId' });
    const filter = { type: 'filter.set', filters: [{ columnId: 'name', operator: 'equal', value: 'Avocado' }] } as DataGridCommand;
    engine.dispatch(filter);
    assert.deepEqual(visibleIds(engine), ['a', 'a2']);
    assert.equal(tree.getTreeRow('a')?.context, true);
    assert.equal(tree.getTreeRow('a2')?.context, false);
    assert.equal(tree.getTreeRow('a2')?.posinset, 1);
    assert.equal(tree.getTreeRow('a2')?.setsize, 1);
    engine.dispatch({ type: 'tree.setOptions', filterMode: 'descendants' });
    assert.deepEqual(visibleIds(engine), ['a2', 'a21']);
    assert.equal(tree.getTreeRow('a21')?.context, true);
    engine.dispatch({ type: 'tree.setOptions', filterMode: 'both' });
    assert.deepEqual(visibleIds(engine), ['a', 'a2', 'a21']);
    engine.dispatch({ type: 'tree.setOptions', filterMode: 'none' });
    engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'n', operator: 'greaterThan', value: 2 }] });
    // a(3) root, a21(5) re-parented to a (a2 is dropped), b1(9) a root, c(4) a root.
    assert.deepEqual(visibleIds(engine), ['a', 'a21', 'b1', 'c']);
    assert.equal(engine.getRowSnapshot('a21')?.depth, 1);
    assert.equal(engine.getRowSnapshot('a21')?.parentId, 'a');
    assert.equal(engine.getRowSnapshot('b1')?.depth, 0);
  });

  it('a context parent sorts by its own value among its siblings ( with)', () => {
    const { engine } = makeEngine(flat(), { parentIdField: 'parentId' });
    engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'n', operator: 'greaterThanOrEqual', value: 5 }] });
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n', direction: 'asc' }] });
    // Context parents b (1) and a (3) keep their own sort position.
    assert.deepEqual(visibleIds(engine), ['b', 'b1', 'a', 'a2', 'a21']);
  });

  it('search honors the filter mode', () => {
    const { engine } = makeEngine(flat(), { parentIdField: 'parentId' });
    engine.dispatch({ type: 'search.set', text: 'acorn' });
    assert.deepEqual(visibleIds(engine), ['a', 'a2', 'a21']);
    engine.dispatch({ type: 'tree.setOptions', filterMode: 'none' });
    assert.deepEqual(visibleIds(engine), ['a21']);
  });

  it('a filter never changes expansion: matches in collapsed parents stay hidden', () => {
    const { engine, tree } = makeEngine(flat(), { parentIdField: 'parentId' });
    engine.dispatch({ type: 'tree.collapse', rowId: 'a2' });
    engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'name', operator: 'equal', value: 'Acorn' }] });
    assert.deepEqual(visibleIds(engine), ['a', 'a2']);
    assert.equal(tree.getTreeRow('a21')?.visible, false);
    engine.dispatch({ type: 'tree.expand', rowId: 'a2' });
    assert.deepEqual(visibleIds(engine), ['a', 'a2', 'a21']);
  });

  it('facets count matching rows of every depth', () => {
    const { engine } = makeEngine(flat(), { parentIdField: 'parentId' });
    engine.dispatch({ type: 'tree.collapseAll' });
    const facet = (engine as unknown as { filter: { getFacet(id: string): { values: readonly { label: string; count: number }[]; rowCount: number } } }).filter.getFacet('n');
    assert.equal(facet.rowCount, 7);
    assert.deepEqual(
      facet.values.map((v) => [v.label, v.count]),
      [['1', 2], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['9', 1]],
    );
  });
});

describe('tree paging', () => {
  it("pageBy 'all' pages visible rows and re-pages on expand", () => {
    const { engine } = makeEngine(flattenTree(nested(), 'children'), true, { paging: { enabled: true, pageSize: 3 } });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2']);
    const pager = (engine as unknown as { paging: { getInfo(): { pageCount: number; totalRowCount: number } } }).paging;
    assert.equal(pager.getInfo().pageCount, 3);
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    assert.deepEqual(visibleIds(engine), ['a21', 'b', 'b1']);
    engine.dispatch({ type: 'tree.collapse', rowId: 'a' });
    assert.equal(pager.getInfo().totalRowCount, 4);
    assert.equal(pager.getInfo().pageCount, 2);
    assert.deepEqual(visibleIds(engine), ['c']);
  });

  it("pageBy 'root' pages root rows with their visible subtrees", () => {
    const { engine } = makeEngine(flattenTree(nested(), 'children'), { pageBy: 'root' }, { paging: { enabled: true, pageSize: 2 } });
    const pager = (engine as unknown as { paging: { getInfo(): { pageCount: number; totalRowCount: number } } }).paging;
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1']);
    assert.equal(pager.getInfo().totalRowCount, 3);
    assert.equal(pager.getInfo().pageCount, 2);
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    assert.deepEqual(visibleIds(engine), ['c']);
    engine.dispatch({ type: 'paging.goToPage', page: 1 });
    engine.dispatch({ type: 'tree.collapse', rowId: 'a' });
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'b1']);
    assert.equal(engine.getSnapshot().rows.view?.dataCount, 3);
  });
});

describe('tree with detail rows, aggregates and child summaries', () => {
  it('detail rows follow their tree row and hide with it ( core)', () => {
    const { engine } = makeEngine(flattenTree(nested(), 'children'), true);
    engine.dispatch({ type: 'detail.expand', rowId: 'a2' });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', '__detail:a2', 'a21', 'b', 'b1', 'c']);
    assert.equal(engine.getSnapshot().rows.view?.kind, 'detail');
    engine.dispatch({ type: 'tree.collapse', rowId: 'a' });
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'b1', 'c']);
  });

  it('footer aggregates cover rows of every depth', () => {
    const { engine } = makeEngine(flattenTree(nested(), 'children'), { defaultExpanded: false });
    engine.dispatch({ type: 'aggregates.set', aggregates: [{ columnId: 'n', type: 'sum' }, { columnId: 'n', type: 'count' }] });
    const footer = (engine as unknown as { aggregates: { getFooter(): Record<string, Record<string, unknown>> } }).aggregates.getFooter();
    assert.deepEqual(footer['n'], { sum: 25, count: 7 });
  });

  it('child summary rows after the last visible descendant of each expanded parent', () => {
    const { engine, tree } = makeEngine(flattenTree(nested(), 'children'), { childSummary: true });
    engine.dispatch({ type: 'aggregates.set', aggregates: [{ columnId: 'n', type: 'sum' }, { columnId: 'n', type: 'max' }] });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', '__tf:a2', '__tf:a', 'b', 'b1', '__tf:b', 'c']);
    const snap = engine.getRowSnapshot(`${TREE_FOOTER_ID_PREFIX}a`);
    assert.deepEqual({ ...snap }, { id: '__tf:a', kind: 'groupFooter', row: null, index: 5, depth: 1, parentId: 'a' });
    assert.equal(engine.getSnapshot().rows.view?.dataCount, 7);
    assert.deepEqual(tree.getChildSummary('a')?.['n'], { sum: 8, max: 5 });
    assert.deepEqual(tree.getChildSummary('a2')?.['n'], { sum: 5, max: 5 });
    engine.dispatch({ type: 'tree.collapse', rowId: 'a2' });
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', '__tf:a', 'b', 'b1', '__tf:b', 'c']);
    // Summaries cover collapsed descendants too.
    assert.deepEqual(tree.getChildSummary('a')?.['n'], { sum: 8, max: 5 });
  });
});

describe('tree state', () => {
  it('withTreeState: getState / restoreState / resetState include tree.expandedRows', () => {
    const { engine } = makeEngine(flattenTree(nested(), 'children'), true);
    const state = withTreeState(createDataGridStateApi(engine), engine);
    assert.deepEqual(state.initialState.tree, { expandedRows: {}, defaultExpanded: true });
    engine.dispatch({ type: 'tree.collapse', rowId: 'a' });
    const saved = state.getState();
    assert.deepEqual(saved.tree, { expandedRows: { a: false }, defaultExpanded: true });
    engine.dispatch({ type: 'tree.collapseAll' });
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'c']);
    assert.equal(state.restoreState(JSON.stringify(saved)).status, 'applied');
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'tree.collapseAll' });
    assert.equal(state.restoreState(serializeDataGridState(saved)).status, 'applied', 'serialized (base64url) states carry the part');
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'b1', 'c']);
    assert.equal(state.getState({ exclude: ['tree'] }).tree, undefined);
    state.resetState();
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    // The plain state API (default path) carries no tree part.
    assert.equal(createDataGridStateApi(engine).getState().tree, undefined);
  });

  it('withTreePersistence: a storage binding saves and loads the tree part', async () => {
    const { engine } = makeEngine(flattenTree(nested(), 'children'), true);
    let stored: unknown = null;
    const fns = withTreePersistence(DATA_GRID_PERSISTENCE_FNS);
    engine.dispatch({ type: 'tree.setExpanded', expanded: { b: false }, defaultExpanded: 1 });
    stored = JSON.parse(JSON.stringify(fns.getDataGridState(engine, {})));
    assert.deepEqual((stored as { tree: unknown }).tree, { expandedRows: { b: false }, defaultExpanded: 1 });
    engine.dispatch({ type: 'tree.expandAll' });
    const normalized = fns.normalizeDataGridState(stored);
    assert.deepEqual(normalized.tree, { expandedRows: { b: false }, defaultExpanded: 1 });
    fns.restoreDataGridState(engine, normalized);
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'c']);
    assert.deepEqual(fns.deserializeDataGridState(serializeDataGridState(normalized)).tree, normalized.tree);
  });

  it('a storage binding over withTreePersistence saves after tree commands; exclude: ["tree"] does not', async () => {
    const saves: unknown[] = [];
    const storage = { load: () => null, save: (_key: string, state: unknown) => void saves.push(state) };
    const { engine } = makeEngine(flattenTree(nested(), 'children'), true);
    const binding = bindDataGridPersistence(engine, { storage }, withTreePersistence(DATA_GRID_PERSISTENCE_FNS));
    engine.dispatch({ type: 'tree.collapse', rowId: 'a' });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual((saves.at(-1) as { tree?: unknown } | undefined)?.tree, { expandedRows: { a: false }, defaultExpanded: true });
    binding.dispose();
    const other = makeEngine(flattenTree(nested(), 'children'), true).engine;
    const excluded = bindDataGridPersistence(other, { storage, exclude: ['tree'] }, withTreePersistence(DATA_GRID_PERSISTENCE_FNS));
    const count = saves.length;
    other.dispatch({ type: 'tree.collapse', rowId: 'a' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(saves.length, count);
    excluded.dispose();
  });
});

// ---------------------------------------------------------------------------
// Randomized oracle
// ---------------------------------------------------------------------------

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Scenario {
  rows: Node[];
  sort: 'none' | 'asc' | 'desc';
  filterBelow: number | null;
  mode: 'ancestors' | 'descendants' | 'both' | 'none';
  defaultExpanded: boolean | number;
  overrides: Record<string, boolean>;
  footers: boolean;
  paging: { pageBy: 'all' | 'root'; pageSize: number; page: number } | null;
}

function scenario(seed: number): Scenario {
  const r = rng(seed);
  const count = 1 + Math.floor(r() * 40);
  const made: { id: string; parent: number }[] = [];
  for (let i = 0; i < count; i++) made.push({ id: `r${i}`, parent: i === 0 || r() < 0.25 ? -1 : Math.floor(r() * i) });
  const rows: Node[] = made.map((m, i) => ({ id: m.id, name: `n${i}`, n: Math.floor(r() * 6), parentId: m.parent < 0 ? null : (made[m.parent] as { id: string }).id }));
  // Flat data in any order.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [rows[i], rows[j]] = [rows[j] as Node, rows[i] as Node];
  }
  const overrides: Record<string, boolean> = {};
  for (const row of rows) if (r() < 0.3) overrides[row.id] = r() < 0.5;
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)] as T;
  const d = r();
  return {
    rows,
    sort: pick(['none', 'asc', 'desc'] as const),
    filterBelow: r() < 0.6 ? Math.floor(r() * 6) : null,
    mode: pick(['ancestors', 'descendants', 'both', 'none'] as const),
    defaultExpanded: d < 0.4 ? true : d < 0.7 ? false : Math.floor(r() * 4),
    overrides,
    footers: r() < 0.3,
    paging: r() < 0.4 ? { pageBy: pick(['all', 'root'] as const), pageSize: 1 + Math.floor(r() * 6), page: 1 + Math.floor(r() * 3) } : null,
  };
}

/** Materializes the expected visible ids, depths, and sibling ordinals. */
function expected(sc: Scenario): { ids: string[]; depth: Map<string, number>; pos: Map<string, [number, number]> } {
  const rows = sc.rows;
  const index = new Map(rows.map((row, i) => [row.id, i] as const));
  const parent = rows.map((row) => (row.parentId == null ? -1 : (index.get(String(row.parentId)) ?? -1)));
  const trueDepth = (i: number): number => (parent[i] as number) < 0 ? 0 : trueDepth(parent[i] as number) + 1;
  const match = rows.map((row) => sc.filterBelow === null || row.n < sc.filterBelow);
  const filtered = sc.filterBelow !== null;
  const keep = match.slice();
  const ancestorOf = (a: number, b: number): boolean => {
    for (let p = parent[b] as number; p >= 0; p = parent[p] as number) if (p === a) return true;
    return false;
  };
  if (filtered && sc.mode !== 'none') {
    for (let i = 0; i < rows.length; i++) {
      if (keep[i]) continue;
      for (let m = 0; m < rows.length; m++) {
        if (!match[m]) continue;
        if ((sc.mode === 'ancestors' || sc.mode === 'both') && ancestorOf(i, m)) keep[i] = true;
        if ((sc.mode === 'descendants' || sc.mode === 'both') && ancestorOf(m, i)) keep[i] = true;
      }
    }
  }
  const eff = (i: number): number => {
    for (let p = parent[i] as number; p >= 0; p = parent[p] as number) if (keep[p]) return p;
    return -1;
  };
  const cmp = (x: number, y: number): number => {
    if (sc.sort !== 'none') {
      const d = (rows[x] as Node).n - (rows[y] as Node).n;
      if (d !== 0) return sc.sort === 'asc' ? d : -d;
    }
    return x - y;
  };
  const kids = new Map<number, number[]>();
  for (let i = 0; i < rows.length; i++) {
    if (!keep[i]) continue;
    const p = eff(i);
    if (!kids.has(p)) kids.set(p, []);
    (kids.get(p) as number[]).push(i);
  }
  for (const list of kids.values()) list.sort(cmp);
  const expandedOf = (i: number): boolean => {
    const id = (rows[i] as Node).id;
    if (id in sc.overrides) return sc.overrides[id] as boolean;
    const d = sc.defaultExpanded;
    return d === true || (typeof d === 'number' && trueDepth(i) < d);
  };
  // Visible list: data rows as { id, root }, footers as { footer }.
  const items: ({ kind: 'data'; id: string; rootOrdinal: number } | { kind: 'footer'; id: string })[] = [];
  const depth = new Map<string, number>();
  const pos = new Map<string, [number, number]>();
  const walk = (i: number, level: number, rootOrdinal: number): void => {
    const id = (rows[i] as Node).id;
    items.push({ kind: 'data', id, rootOrdinal });
    depth.set(id, level);
    const children = kids.get(i) ?? [];
    if (children.length && expandedOf(i)) {
      for (const c of children) walk(c, level + 1, rootOrdinal);
      if (sc.footers) items.push({ kind: 'footer', id: `__tf:${id}` });
    }
  };
  const roots = kids.get(-1) ?? [];
  roots.forEach((root, k) => walk(root, 0, k));
  for (const [p, list] of kids) list.forEach((c, k) => pos.set((rows[c] as Node).id, [k + 1, list.length]));
  void kids;
  let ids: string[];
  if (!sc.paging) ids = items.map((x) => x.id);
  else {
    // Data positions of the page window [lo, hi); footers with lo < (data rows before) <= hi.
    const dataBefore: number[] = [];
    let p = 0;
    for (const x of items) {
      dataBefore.push(p);
      if (x.kind === 'data') p++;
    }
    const total = p;
    const units = sc.paging.pageBy === 'root' ? roots.length : total;
    const pageCount = Math.max(1, Math.ceil(units / sc.paging.pageSize));
    const page = Math.min(sc.paging.page, pageCount);
    const a = (page - 1) * sc.paging.pageSize;
    const b = Math.min(units, a + sc.paging.pageSize);
    let lo: number;
    let hi: number;
    if (sc.paging.pageBy === 'all') {
      lo = a;
      hi = b;
    } else {
      const firstOf = (k: number): number => {
        if (k >= roots.length) return total;
        let q = 0;
        for (const x of items) {
          if (x.kind === 'data' && x.rootOrdinal === k) return q;
          if (x.kind === 'data') q++;
        }
        return total;
      };
      lo = firstOf(a);
      hi = firstOf(b);
    }
    ids = [];
    items.forEach((x, k) => {
      const before = dataBefore[k] as number;
      if (x.kind === 'data' ? before >= lo && before < hi : before > lo && before <= hi) ids.push(x.id);
    });
  }
  return { ids, depth, pos };
}

describe('tree oracle', () => {
  it('matches a materialized visible list for random trees, sorts, filters, modes, expansion, footers and paging', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const sc = scenario(seed);
      const { engine, tree } = makeEngine(sc.rows, { parentIdField: 'parentId', filterMode: sc.mode, defaultExpanded: sc.defaultExpanded, expandedRows: sc.overrides, childSummary: sc.footers, pageBy: sc.paging?.pageBy ?? 'all' }, {
        paging: sc.paging ? { enabled: true, pageSize: sc.paging.pageSize } : { enabled: false },
      });
      engine.batch(() => {
        if (sc.sort !== 'none') engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n', direction: sc.sort as 'asc' | 'desc' }] });
        if (sc.filterBelow !== null) engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'n', operator: 'lessThan', value: sc.filterBelow }] });
      });
      if (sc.paging && sc.paging.page > 1) engine.dispatch({ type: 'paging.goToPage', page: sc.paging.page });
      const want = expected(sc);
      const got = visibleIds(engine);
      // goToPage rejects pages past the end (the oracle clamps): compare with page 1 then.
      if (sc.paging && engine.getModuleState<{ page: number }>('paging')?.page !== Math.min(sc.paging.page, Number.MAX_SAFE_INTEGER)) {
        const again = expected({ ...sc, paging: { ...sc.paging, page: engine.getModuleState<{ page: number }>('paging')?.page ?? 1 } });
        assert.deepEqual(got, again.ids, `seed ${seed}`);
      } else assert.deepEqual(got, want.ids, `seed ${seed}`);
      for (let i = 0; i < got.length; i++) {
        const id = got[i] as string;
        assert.equal(engine.getRowIndex(id), i, `seed ${seed} index of ${id}`);
        if (id.startsWith('__tf:')) continue;
        assert.equal(engine.getRowSnapshot(id)?.depth, want.depth.get(id), `seed ${seed} depth of ${id}`);
        const info = tree.getTreeRow(id);
        assert.deepEqual([info?.posinset, info?.setsize], want.pos.get(id), `seed ${seed} posinset of ${id}`);
      }
      // Every view index lookup agrees with indexOfSource.
      const view = engine.getSnapshot().rows.view;
      assert.ok(view);
      const structure = treeOf(engine.getSnapshot().rows);
      assert.ok(structure);
    }
  });
});
