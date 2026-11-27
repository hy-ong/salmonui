// Remote tree data and child loading over a fake remote source.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDataGridEngine,
  createPagingModule,
  createSearchModule,
  createSortModule,
  type ColumnDef,
  type DataSource,
  type DataGridModule,
  type DataSourceRequest,
  type DataSourceResult,
  type WriteRequest,
  type WriteResult,
} from '@salmonui/data-grid/engine';
import { type TreeMethods, type TreeOptions } from '@salmonui/data-grid/engine/tree';
import { createRemoteTree, type RemoteTreeEnvelope, type RemoteTreeError } from '@salmonui/data-grid/engine/tree-remote';

interface Node {
  readonly id: string;
  readonly name: string;
  readonly n: number;
  readonly parentId: string | null;
}

const columns: ColumnDef<Node>[] = [{ field: 'id', primaryKey: true }, { field: 'name' }, { field: 'n', type: 'number' }];

/** a [a1, a2 [a21]], b [b1], c */
function data(): Node[] {
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

interface Deferred {
  resolve(): void;
  reject(error: unknown): void;
}

/**
 * In-memory tree server: `parentRowId` reads one level (sorted by the query),
 * or with a search every match with its ancestor chain as flat envelopes;
 * `nested: true` answers the root read with the whole tree as nested envelopes.
 */
function fakeSource(rows: Node[] = data(), opts: { nested?: boolean; manual?: boolean; fail?: Set<string> } = {}) {
  const requests: DataSourceRequest[] = [];
  const held: Deferred[] = [];
  const writes: WriteRequest<Node>[] = [];
  let store = rows.slice();
  const childrenOf = (p: string | null, keep: Set<string> | null, sort: 'asc' | 'desc' | null): Node[] => {
    const list = store.filter((r) => r.parentId === p && (keep === null || keep.has(r.id)));
    return sort ? list.slice().sort((x, y) => (sort === 'desc' ? -1 : 1) * x.name.localeCompare(y.name)) : list;
  };
  const answer = (request: DataSourceRequest): DataSourceResult<unknown> => {
    const q = request.query;
    const sort = q.sorting[0]?.direction ?? null;
    const text = q.search?.text ?? '';
    let keep: Set<string> | null = null;
    if (text) {
      keep = new Set();
      const byId = new Map(store.map((r) => [r.id, r]));
      for (const r of store) {
        if (!r.name.toLowerCase().includes(text.toLowerCase())) continue;
        for (let x: Node | undefined = r; x && !keep.has(x.id); x = x.parentId ? byId.get(x.parentId) : undefined) keep.add(x.id);
      }
    }
    const kept = keep;
    const env = (r: Node, depth: number): RemoteTreeEnvelope<Node> => {
      const kids = childrenOf(r.id, kept, sort);
      return { kind: 'tree', row: r, depth, parentId: r.parentId, hasChildren: kids.length > 0, childCount: kids.length };
    };
    const parent = request.parentRowId ?? null;
    let level = childrenOf(parent, kept, sort);
    const total = level.length;
    if (q.paging) level = level.slice((q.paging.page - 1) * q.paging.pageSize, q.paging.page * q.paging.pageSize);
    const items: RemoteTreeEnvelope<Node>[] = [];
    if (opts.nested && parent === null) {
      const nest = (r: Node, depth: number): RemoteTreeEnvelope<Node> => ({ kind: 'tree', row: r, depth, parentId: r.parentId, hasChildren: true, children: childrenOf(r.id, kept, sort).map((c) => nest(c, depth + 1)) });
      for (const r of level) items.push(nest(r, 0));
    } else if (kept) {
      // Ancestor chains: the kept subtree of every top-level row, flat in pre-order.
      const visit = (r: Node, depth: number): void => {
        items.push(env(r, depth));
        for (const c of childrenOf(r.id, kept, sort)) visit(c, depth + 1);
      };
      for (const r of level) visit(r, 0);
    } else for (const r of level) items.push(env(r, 0));
    const sum = (kept ? store.filter((r) => kept.has(r.id)) : store).reduce((s, r) => s + r.n, 0);
    return { version: request.version, rows: items as unknown as Node[], totalRowCount: total, aggregates: { n: { sum } }, performed: ['search', 'filter', 'sort', 'aggregate', ...(q.paging ? (['page'] as const) : [])] };
  };
  const source: DataSource<Node> = {
    mode: 'remote',
    capabilities: { treeChildren: true, write: true },
    read(request) {
      requests.push(request);
      const result = answer(request);
      if (!opts.manual && !(request.parentRowId && opts.fail?.has(request.parentRowId))) return Promise.resolve(result as DataSourceResult<Node>);
      return new Promise<DataSourceResult<Node>>((resolve, reject) => {
        const fail = request.parentRowId ? opts.fail?.has(request.parentRowId) : false;
        const d: Deferred = { resolve: () => (fail ? reject(new Error(`boom ${request.parentRowId}`)) : resolve(result as DataSourceResult<Node>)), reject };
        request.signal.addEventListener('abort', () => {
          const at = held.indexOf(d);
          if (at >= 0) held.splice(at, 1);
          reject(request.signal.reason ?? new Error('aborted'));
        });
        if (opts.manual) held.push(d);
        else d.resolve();
      });
    },
    async write(request): Promise<WriteResult<Node>> {
      writes.push(request);
      const deleted = new Set(request.deleted.map((d) => d.rowId));
      store = store.filter((r) => !deleted.has(r.id));
      for (const a of request.added) store.push({ ...a.row, parentId: a.parentId ?? null });
      return { version: request.version, status: 'applied', added: request.added.map((a) => ({ tempId: a.tempId, row: { ...a.row, parentId: a.parentId ?? null } })) };
    },
  };
  return { source, requests, held, writes, rows: () => store };
}

type Modules = readonly DataGridModule<Node, any, any, string>[];

function make(src: DataSource<Node>, tree: TreeOptions<Node> = {}, extra: Record<string, unknown> = {}, errors: RemoteTreeError[] = []) {
  const remote = createRemoteTree<Node>(src, { getRowId: (r) => r.id, onError: (e) => errors.push(e) });
  const engine = createDataGridEngine<Node, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: remote.dataSource,
    modules: [createSearchModule<Node>(), createSortModule<Node>(), createPagingModule<Node>(), remote.module()],
    tree: { parentIdField: 'parentId', defaultExpanded: false, ...tree },
    ...extra,
  });
  const api = (engine as unknown as { tree: { [K in keyof TreeMethods<Node>]: TreeMethods<Node>[K] extends (ctx: never, ...args: infer A) => infer R ? (...args: A) => R : never } }).tree;
  return { engine, tree: api, remote, errors };
}

type Engine = ReturnType<typeof make>['engine'];

function visibleIds(engine: Engine): string[] {
  const out: string[] = [];
  for (let i = 0; i < engine.getSnapshot().rows.count; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('remote tree: load on demand', () => {
  it('reads the roots, loads children on expand once, and caches them per parent', async () => {
    const fake = fakeSource();
    const { engine, tree } = make(fake.source);
    await settle();
    assert.deepEqual(fake.requests.map((r) => r.parentRowId), [null], 'the root read is a tree read of the root level');
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'c']);
    assert.equal(tree.getTreeRow('a')?.hasChildren, true, 'hasChildren comes from the envelope');
    assert.equal(tree.getTreeRow('c')?.hasChildren, false);
    assert.equal(tree.getTreeRow('a')?.loadStatus, 'idle');
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await Promise.resolve();
    assert.equal(tree.getTreeRow('a')?.loadStatus, 'loading');
    await settle();
    assert.equal(tree.getTreeRow('a')?.loadStatus, 'loaded');
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'c']);
    assert.equal(tree.getTreeRow('a2')?.parentId, 'a');
    assert.equal(tree.getTreeRow('a2')?.depth, 1);
    assert.equal(tree.getTreeRow('a2')?.hasChildren, true);
    engine.dispatch({ type: 'tree.expand', rowId: 'a2' });
    await settle();
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'c']);
    engine.dispatch({ type: 'tree.collapse', rowId: 'a' });
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    assert.deepEqual(fake.requests.map((r) => r.parentRowId), [null, 'a', 'a2'], 'loaded children are cached');
    assert.equal(engine.getSnapshot().data.status, 'ready');
  });

  it('works with tuple-like rows that do not carry the parent field', async () => {
    const fake = fakeSource();
    const plain = {
      ...fake.source,
      read: (request: DataSourceRequest) =>
        Promise.resolve(fake.source.read(request)).then((r) => ({
          ...r,
          rows: (r.rows as unknown as RemoteTreeEnvelope<Node>[]).map((e) => ({ ...e, row: { id: e.row.id, name: e.row.name, n: e.row.n } as unknown as Node })) as unknown as Node[],
        })),
    };
    const { engine, tree } = make(plain);
    await settle();
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'c']);
    assert.equal(tree.getTreeRow('a1')?.parentId, 'a');
  });

  it('a failed load reports treeChildren, sets loadStatus error, and tree.retry loads again', async () => {
    const fail = new Set(['b']);
    const fake = fakeSource(data(), { fail });
    const { engine, tree, remote, errors } = make(fake.source);
    await settle();
    engine.dispatch({ type: 'tree.expand', rowId: 'b' });
    await settle();
    assert.equal(tree.getTreeRow('b')?.loadStatus, 'error');
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.action, 'treeChildren');
    assert.equal(errors[0]?.rowId, 'b');
    assert.match(String((remote.getLoadError('b') as Error).message), /boom b/);
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'c']);
    fail.clear();
    assert.equal(engine.dispatch({ type: 'tree.retry', rowId: 'b' }).status, 'applied');
    await settle();
    assert.equal(tree.getTreeRow('b')?.loadStatus, 'loaded');
    assert.equal(remote.getLoadError('b'), undefined);
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'b1', 'c']);
    assert.equal(errors.length, 1, 'a successful retry reports nothing');
  });

  it('sends the query with child reads; a query change aborts in-flight child loads and re-reads expanded parents', async () => {
    const fake = fakeSource(data(), { manual: true });
    const { engine, tree } = make(fake.source);
    fake.held.shift()?.resolve();
    await settle();
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'name', direction: 'desc' }] });
    fake.held.shift()?.resolve();
    await settle();
    assert.deepEqual(visibleIds(engine), ['c', 'b', 'a'], 'the server sorted the roots');
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    const childRead = fake.requests.at(-1) as DataSourceRequest;
    assert.equal(childRead.parentRowId, 'a');
    assert.deepEqual(childRead.query.sorting.map((s) => s.columnId), ['name'], 'the query travels with child reads');
    fake.held.shift()?.resolve();
    await settle();
    assert.equal(tree.getTreeRow('a')?.loadStatus, 'loaded');
    // Expand b, then change the query before its children arrive.
    engine.dispatch({ type: 'tree.expand', rowId: 'b' });
    await settle();
    const bRead = fake.requests.at(-1) as DataSourceRequest;
    assert.equal(bRead.parentRowId, 'b');
    engine.dispatch({ type: 'sort.clear' });
    await settle();
    assert.equal(bRead.signal.aborted, true, 'the superseded child load is aborted');
    assert.equal(tree.getTreeRow('b')?.loadStatus, 'idle');
    // Root read of the new query, then the expanded loaded parent `a` is read again.
    fake.held.shift()?.resolve();
    await settle();
    const again = fake.requests.at(-1) as DataSourceRequest;
    assert.equal(again.parentRowId, 'a');
    assert.deepEqual(again.query.sorting, []);
    fake.held.shift()?.resolve();
    await settle();
    assert.equal(tree.getTreeRow('a')?.loadStatus, 'loaded');
    assert.equal(tree.getTreeRow('b')?.loadStatus, 'idle');
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'c']);
  });

  it('refresh() drops cached children (invalidate) and reloads the expanded ones', async () => {
    const fake = fakeSource();
    const { engine } = make(fake.source);
    await settle();
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    const before = fake.requests.length;
    engine.refresh();
    await settle();
    assert.deepEqual(fake.requests.slice(before).map((r) => r.parentRowId), [null, 'a']);
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'c']);
  });
});

describe('remote tree: nested envelopes and server filtering', () => {
  it('a root read with nested children populates the whole tree without child reads', async () => {
    const fake = fakeSource(data(), { nested: true });
    const { engine, tree } = make(fake.source, { defaultExpanded: true });
    await settle();
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'b', 'b1', 'c']);
    assert.equal(tree.getTreeRow('a21')?.depth, 2);
    assert.equal(tree.getTreeRow('a1')?.hasChildren, false, 'an empty children array is a leaf');
    engine.dispatch({ type: 'tree.collapseAll' });
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    assert.deepEqual(fake.requests.map((r) => r.parentRowId), [null]);
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'b', 'c']);
  });

  it('a server search returns matches with their ancestor chain; remote aggregates pass through', async () => {
    const fake = fakeSource();
    const { engine, tree } = make(fake.source, { defaultExpanded: true });
    await settle();
    assert.deepEqual(engine.getSnapshot().data.aggregates, { n: { sum: 25 } });
    engine.dispatch({ type: 'search.set', text: 'corn' });
    await settle();
    assert.equal(fake.requests.at(-1)?.query.search?.text, 'corn');
    assert.deepEqual(visibleIds(engine), ['a', 'a2', 'a21'], 'Acorn with its ancestors a and a2');
    assert.equal(tree.getTreeRow('a21')?.depth, 2);
    assert.equal(tree.getTreeRow('a')?.childCount, 1, 'childCount counts the filtered children');
    assert.deepEqual(engine.getSnapshot().data.aggregates, { n: { sum: 9 } }, 'aggregates over the kept rows of every depth');
    assert.equal(fake.requests.length, 2, 'no child reads: the chain is complete');
  });
});

describe('remote tree: paging ( core half)', () => {
  it("pageBy 'root' sends the paging to the server; pageBy 'all' reads every root and pages locally", async () => {
    const rootFake = fakeSource();
    const byRoot = make(rootFake.source, { pageBy: 'root' }, { paging: { pageSize: 2 } });
    await settle();
    assert.deepEqual(rootFake.requests[0]?.query.paging, { page: 1, pageSize: 2 });
    assert.deepEqual(visibleIds(byRoot.engine), ['a', 'b']);
    assert.equal(byRoot.engine.getSnapshot().data.totalRowCount, 3);
    byRoot.engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    assert.deepEqual(visibleIds(byRoot.engine), ['a', 'a1', 'a2', 'b'], 'a root page carries its loaded subtree');
    assert.equal(rootFake.requests.at(-1)?.query.paging, null, 'child reads are not paged');
    byRoot.engine.dispatch({ type: 'paging.goToPage', page: 2 });
    await settle();
    assert.deepEqual(visibleIds(byRoot.engine), ['c']);
    byRoot.engine.dispatch({ type: 'paging.goToPage', page: 1 });
    await settle();
    assert.deepEqual(visibleIds(byRoot.engine), ['a', 'a1', 'a2', 'b'], 'cached children come back with their page');
    assert.equal(rootFake.requests.filter((r) => r.parentRowId === 'a').length, 1);

    const allFake = fakeSource();
    const byAll = make(allFake.source, { pageBy: 'all' }, { paging: { pageSize: 2 } });
    await settle();
    assert.equal(allFake.requests[0]?.query.paging, null, "pageBy 'all' reads every root");
    assert.deepEqual(visibleIds(byAll.engine), ['a', 'b']);
    byAll.engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    assert.deepEqual(visibleIds(byAll.engine), ['a', 'a1'], 'visible rows are paged locally');
    byAll.engine.dispatch({ type: 'paging.goToPage', page: 2 });
    await settle();
    assert.deepEqual(visibleIds(byAll.engine), ['a2', 'b']);
    assert.equal(allFake.requests.filter((r) => r.parentRowId === null).length, 1, 'a page change re-uses the root answer');
  });
});

describe('remote tree: writes ( data halves)', () => {
  it('an added row joins its loaded parent; deleting a parent removes its subtree', async () => {
    const fake = fakeSource();
    const { engine, remote } = make(fake.source, { defaultExpanded: true });
    await settle();
    engine.dispatch({ type: 'tree.expand', rowId: 'a' });
    await settle();
    engine.dispatch({ type: 'tree.expand', rowId: 'a2' });
    await settle();
    const write = remote.dataSource.write as NonNullable<DataSource<Node>['write']>;
    const signal = new AbortController().signal;
    await write({ version: 1, added: [{ tempId: 't1', row: { id: 'a3', name: 'Apricot', n: 1, parentId: 'a' }, parentId: 'a' }], changed: [], deleted: [], mode: 'row', signal });
    await settle();
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a2', 'a21', 'a3', 'b', 'c']);
    assert.equal(fake.writes[0]?.added[0]?.parentId, 'a');
    const rows = data();
    await write({ version: 2, added: [], changed: [], deleted: [{ rowId: 'a2', row: rows[2] as Node }, { rowId: 'a21', row: rows[3] as Node }], mode: 'row', signal });
    await settle();
    assert.deepEqual(visibleIds(engine), ['a', 'a1', 'a3', 'b', 'c']);
    await write({ version: 3, added: [], changed: [], deleted: [{ rowId: 'a', row: rows[0] as Node }], mode: 'row', signal });
    await settle();
    assert.deepEqual(visibleIds(engine), ['b', 'c'], 'the loaded subtree leaves with its parent');
  });

  it('a row added under an unloaded lazy parent waits for the load and marks the parent as having children', async () => {
    const fake = fakeSource();
    const { engine, tree, remote } = make(fake.source);
    await settle();
    const write = remote.dataSource.write as NonNullable<DataSource<Node>['write']>;
    await write({ version: 1, added: [{ tempId: 't1', row: { id: 'c1', name: 'Cherry', n: 1, parentId: 'c' }, parentId: 'c' }], changed: [], deleted: [], mode: 'row', signal: new AbortController().signal });
    await settle();
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'c']);
    assert.equal(tree.getTreeRow('c')?.hasChildren, true);
    engine.dispatch({ type: 'tree.expand', rowId: 'c' });
    await settle();
    assert.deepEqual(visibleIds(engine), ['a', 'b', 'c', 'c1']);
  });
});
