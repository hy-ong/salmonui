// internal/tree-store: the
// framework-agnostic model shared by TreeView and Dropdowns' TreeSelect.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTreeModel, createTreeStore, BIT_CHECKED, BIT_EXPANDED, BIT_LOADING, BIT_ERROR, BIT_MIXED, BIT_SELECTED, DISABLED, HAS_CHILDREN, UNKNOWN, type TreeKey } from '../dist/internal/tree-store.js';

interface Node {
  id: string;
  name: string;
  children?: Node[];
  lazy?: boolean;
  disabled?: boolean;
  parentId?: string | null;
}

const tree = (): Node[] => [
  {
    id: 'a',
    name: 'Alpha',
    children: [
      { id: 'a1', name: 'One', children: [{ id: 'a1x', name: 'X' }, { id: 'a1y', name: 'Y' }] },
      { id: 'a2', name: 'Two' },
    ],
  },
  { id: 'b', name: 'Beta', children: [{ id: 'b1', name: 'Bee' }] },
  { id: 'c', name: 'Gamma', lazy: true },
];

const base = { getItemId: (n: Node) => n.id, getItemLabel: (n: Node) => n.name, getChildren: (n: Node) => n.children, hasChildren: (n: Node) => n.lazy === true, isItemDisabled: (n: Node) => n.disabled === true };
const store = (data = tree(), extra: object = {}) => createTreeStore<Node>({ data, ...base, ...extra });
const visibleIds = (s: ReturnType<typeof store>) => [...s.order].map((i) => s.model.ids[i]);
const node = (s: ReturnType<typeof store>, id: TreeKey) => s.nodeOf(id);

describe('tree model', () => {
  it('builds a pre-order model from nested data with depth, parent, rank, size and setsize', () => {
    const m = buildTreeModel<Node>({ data: tree(), ...base });
    assert.deepEqual(m.ids, ['a', 'a1', 'a1x', 'a1y', 'a2', 'b', 'b1', 'c']);
    assert.deepEqual([...m.depth], [0, 1, 2, 2, 1, 0, 1, 0]);
    assert.deepEqual([...m.parent], [-1, 0, 1, 1, 0, -1, 5, -1]);
    assert.deepEqual([...m.size], [5, 3, 1, 1, 1, 2, 1, 1]);
    assert.deepEqual([...m.rank], [0, 0, 0, 1, 1, 1, 0, 2]);
    assert.deepEqual([...m.childCount], [2, 2, 0, 0, 0, 1, 0, 0]);
    assert.equal(m.rootCount, 3);
    assert.ok((m.flags[7] as number) & HAS_CHILDREN && (m.flags[7] as number) & UNKNOWN, 'hasChildren shows a twisty before children are known');
  });

  it('builds the same model from flat self-referential data (getParentId)', () => {
    const flat: Node[] = [
      { id: 'b1', name: 'Bee', parentId: 'b' },
      { id: 'a', name: 'Alpha', parentId: null },
      { id: 'a1', name: 'One', parentId: 'a' },
      { id: 'b', name: 'Beta' },
      { id: 'orphan', name: 'Orphan', parentId: 'missing' },
    ];
    const m = buildTreeModel<Node>({ data: flat, getItemId: (n) => n.id, getParentId: (n) => n.parentId });
    assert.deepEqual(m.ids, ['a', 'a1', 'b', 'b1', 'orphan']);
    assert.deepEqual([...m.depth], [0, 1, 0, 1, 0]);
  });

  it('reports duplicate ids and keeps the first in the index', () => {
    const m = buildTreeModel<Node>({ data: [{ id: 'x', name: '1' }, { id: 'x', name: '2' }], ...base });
    assert.deepEqual(m.duplicates, ['x']);
    assert.equal(m.index.get('x'), 0);
  });

  it('sorts siblings by label with the locale collator', () => {
    const data: Node[] = [{ id: '1', name: 'b' }, { id: '2', name: 'Ä' }, { id: '3', name: 'a10' }, { id: '4', name: 'a9' }];
    assert.deepEqual(buildTreeModel<Node>({ data, ...base, sort: 'asc' }).ids, ['2', '4', '3', '1']);
    assert.deepEqual(buildTreeModel<Node>({ data, ...base, sort: 'desc' }).ids, ['1', '3', '4', '2']);
    const s = store(data);
    s.setOptions({ sort: 'asc' });
    assert.deepEqual(visibleIds(s), ['2', '4', '3', '1']);
  });

  it('inherits disabled state down the subtree', () => {
    const data = tree();
    data[0]!.disabled = true;
    const m = buildTreeModel<Node>({ data, ...base });
    assert.ok((m.flags[2] as number) & DISABLED);
    assert.ok(!((m.flags[5] as number) & DISABLED));
  });
});

describe('visible order and expansion', () => {
  it('flattens only expanded subtrees; expand splices, collapse removes the range', () => {
    const s = store();
    assert.deepEqual(visibleIds(s), ['a', 'b', 'c']);
    s.setExpanded(node(s, 'a'), true);
    assert.deepEqual(visibleIds(s), ['a', 'a1', 'a2', 'b', 'c']);
    s.setExpanded(node(s, 'a1'), true);
    assert.deepEqual(visibleIds(s), ['a', 'a1', 'a1x', 'a1y', 'a2', 'b', 'c']);
    s.setExpanded(node(s, 'a'), false);
    assert.deepEqual(visibleIds(s), ['a', 'b', 'c']);
    s.setExpanded(node(s, 'a'), true);
    assert.deepEqual(visibleIds(s), ['a', 'a1', 'a1x', 'a1y', 'a2', 'b', 'c'], 'a re-expanded parent keeps its expanded children');
    assert.equal(s.positionOf(node(s, 'a2')), 4);
    assert.equal(s.positionOf(node(s, 'b1')), -1);
    assert.equal(s.setExpanded(node(s, 'a2'), true), false, 'a leaf does not expand');
  });

  it('expandAll / collapseAll with ids and level rebuild the order once', () => {
    const s = store();
    let calls = 0;
    s.subscribe(() => calls++);
    s.expandAll();
    assert.deepEqual(visibleIds(s), ['a', 'a1', 'a1x', 'a1y', 'a2', 'b', 'b1', 'c']);
    assert.equal(calls, 1);
    s.collapseAll();
    assert.deepEqual(visibleIds(s), ['a', 'b', 'c']);
    s.expandAll({ level: 1 });
    assert.deepEqual(visibleIds(s), ['a', 'a1', 'a2', 'b', 'b1', 'c']);
    s.collapseAll({ ids: ['b'] });
    assert.deepEqual(visibleIds(s), ['a', 'a1', 'a2', 'b', 'c']);
    s.expandAll({ ids: ['a1'] });
    assert.deepEqual(visibleIds(s), ['a', 'a1', 'a1x', 'a1y', 'a2', 'b', 'c']);
    s.collapseAll({ level: 2 });
    assert.deepEqual(visibleIds(s), ['a', 'a1', 'a2', 'b', 'c']);
    assert.deepEqual(s.expandedIds(), ['a']);
  });

  it('expanded ids survive a data change and apply to new nodes', () => {
    const s = store();
    s.setExpandedIds(['a', 'b']);
    const next = tree();
    next[1]!.children!.push({ id: 'b2', name: 'Bee 2' });
    s.setOptions({ data: next });
    assert.deepEqual(visibleIds(s), ['a', 'a1', 'a2', 'b', 'b1', 'b2', 'c']);
    assert.ok(s.bits('b') & BIT_EXPANDED);
  });
});

describe('lazy loading', () => {
  it('expanding an unknown node loads its children once and splices them in', async () => {
    const calls: string[] = [];
    const s = store(tree(), {
      loadChildren: async (n: Node) => {
        calls.push(n.id);
        return [{ id: `${n.id}-1`, name: 'Child', lazy: true }];
      },
    });
    s.setExpanded(node(s, 'c'), true);
    assert.ok(s.bits('c') & BIT_LOADING);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(visibleIds(s), ['a', 'b', 'c', 'c-1']);
    assert.equal(s.bits('c') & BIT_LOADING, 0);
    s.setExpanded(node(s, 'c'), false);
    s.setExpanded(node(s, 'c'), true);
    assert.deepEqual(calls, ['c'], 'loaded children are cached');
  });

  it('a rejected load sets the error state and calls onLoadError; retry loads again', async () => {
    let fail = true;
    const errors: unknown[] = [];
    const s = store(tree(), {
      loadChildren: async () => {
        if (fail) throw new Error('offline');
        return [{ id: 'c1', name: 'C1' }];
      },
      onLoadError: (e: unknown) => errors.push(e),
    });
    s.setExpanded(node(s, 'c'), true);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(s.bits('c') & BIT_ERROR);
    assert.equal((errors[0] as Error).message, 'offline');
    fail = false;
    s.load(node(s, 'c'));
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(visibleIds(s), ['a', 'b', 'c', 'c1']);
  });

  it('drops a stale response and aborts it when data changes', async () => {
    let resolve!: (v: Node[]) => void;
    let signal!: AbortSignal;
    const s = store(tree(), {
      loadChildren: (_n: Node, o: { signal: AbortSignal }) => {
        signal = o.signal;
        return new Promise<Node[]>((r) => (resolve = r));
      },
    });
    s.setExpanded(node(s, 'c'), true);
    s.setOptions({ data: tree() });
    assert.equal(signal.aborted, true);
    resolve([{ id: 'late', name: 'Late' }]);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(s.nodeOf('late'), -1);
  });
});

describe('checks', () => {
  it('cascade: a parent check checks the subtree, a child uncheck makes ancestors mixed', () => {
    const s = store();
    s.setChecked(node(s, 'a'), true);
    for (const id of ['a', 'a1', 'a1x', 'a1y', 'a2']) assert.ok(s.bits(id) & BIT_CHECKED, id);
    assert.deepEqual(s.checkedIds(), ['a', 'a1', 'a1x', 'a1y', 'a2']);
    s.setChecked(node(s, 'a1x'), false);
    assert.ok(s.bits('a') & BIT_MIXED);
    assert.ok(s.bits('a1') & BIT_MIXED);
    assert.ok(s.bits('a1y') & BIT_CHECKED);
    assert.ok(s.bits('a2') & BIT_CHECKED);
    assert.deepEqual(s.checkedIds(), ['a1y', 'a2']);
    s.setChecked(node(s, 'a1x'), true);
    assert.equal(s.checkState(node(s, 'a')), 1, 'all leaves checked again: the parent is checked');
    s.setChecked(node(s, 'a1y'), false);
    s.setChecked(node(s, 'a1x'), false);
    s.setChecked(node(s, 'a2'), false);
    assert.equal(s.checkState(node(s, 'a')), 0);
    s.setChecked(node(s, 'b1'), true);
    assert.equal(s.checkState(node(s, 'b')), 1, 'a single checked child checks its parent');
  });

  it('lazy marks resolve through ancestors after later toggles in between', () => {
    const s = store();
    s.setChecked(node(s, 'a1x'), true);
    s.setChecked(node(s, 'a'), false); // newer mark over the subtree
    assert.equal(s.checkState(node(s, 'a1x')), 0);
    s.setChecked(node(s, 'a1'), true);
    assert.equal(s.checkState(node(s, 'a')), 2);
    assert.deepEqual(s.checkedIds(), ['a1', 'a1x', 'a1y']);
    // The incremental counts agree with the O(n) recount for every node.
    for (let i = 0; i < s.model.count; i++) {
      const want = s.checkedIds().includes(s.model.ids[i] as string) ? 1 : s.checkState(i);
      assert.equal(s.checkState(i), want);
    }
  });

  it('none: nodes are independent', () => {
    const s = store(tree(), { checkPropagation: 'none' });
    s.setChecked(node(s, 'a'), true);
    assert.deepEqual(s.checkedIds(), ['a']);
    assert.equal(s.bits('a1') & BIT_CHECKED, 0);
  });

  it('cascadeToDisabled=false keeps disabled descendants and excludes them from counts', () => {
    const data = tree();
    data[0]!.children![1]!.disabled = true; // a2
    const s = store(data, { cascadeToDisabled: false });
    s.setChecked(node(s, 'a'), true);
    assert.equal(s.checkState(node(s, 'a2')), 0, 'the disabled child is not checked');
    assert.equal(s.checkState(node(s, 'a')), 1, 'the disabled child does not count');
    const t = store(data);
    t.setChecked(node(t, 'a'), true);
    assert.equal(t.checkState(node(t, 'a2')), 1, 'default: the cascade reaches disabled children');
  });

  it('checkAll / uncheckAll / setCheckedIds and survival across a lazy load', async () => {
    const s = store(tree(), { loadChildren: async () => [{ id: 'c1', name: 'C1' }, { id: 'c2', name: 'C2' }] });
    s.checkAll();
    assert.equal(s.checkedIds().length, 8);
    s.uncheckAll(['b']);
    assert.deepEqual(s.checkedIds(), ['a', 'a1', 'a1x', 'a1y', 'a2', 'c']);
    s.uncheckAll();
    assert.deepEqual(s.checkedIds(), []);
    s.setCheckedIds(['a1', 'c']);
    assert.ok(s.bits('a') & BIT_MIXED);
    s.setExpanded(node(s, 'c'), true);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(s.checkedIds(), ['a1', 'a1x', 'a1y', 'c', 'c1', 'c2'], 'children loaded under a checked node come checked');
    s.checkAll(['b']);
    assert.ok(s.bits('b1') & BIT_CHECKED);
  });
});

describe('selection, focus and bits', () => {
  it('selected ids drive the selected bit; focus and renaming are tracked by id', () => {
    const s = store();
    s.setSelected(['a', 'b']);
    assert.ok(s.bits('a') & BIT_SELECTED);
    assert.equal(s.bits('c') & BIT_SELECTED, 0);
    s.setFocused('b');
    assert.equal(s.focusedId, 'b');
    s.setRenaming('b');
    assert.equal(s.renamingId, 'b');
    assert.equal(s.label(node(s, 'c')), 'Gamma');
  });

  it('batch notifies once', () => {
    const s = store();
    let calls = 0;
    s.subscribe(() => calls++);
    s.batch(() => {
      s.setFocused('a');
      s.setSelected(['a']);
      s.setExpanded(0, true);
    });
    assert.equal(calls, 1);
    assert.equal(s.getOrderVersion(), 1);
  });
});
