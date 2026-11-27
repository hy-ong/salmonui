// Tree data over @salmonui/data: the reference handler's tree
// reads and writes (conformance), the JSON source over it, and the offline and
// controlled sources driving a data-grid-core engine in tree mode.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, createFilterModule, createPagingModule, createSearchModule, createSortModule, type ColumnDef, type DataGridModule } from '@salmonui/data-grid/engine';
import { createTreeModule, flattenTree, type TreeMethods } from '@salmonui/data-grid/engine/tree';
import { createRemoteTree, type RemoteTreeEnvelope } from '@salmonui/data-grid/engine/tree-remote';
import {
  createControlledDataSource,
  createJsonDataSource,
  tupleColumns,
  tupleRowId,
  type DataSourceRequest,
  type TreeLoadResult,
  type TupleRow,
  type WireReadResponse,
} from '@salmonui/data';
import { createOfflineDataSource } from '@salmonui/data/local';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { query, request } from './helpers.ts';

type Obj = Record<string, unknown>;

/** a [a1, a2 [a21]], b [b1], c */
function nodes(): Obj[] {
  return [
    { id: 'a', parent: null, name: 'Alpha', n: 3 },
    { id: 'a1', parent: 'a', name: 'Apple', n: 2 },
    { id: 'a2', parent: 'a', name: 'Avocado', n: 1 },
    { id: 'a21', parent: 'a2', name: 'Acorn', n: 5 },
    { id: 'b', parent: null, name: 'Beta', n: 1 },
    { id: 'b1', parent: 'b', name: 'Banana', n: 9 },
    { id: 'c', parent: null, name: 'Gamma', n: 4 },
  ];
}

const FIELDS = ['id', 'parent', 'name', 'n'] as const;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function handler(rows: Obj[] = nodes()) {
  return createJsonQueryHandler(rows, { key: 'id', parentField: 'parent', fields: FIELDS, types: { id: 'string', parent: 'string', name: 'string', n: 'number' } });
}

const read = (server: ReturnType<typeof handler>, body: Obj): WireReadResponse => server.handle({ v: 1, id: 'r', query: {}, ...body }) as WireReadResponse;
const ids = (r: WireReadResponse): unknown[] => r.rows.map((t) => t[0]);

describe('adapter conformance: tree reads (reference handler)', () => {
  it('reads one level with childCounts; `parent: null` is the root level', () => {
    const server = handler();
    const roots = read(server, { parent: null });
    assert.deepEqual(ids(roots), ['a', 'b', 'c']);
    assert.deepEqual(roots.childCounts, [2, 1, 0]);
    assert.equal(roots.total, 3);
    assert.equal(roots.parents, undefined, 'one level: every row is a child of the requested parent');
    const level = read(server, { parent: 'a', query: { sort: [{ field: 'name', dir: 'desc' }] } });
    assert.deepEqual(ids(level), ['a2', 'a1'], 'siblings follow the sort');
    assert.deepEqual(level.childCounts, [1, 0]);
  });

  it("filtered reads return every match with its ancestor chain (filterMode 'ancestors')", () => {
    const server = handler();
    const r = read(server, { parent: null, query: { where: { field: 'name', op: 'contains', value: 'corn' }, aggregates: [{ field: 'n', type: 'sum' }] } });
    assert.deepEqual(ids(r), ['a', 'a2', 'a21']);
    assert.deepEqual(r.parents, [null, 'a', 'a2']);
    assert.deepEqual(r.depths, [0, 1, 2]);
    assert.deepEqual(r.childCounts, [1, 1, 0], 'childCount counts the filtered children only');
    assert.equal(r.total, 1, 'total counts top-level rows');
    assert.deepEqual(r.aggregates, { n: { sum: 9 } }, 'aggregates over the kept rows of every depth');
    const search = read(server, { parent: null, query: { search: { text: 'n', fields: ['name'], op: 'contains', ignoreCase: true }, sort: [{ field: 'name', dir: 'desc' }] } });
    // Acorn (under a2 under a) and Banana (under b) match; siblings follow the sort.
    assert.deepEqual(ids(search), ['b', 'b1', 'a', 'a2', 'a21']);
    assert.deepEqual(search.parents, [null, 'b', null, 'a', 'a2']);
    assert.deepEqual(search.depths, [0, 1, 0, 1, 2]);
  });

  it('pages filtered and unfiltered tree reads by top-level row', () => {
    const server = handler();
    const p = read(server, { parent: null, query: { page: { offset: 1, limit: 1 } } });
    assert.deepEqual(ids(p), ['b']);
    assert.equal(p.total, 3);
    const f = read(server, { parent: null, query: { where: { field: 'name', op: 'startsWith', value: 'A' }, page: { offset: 0, limit: 1 } } });
    assert.deepEqual(ids(f), ['a', 'a1', 'a2', 'a21'], 'a page carries the whole kept subtree of its rows');
    assert.equal(f.total, 1);
  });

  it('remote aggregates cover every depth of an unfiltered tree read', async () => {
    const source = createJsonDataSource({ transport: handler().transport(), key: 'id', fields: FIELDS });
    const result = await source.read(request(query({ aggregates: [{ columnId: 'n', type: 'sum', placement: ['footer'] }] }), { parentRowId: null }));
    assert.deepEqual(result.aggregates, { n: { sum: 25 } });
    assert.ok(result.performed?.includes('aggregate'));
  });

  it('the JSON source maps tree answers to envelopes with parentId, depth and childCount', async () => {
    const source = createJsonDataSource({ transport: handler().transport(), key: 'id', fields: FIELDS });
    const q = query({ search: { text: 'corn', columnIds: ['name'], operator: 'contains', ignoreCase: true, ignoreAccent: false } });
    const result = (await source.read(request(q, { parentRowId: null }))) as unknown as TreeLoadResult<unknown>;
    assert.deepEqual(
      result.rows.map((e) => [(e.row as unknown[])[0], e.parentId, e.depth, e.hasChildren, e.childCount]),
      [['a', null, 0, true, 1], ['a2', 'a', 1, true, 1], ['a21', 'a2', 2, false, 0]],
    );
    const paged = (await source.read(request(query({ paging: { page: 2, pageSize: 2 } }), { parentRowId: null }))) as unknown as TreeLoadResult<unknown>;
    assert.deepEqual(paged.rows.map((e) => (e.row as unknown[])[0]), ['c'], 'the root level pages like a main read');
    assert.equal(paged.totalRowCount, 3);
    assert.ok(paged.performed?.includes('page'));
  });

  it('writes: added rows join their parent, deleting a parent deletes its subtree, moved rows change parent', async () => {
    const server = handler();
    const source = createJsonDataSource({ transport: server.transport(), key: 'id', fields: FIELDS });
    const signal = new AbortController().signal;
    await source.write({ version: 1, added: [{ tempId: 't', row: ['a3', null, 'Apricot', 1], parentId: 'a' }], changed: [], deleted: [], mode: 'row', signal });
    assert.equal(server.rows().find((r) => r['id'] === 'a3')?.['parent'], 'a', 'the parent travels as wire `parents`');
    await source.write({ version: 2, added: [], changed: [], deleted: [{ rowId: 'a2', row: ['a2', 'a', 'Avocado', 1] }], mode: 'row', signal });
    assert.deepEqual(server.rows().map((r) => r['id']), ['a', 'a1', 'b', 'b1', 'c', 'a3'], 'a21 leaves with a2');
    await source.write({ version: 3, added: [], changed: [], deleted: [], moved: { rowIds: ['b1'], targetRowId: 'a1', position: 'after', parentId: 'a' }, mode: 'row', signal });
    const b1 = server.rows().find((r) => r['id'] === 'b1');
    assert.equal(b1?.['parent'], 'a');
    assert.deepEqual(server.rows().map((r) => r['id']), ['a', 'a1', 'b1', 'b', 'c', 'a3']);
  });
});

type TupleModules = readonly DataGridModule<TupleRow, any, any, string>[];
type TreeApi<Row> = { [K in keyof TreeMethods<Row>]: TreeMethods<Row>[K] extends (ctx: never, ...args: infer A) => infer R ? (...args: A) => R : never };

function visible(engine: { getSnapshot(): { rows: { count: number } }; getRowIdAt(i: number): string | undefined }): string[] {
  const out: string[] = [];
  for (let i = 0; i < engine.getSnapshot().rows.count; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
}

describe('JSON source + reference handler in tree mode', () => {
  const columns: ColumnDef<TupleRow>[] = tupleColumns<ColumnDef<TupleRow>>([{ field: 'id' }, { field: 'name' }, { field: 'n', type: 'number' }], FIELDS);

  function make(server = handler(), down: (req: Obj) => boolean = () => false) {
    const sent: Obj[] = [];
    const transport = server.transport();
    const source = createJsonDataSource<TupleRow>({
      transport: async (req, ctx) => {
        sent.push(req as unknown as Obj);
        if (down(req as unknown as Obj)) return { v: 1, id: (req as { id: string }).id, fields: [], rows: [], error: { code: 'down', message: 'down' } };
        return transport(req, ctx);
      },
      key: 'id',
      fields: FIELDS,
    });
    const getRowId = tupleRowId(FIELDS, 'id');
    const errors: unknown[] = [];
    const remote = createRemoteTree<TupleRow>(source, { getRowId, onError: (e) => errors.push(e) });
    const engine = createDataGridEngine<TupleRow, TupleModules>({
      getRowId,
      columns,
      dataSource: remote.dataSource,
      modules: [createSearchModule<TupleRow>(), createSortModule<TupleRow>(), remote.module()],
      tree: { parentIdField: 'parent', defaultExpanded: false },
    });
    const tree = (engine as unknown as { tree: TreeApi<TupleRow> }).tree;
    return { engine, tree, sent, server, remote, errors };
  }

  it('loads roots, then children on expand, over tuple rows', async () => {
    const { engine, tree, sent } = make();
    await settle();
    assert.deepEqual(visible(engine), ['a', 'b', 'c']);
    assert.equal((sent[0] as { parent?: unknown }).parent, null);
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    assert.equal(tree.getTreeRow('a')?.loadStatus, 'loaded');
    assert.deepEqual(visible(engine), ['a', 'a1', 'a2', 'b', 'c']);
    assert.equal((sent.at(-1) as { parent?: unknown }).parent, 'a');
    assert.equal(tree.getTreeRow('a2')?.hasChildren, true, 'hasChildren from childCounts');
  });

  it('a server search keeps the ancestor chain of lazily loaded trees', async () => {
    const { engine, tree, sent } = make();
    await settle();
    engine.dispatch({ type: 'tree.expandAll' });
    engine.dispatch({ type: 'search.set', text: 'corn' });
    await settle();
    assert.deepEqual((sent.at(-1) as { query: { search?: { text: string } } }).query.search?.text, 'corn');
    assert.deepEqual(visible(engine), ['a', 'a2', 'a21']);
    assert.equal(tree.getTreeRow('a21')?.depth, 2);
    engine.dispatch({ type: 'search.clear' });
    await settle();
    assert.deepEqual(visible(engine).slice(0, 1), ['a']);
  });

  it('a failed child load surfaces as a treeChildren error and retries', async () => {
    let fail = true;
    const { engine, tree, errors } = make(handler(), (req) => fail && req['parent'] === 'b');
    await settle();
    engine.dispatch({ type: 'tree.expand', rowId: 'b' });
    await settle();
    assert.equal(tree.getTreeRow('b')?.loadStatus, 'error');
    assert.equal((errors[0] as { action: string }).action, 'treeChildren');
    fail = false;
    engine.dispatch({ type: 'tree.retry', rowId: 'b' });
    await settle();
    assert.deepEqual(visible(engine), ['a', 'b', 'b1', 'c']);
  });
});

interface Node {
  readonly id: string;
  readonly parent: string | null;
  readonly name: string;
  readonly n: number;
  readonly children?: Node[];
}
type NodeModules = readonly DataGridModule<Node, any, any, string>[];
const nodeColumns: ColumnDef<Node>[] = [{ field: 'id' }, { field: 'name' }, { field: 'n', type: 'number' }];

describe('offline source in tree mode', () => {
  it('loads flat rows once, then expands, filters and sorts the tree locally', async () => {
    let loads = 0;
    const source = createOfflineDataSource<Node>({ load: async () => (loads++, nodes() as unknown as Node[]) });
    const engine = createDataGridEngine<Node, NodeModules>({
      getRowId: (r) => r.id,
      columns: nodeColumns,
      dataSource: source,
      modules: [createFilterModule<Node>(), createSortModule<Node>(), createTreeModule<Node>()],
      tree: { parentIdField: 'parent' },
    });
    await settle();
    assert.equal(source.status, 'ready');
    assert.deepEqual(visible(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    engine.dispatch({ type: 'filter.set', filters: [{ columnId: 'name', operator: 'contains', value: 'corn' }] });
    assert.deepEqual(visible(engine), ['a', 'a2', 'a21'], 'local ancestors filter');
    engine.dispatch({ type: 'filter.clear' });
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'name', direction: 'desc' }] });
    assert.deepEqual(visible(engine), ['c', 'b', 'b1', 'a', 'a2', 'a21', 'a1']);
    assert.equal(loads, 1);
  });

  it('nested rows load through flattenTree', async () => {
    const nested: Node[] = [
      { id: 'a', parent: null, name: 'Alpha', n: 1, children: [{ id: 'a1', parent: null, name: 'Apple', n: 1 }] },
      { id: 'b', parent: null, name: 'Beta', n: 1 },
    ];
    const source = createOfflineDataSource<Node>({ load: async () => flattenTree(nested, 'children') });
    const engine = createDataGridEngine<Node, NodeModules>({ getRowId: (r) => r.id, columns: nodeColumns, dataSource: source, modules: [createTreeModule<Node>()], tree: true });
    await settle();
    assert.deepEqual(visible(engine), ['a', 'a1', 'b']);
  });
});

describe('controlled source in tree mode', () => {
  function serve(requests: DataSourceRequest[], nested = false) {
    const all = nodes() as unknown as Node[];
    return createControlledDataSource<Node>({
      onQueryChange(req) {
        requests.push(req);
        const parent = req.parentRowId ?? null;
        const kids = (p: string): Node[] => all.filter((r) => r.parent === p);
        let level = all.filter((r) => r.parent === parent);
        const total = level.length;
        if (req.query.paging) level = level.slice((req.query.paging.page - 1) * req.query.paging.pageSize, req.query.paging.page * req.query.paging.pageSize);
        const env = (r: Node): RemoteTreeEnvelope<Node> =>
          nested ? { kind: 'tree', row: r, parentId: r.parent, children: kids(r.id).map(env) } : { kind: 'tree', row: r, parentId: r.parent, hasChildren: kids(r.id).length > 0 };
        return { version: req.version, rows: level.map(env) as unknown as Node[], totalRowCount: total };
      },
    });
  }

  function make(source: ReturnType<typeof serve>, pageBy: 'all' | 'root') {
    const remote = createRemoteTree<Node>(source, { getRowId: (r) => r.id });
    const engine = createDataGridEngine<Node, NodeModules>({
      getRowId: (r) => r.id,
      columns: nodeColumns,
      dataSource: remote.dataSource,
      modules: [createPagingModule<Node>(), remote.module()],
      tree: { parentIdField: 'parent', defaultExpanded: false, pageBy },
      paging: { pageSize: 2 },
    });
    return engine;
  }

  it("receives request.parentRowId for root and child reads with pageBy 'root'", async () => {
    const requests: DataSourceRequest[] = [];
    const engine = make(serve(requests), 'root');
    await settle();
    assert.equal(requests[0]?.parentRowId, null);
    assert.deepEqual(requests[0]?.query.paging, { page: 1, pageSize: 2 }, 'the application pages the roots');
    assert.deepEqual(visible(engine), ['a', 'b']);
    engine.dispatch({ type: 'tree.expand', rowId: 'b' });
    await settle();
    assert.equal(requests.at(-1)?.parentRowId, 'b');
    assert.deepEqual(visible(engine), ['a', 'b', 'b1']);
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    await settle();
    assert.deepEqual(visible(engine), ['c']);
  });

  it("with pageBy 'all' reads every root and the grid pages the visible rows", async () => {
    const requests: DataSourceRequest[] = [];
    const engine = make(serve(requests), 'all');
    await settle();
    assert.equal(requests[0]?.query.paging, null);
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    assert.equal(requests.at(-1)?.parentRowId, 'a');
    assert.deepEqual(visible(engine), ['a', 'a1']);
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    await settle();
    assert.deepEqual(visible(engine), ['a2', 'b']);
  });

  it('accepts nested envelopes from the application (load all, remote nested data)', async () => {
    const requests: DataSourceRequest[] = [];
    const engine = make(serve(requests, true), 'all');
    engine.dispatch({ type: 'paging.setEnabled', enabled: false });
    await settle();
    engine.dispatch({ type: 'tree.expandAll' });
    await settle();
    assert.deepEqual(visible(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    assert.ok(requests.every((r) => r.parentRowId === null), 'no child reads');
  });
});
