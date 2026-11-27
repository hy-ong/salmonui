// Infinite scroll in tree mode: `createRemoteTree(source, { rootBlocks })`
// reads the root rows in blocks (`range` over the root level, `parentRowId:
// null`), children load on expand, and the tree view covers the loaded roots.
// Collapsed initial state, expansion, id-based selection and editing work
// across block loads.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDataGridEngine,
  createFocusModule,
  createSearchModule,
  createSelectionApi,
  createSelectionModule,
  createSortModule,
  type ColumnDef,
  type DataSource,
  type DataGridModule,
  type DataSourceRequest,
  type DataSourceResult,
  type WriteRequest,
  type WriteResult,
} from '@salmonui/data-grid/engine';
import { createEditModule } from '@salmonui/data-grid/engine/edit';
import { type TreeMethods, type TreeOptions } from '@salmonui/data-grid/engine/tree';
import { createRemoteTree, type RemoteTreeEnvelope } from '@salmonui/data-grid/engine/tree-remote';

interface Node {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

const columns: ColumnDef<Node>[] = [{ field: 'id', primaryKey: true }, { field: 'name' }];

/** `roots` roots r0.. with two children each (rN-0, rN-1). */
function data(roots: number): Node[] {
  const out: Node[] = [];
  for (let i = 0; i < roots; i++) {
    out.push({ id: `r${i}`, name: `Root ${String(i).padStart(3, '0')}`, parentId: null });
    for (let k = 0; k < 2; k++) out.push({ id: `r${i}-${k}`, name: `Child ${i}.${k}`, parentId: `r${i}` });
  }
  return out;
}

/** Tree server: one level per read; the root level honours `range`; `total: false` leaves the count out. */
function fakeSource(rows: Node[], opts: { total?: boolean; manual?: boolean } = {}) {
  const requests: DataSourceRequest[] = [];
  const held: (() => void)[] = [];
  const writes: WriteRequest<Node>[] = [];
  let store = rows.slice();
  const answer = (request: DataSourceRequest): DataSourceResult<Node> => {
    const parent = request.parentRowId ?? null;
    const desc = request.query.sorting[0]?.direction === 'desc';
    let level = store.filter((r) => r.parentId === parent);
    if (desc) level = level.slice().reverse();
    const total = level.length;
    if (request.range) level = level.slice(request.range.start, request.range.end);
    const items: RemoteTreeEnvelope<Node>[] = level.map((r) => {
      const n = store.filter((c) => c.parentId === r.id).length;
      return { kind: 'tree', row: r, parentId: r.parentId, hasChildren: n > 0, childCount: n };
    });
    return { version: request.version, rows: items as unknown as Node[], ...(opts.total === false ? {} : { totalRowCount: total }) };
  };
  const source: DataSource<Node> = {
    mode: 'remote',
    capabilities: { treeChildren: true, write: true },
    read(request) {
      requests.push(request);
      const result = answer(request);
      if (!opts.manual) return Promise.resolve(result);
      return new Promise((resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(request.signal.reason));
        held.push(() => resolve(result));
      });
    },
    async write(request): Promise<WriteResult<Node>> {
      writes.push(request);
      for (const c of request.changed) store = store.map((r) => (r.id === c.rowId ? c.row : r));
      return { version: request.version, status: 'applied', changed: request.changed.map((c) => ({ rowId: c.rowId, row: c.row })) };
    },
  };
  return { source, requests, held, writes };
}

type Modules = readonly DataGridModule<Node, any, any, string>[];

function make(src: DataSource<Node>, tree: TreeOptions<Node> = {}, blocks = { blockSize: 10, initialBlocks: 2 }) {
  const remote = createRemoteTree<Node>(src, { getRowId: (r) => r.id, rootBlocks: blocks });
  const engine = createDataGridEngine<Node, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: remote.dataSource,
    modules: [createSearchModule<Node>(), createSortModule<Node>(), createSelectionModule<Node>(), createFocusModule<Node>(), createEditModule<Node>(), remote.module()],
    selection: { type: 'multiple' },
    tree: { parentIdField: 'parentId', ...tree },
  });
  const api = (engine as unknown as { tree: { [K in keyof TreeMethods<Node>]: TreeMethods<Node>[K] extends (ctx: never, ...args: infer A) => infer R ? (...args: A) => R : never } }).tree;
  return { engine, tree: api, remote, selection: createSelectionApi(engine) };
}

type Engine = ReturnType<typeof make>['engine'];

function visibleIds(engine: Engine): string[] {
  const out: string[] = [];
  for (let i = 0; i < engine.getSnapshot().rows.count; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const rootReads = (requests: readonly DataSourceRequest[]) => requests.filter((r) => r.parentRowId === null).map((r) => r.range);

describe('tree infinite scroll: root blocks', () => {
  it('reads the initial root blocks, then one block per loadMoreRoots until the end', async () => {
    const fake = fakeSource(data(45));
    const { engine, remote } = make(fake.source);
    await settle();
    assert.deepEqual(rootReads(fake.requests), [{ start: 0, end: 20 }], 'the first read takes initialBlocks blocks of root rows');
    assert.equal(engine.getSnapshot().rows.count, 20, 'the view covers the loaded roots (collapsed)');
    assert.deepEqual(remote.getRootBlocks(), { loadedRoots: 20, hasMore: true, loading: false });
    const loading = remote.loadMoreRoots();
    assert.equal(remote.getRootBlocks().loading, true);
    assert.equal(await remote.loadMoreRoots(), false, 'one block read at a time');
    assert.equal(await loading, true);
    await settle();
    assert.deepEqual(rootReads(fake.requests).at(-1), { start: 20, end: 30 });
    assert.equal(engine.getSnapshot().rows.count, 30);
    assert.deepEqual(visibleIds(engine).slice(18, 22), ['r18', 'r19', 'r20', 'r21']);
    await remote.loadMoreRoots();
    await remote.loadMoreRoots();
    await settle();
    assert.equal(engine.getSnapshot().rows.count, 45);
    assert.deepEqual(remote.getRootBlocks(), { loadedRoots: 45, hasMore: false, loading: false }, 'the total ends the roots');
    const reads = fake.requests.length;
    assert.equal(await remote.loadMoreRoots(), false);
    assert.equal(fake.requests.length, reads, 'nothing is read past the end');
    assert.equal(engine.getSnapshot().data.status, 'ready');
  });

  it('without a total a short block ends the roots', async () => {
    const fake = fakeSource(data(25), { total: false });
    const { engine, remote } = make(fake.source);
    await settle();
    assert.equal(remote.getRootBlocks().hasMore, true);
    assert.equal(await remote.loadMoreRoots(), true);
    await settle();
    assert.equal(engine.getSnapshot().rows.count, 25);
    assert.equal(remote.getRootBlocks().hasMore, false);
  });

  it('a query change drops the block read in flight and starts again from the first blocks', async () => {
    const fake = fakeSource(data(45), { manual: true });
    const { engine, remote } = make(fake.source);
    fake.held.shift()?.();
    await settle();
    const more = remote.loadMoreRoots();
    await settle();
    const blockRead = fake.requests.at(-1) as DataSourceRequest;
    assert.deepEqual(blockRead.range, { start: 20, end: 30 });
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'name', direction: 'desc' }] });
    await settle();
    // The block answers after the new root read started: its rows are dropped.
    fake.held.splice(0).forEach((resolve) => resolve());
    assert.equal(await more, false, 'the superseded block is dropped');
    await settle();
    assert.deepEqual(rootReads(fake.requests).at(-1), { start: 0, end: 20 });
    assert.deepEqual(visibleIds(engine).slice(0, 2), ['r44', 'r43'], 'the new query reads its first blocks');
    assert.deepEqual(remote.getRootBlocks(), { loadedRoots: 20, hasMore: true, loading: false });
  });
});

describe('tree infinite scroll: lifted limitations', () => {
  it('collapsed initial state: roots only; expansion and loaded children survive block loads', async () => {
    const fake = fakeSource(data(30));
    const { engine, tree, remote } = make(fake.source, { defaultExpanded: false });
    await settle();
    assert.equal(tree.getTreeRow('r0')?.expanded, false, 'roots start collapsed');
    assert.equal(tree.getTreeRow('r0')?.hasChildren, true);
    engine.dispatch({ type: 'tree.expand', rowId: 'r1' });
    await settle();
    assert.deepEqual(visibleIds(engine).slice(0, 5), ['r0', 'r1', 'r1-0', 'r1-1', 'r2']);
    await remote.loadMoreRoots();
    await settle();
    assert.equal(engine.getSnapshot().rows.count, 32);
    assert.deepEqual(visibleIds(engine).slice(0, 5), ['r0', 'r1', 'r1-0', 'r1-1', 'r2'], 'the expanded parent keeps its children');
    assert.deepEqual(visibleIds(engine).slice(-2), ['r28', 'r29'], 'the next block lands after the loaded roots');
    assert.equal(tree.getTreeRow('r1')?.expanded, true);
    assert.equal(tree.getTreeRow('r25')?.expanded, false, 'roots of a later block start collapsed too');
    engine.dispatch({ type: 'tree.expand', rowId: 'r25' });
    await settle();
    assert.equal(tree.getTreeRow('r25')?.loadStatus, 'loaded');
    const at = visibleIds(engine).indexOf('r25');
    assert.deepEqual(visibleIds(engine).slice(at, at + 3), ['r25', 'r25-0', 'r25-1']);
    // A re-read of the same query (expansion) keeps every loaded block.
    assert.equal(fake.requests.filter((r) => r.parentRowId === null).length, 2);
  });

  it('id-based selection survives block loads and selects rows of later blocks', async () => {
    const fake = fakeSource(data(30));
    const { engine, remote, selection } = make(fake.source);
    await settle();
    assert.equal(engine.dispatch({ type: 'selection.selectRows', rowIds: ['r3', 'r15'] }).status, 'applied');
    await remote.loadMoreRoots();
    await settle();
    assert.deepEqual([...selection.getSelectedRowIds()].sort(), ['r15', 'r3'], 'the selection is kept by id');
    assert.equal(engine.dispatch({ type: 'selection.selectRows', rowIds: ['r27'], mode: 'add' }).status, 'applied');
    assert.deepEqual([...selection.getSelectedRowIds()].sort(), ['r15', 'r27', 'r3']);
  });

  it('edits a row of a later block; the write echo patches it in place', async () => {
    const fake = fakeSource(data(30));
    const { engine, remote } = make(fake.source);
    await settle();
    await remote.loadMoreRoots();
    await settle();
    assert.equal(engine.dispatch({ type: 'edit.start', rowId: 'r24', columnId: 'name' }).status, 'applied');
    engine.dispatch({ type: 'edit.setValue', rowId: 'r24', columnId: 'name', value: 'Renamed' });
    assert.equal(engine.dispatch({ type: 'edit.commit' }).status, 'applied');
    await settle();
    await settle();
    assert.equal(fake.writes.length, 1);
    assert.equal(fake.writes[0]?.changed[0]?.rowId, 'r24');
    assert.equal(engine.getRow('r24')?.name, 'Renamed');
    assert.equal(engine.getSnapshot().rows.count, 30, 'no block is lost');
    assert.equal(visibleIds(engine).indexOf('r24'), 24);
    assert.equal(await remote.loadMoreRoots(), false, 'the end is known');
  });
});
