// Tree mode export model: data rows carry
// the tree depth in visible pre-order, `tree: 'all'` exports every kept row
// with collapsed parents and hidden rows flagged, the tree column index, the
// CSV depth column, page and source scopes, and the copy mode helper.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createDataGridEngine,
  createFilterModule,
  createPagingModule,
  createSortModule,
  type ColumnDef,
  type DataGridModule,
} from '@salmonui/data-grid/engine';
import { createExportModel, createExportModule, exportCsv, writeCsv, type ExportDataRow, type ExportModel } from '@salmonui/data-grid/engine/export';
import { createTreeModule, flattenTree, treeCopyRowIds, treeOf, type TreeOptions } from '@salmonui/data-grid/engine/tree';

interface Node {
  readonly id: string;
  readonly name: string;
  readonly n: number;
  readonly children?: Node[];
}

const columns: ColumnDef<Node>[] = [{ field: 'id', primaryKey: true }, { field: 'name' }, { field: 'n', type: 'number' }];

/** a [a1, a2 [a21]], b [b1], c */
function nested(): Node[] {
  return [
    { id: 'a', name: 'Alpha', n: 3, children: [{ id: 'a1', name: 'Apple', n: 2 }, { id: 'a2', name: 'Avocado', n: 1, children: [{ id: 'a21', name: 'Acorn', n: 5 }] }] },
    { id: 'b', name: 'Beta', n: 1, children: [{ id: 'b1', name: 'Banana', n: 9 }] },
    { id: 'c', name: 'Gamma', n: 4 },
  ];
}

type Modules = readonly DataGridModule<Node, any, any, string>[];

function makeEngine(tree: TreeOptions<Node> | true = true, extra: Record<string, unknown> = {}) {
  return createDataGridEngine<Node, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: flattenTree(nested(), 'children'),
    modules: [createFilterModule<Node>(), createSortModule<Node>(), createTreeModule<Node>(), createPagingModule<Node>(), createExportModule<Node>()],
    paging: { enabled: false },
    tree,
    ...extra,
  });
}

function rowsOf(model: ExportModel<Node>): { id: string; depth: number; collapsed?: true; hidden?: true }[] {
  const out: { id: string; depth: number; collapsed?: true; hidden?: true }[] = [];
  for (const r of model.rows()) {
    if (r.kind !== 'data') continue;
    const d = r as ExportDataRow<Node>;
    out.push({ id: d.id, depth: d.depth, ...(d.collapsed ? { collapsed: true as const } : {}), ...(d.hidden ? { hidden: true as const } : {}) });
  }
  return out;
}

describe('tree export model', () => {
  it('data rows carry the tree depth in visible pre-order, and the model names the tree column', () => {
    const engine = makeEngine();
    const model = createExportModel(engine);
    assert.deepEqual(rowsOf(model), [
      { id: 'a', depth: 0 },
      { id: 'a1', depth: 1 },
      { id: 'a2', depth: 1 },
      { id: 'a21', depth: 2 },
      { id: 'b', depth: 0 },
      { id: 'b1', depth: 1 },
      { id: 'c', depth: 0 },
    ]);
    assert.deepEqual(model.tree, { column: 0, depth: 2 });
    assert.equal(model.groupDepth, 0);
  });

  it('the tree column follows tree.column; a model without tree mode has no tree info', () => {
    const engine = makeEngine({ childrenField: 'children', column: 'name' });
    assert.equal(createExportModel(engine).tree?.column, 1);
    assert.equal(createExportModel(engine, { columns: ['id', 'n'] }).tree?.column, -1);
    const plain = createDataGridEngine({ getRowId: (r: Node) => r.id, columns, dataSource: nested(), modules: [createExportModule<Node>()] });
    const model = createExportModel(plain);
    assert.equal(model.tree, undefined);
    assert.ok(rowsOf(model).every((r) => r.depth === 0));
  });

  it("tree 'expanded' (default) skips collapsed subtrees; 'all' exports them with collapsed and hidden flags", () => {
    const engine = makeEngine();
    engine.dispatch({ type: 'tree.collapse', rowIds: ['a', 'b'] } as never);
    assert.deepEqual(rowsOf(createExportModel(engine)), [
      { id: 'a', depth: 0 },
      { id: 'b', depth: 0 },
      { id: 'c', depth: 0 },
    ]);
    assert.deepEqual(rowsOf(createExportModel(engine, { tree: 'all' })), [
      { id: 'a', depth: 0, collapsed: true },
      { id: 'a1', depth: 1, hidden: true },
      { id: 'a2', depth: 1, hidden: true },
      { id: 'a21', depth: 2, hidden: true },
      { id: 'b', depth: 0, collapsed: true },
      { id: 'b1', depth: 1, hidden: true },
      { id: 'c', depth: 0 },
    ]);
    // A collapsed parent under an expanded one: only its own subtree is hidden.
    engine.dispatch({ type: 'tree.expandAll' } as never);
    engine.dispatch({ type: 'tree.collapse', rowId: 'a2' } as never);
    assert.deepEqual(rowsOf(createExportModel(engine, { tree: 'all' })).slice(0, 5), [
      { id: 'a', depth: 0 },
      { id: 'a1', depth: 1 },
      { id: 'a2', depth: 1, collapsed: true },
      { id: 'a21', depth: 2, hidden: true },
      { id: 'b', depth: 0 },
    ]);
  });

  it('filtered and sorted trees export the kept rows in sorted sibling pre-order', () => {
    const engine = makeEngine();
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n', direction: 'desc' }] } as never);
    assert.deepEqual(
      rowsOf(createExportModel(engine)).map((r) => r.id),
      ['c', 'a', 'a1', 'a2', 'a21', 'b', 'b1'],
    );
    engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'name', operator: 'equal', value: 'Acorn' }] } as never);
    assert.deepEqual(rowsOf(createExportModel(engine)), [
      { id: 'a', depth: 0 },
      { id: 'a2', depth: 1 },
      { id: 'a21', depth: 2 },
    ]);
  });

  it("scope 'page' exports the page window; with tree 'all' it adds the window's collapsed subtrees", () => {
    const engine = makeEngine(true, { paging: { enabled: true, pageSize: 2 } });
    engine.dispatch({ type: 'tree.collapse', rowId: 'a' } as never);
    // Visible: a, b, b1, c. Page 1 = a, b.
    assert.deepEqual(rowsOf(createExportModel(engine, { scope: 'page' })).map((r) => r.id), ['a', 'b']);
    assert.deepEqual(rowsOf(createExportModel(engine, { scope: 'page', tree: 'all' })).map((r) => r.id), ['a', 'a1', 'a2', 'a21', 'b']);
    assert.deepEqual(rowsOf(createExportModel(engine)).map((r) => r.id), ['a', 'b', 'b1', 'c']);
  });

  it("scope 'all' exports every source row in tree pre-order with depths", () => {
    const engine = makeEngine();
    engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'name', operator: 'equal', value: 'Gamma' }] } as never);
    const model = createExportModel(engine, { scope: 'all', tree: 'all' });
    assert.deepEqual(rowsOf(model).map((r) => `${r.id}:${r.depth}`), ['a:0', 'a1:1', 'a2:1', 'a21:2', 'b:0', 'b1:1', 'c:0']);
  });

  it('CSV writes visible pre-order with an optional depth column', async () => {
    const engine = makeEngine();
    engine.dispatch({ type: 'tree.collapse', rowId: 'b' } as never);
    const file = await exportCsv(engine, { treeDepthColumn: true, columns: [{ field: 'id' }, { field: 'name' }] });
    assert.equal(file?.data, 'Depth,id,name\r\n0,a,Alpha\r\n1,a1,Apple\r\n1,a2,Avocado\r\n2,a21,Acorn\r\n0,b,Beta\r\n0,c,Gamma\r\n');
    const all = await exportCsv(engine, { tree: 'all', treeDepthColumn: 'Level', columns: [{ field: 'id' }] });
    assert.equal(all?.data, 'Level,id\r\n0,a\r\n1,a1\r\n1,a2\r\n2,a21\r\n0,b\r\n1,b1\r\n0,c\r\n');
    // Without the option the CSV is unchanged; outside tree mode the option is ignored.
    assert.equal(writeCsv(createExportModel(engine, { columns: ['id'] })), 'id\r\na\r\na1\r\na2\r\na21\r\nb\r\nc\r\n');
    const plain = createDataGridEngine({ getRowId: (r: Node) => r.id, columns, dataSource: [nested()[2] as Node], modules: [createExportModule<Node>()] });
    assert.equal(writeCsv(createExportModel(plain, { columns: ['id'] }), { treeDepthColumn: true }), 'id\r\nc\r\n');
  });

  it('the depth column leaves aggregate lines empty', () => {
    const engine = createDataGridEngine<Node, Modules>({
      getRowId: (r) => r.id,
      columns,
      dataSource: flattenTree(nested(), 'children'),
      modules: [createTreeModule<Node>(), createAggregatesModule<Node>(), createExportModule<Node>()],
      tree: true,
      defaultQuery: { aggregates: [{ columnId: 'n', type: 'count', placement: ['footer'] }] },
    });
    const csv = writeCsv(createExportModel(engine, { columns: ['id', 'n'] }), { treeDepthColumn: true });
    const lines = csv.trimEnd().split('\r\n');
    assert.equal(lines[0], 'Depth,id,n');
    assert.equal(lines[lines.length - 1]?.split(',')[0], '');
  });
});

describe('tree copy rows', () => {
  const structure = () => {
    const engine = makeEngine();
    const s = treeOf(engine.getSnapshot().rows);
    assert.ok(s);
    return s;
  };

  it('copyMode adds ancestors, descendants, both, or nothing, in tree pre-order', () => {
    const s = structure();
    assert.deepEqual(treeCopyRowIds(s, ['a21', 'b1'], 'ancestors'), ['a', 'a2', 'a21', 'b', 'b1']);
    assert.deepEqual(treeCopyRowIds(s, ['a'], 'descendants'), ['a', 'a1', 'a2', 'a21']);
    assert.deepEqual(treeCopyRowIds(s, ['a2'], 'both'), ['a', 'a2', 'a21']);
    assert.deepEqual(treeCopyRowIds(s, ['c', 'a1'], 'none'), ['a1', 'c']);
    assert.deepEqual(treeCopyRowIds(s, ['zz', 'a1', 'a1'], 'none'), ['a1', 'zz']);
  });
});
