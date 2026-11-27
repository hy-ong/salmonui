// Scroll-driven lazy group loading: `lazyGroupsToAppend`
// picks the expanded lazy groups whose loaded content ends inside (or
// `threshold` rows below) the rendered window, and a renderer loop that
// dispatches `grouping.loadMore` for them appends group children as the
// window moves down, over a fake lazy-group remote source.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDataGridEngine,
  createGroupingModule,
  createSortModule,
  type ColumnDef,
  type DataSourceRequest,
  type DataSourceResult,
  type DataSource,
  type DataGridModule,
  type GroupedRowEnvelope,
  type GroupRowSnapshot,
} from '@salmonui/data-grid/engine';
import { createInfiniteScrollModule, lazyGroupsToAppend } from '@salmonui/data-grid/engine/infinite';

interface Item {
  readonly id: string;
  readonly team: string;
  readonly region: string;
}

const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'team' }, { field: 'region' }];

function items(n: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < n; i++) out.push({ id: `r${i}`, team: i % 4 === 0 ? 'a' : 'b', region: i % 3 === 0 ? 'East' : 'West' });
  return out;
}

function lazyRemote(rows: readonly Item[]) {
  const requests: DataSourceRequest[] = [];
  const pending: (() => void)[] = [];
  const source: DataSource<Item> = {
    mode: 'remote',
    capabilities: { lazyGroups: true, infinite: true },
    read(request: DataSourceRequest): Promise<DataSourceResult<Item>> {
      requests.push(request);
      return new Promise((resolve) => {
        pending.push(() => {
          const path = request.groupPath ?? [];
          const match = rows.filter((r) => path.every((s) => r[s.columnId as keyof Item] === s.key));
          const grouping = request.query.grouping;
          if (path.length < grouping.length) {
            const columnId = (grouping[path.length] as { columnId: string }).columnId;
            const keys = [...new Set(match.map((r) => r[columnId as keyof Item]))].sort();
            const envelopes: GroupedRowEnvelope<Item>[] = keys.map((key) => ({
              kind: 'group',
              key,
              columnId,
              groupPath: [...path, { columnId, key }],
              count: match.filter((r) => r[columnId as keyof Item] === key).length,
            }));
            const range = request.range ?? { start: 0, end: envelopes.length };
            resolve({ version: request.version, rows: envelopes.slice(range.start, range.end) as unknown as Item[], totalRowCount: envelopes.length, performed: ['sort', 'group'] });
            return;
          }
          const range = request.range ?? { start: 0, end: match.length };
          resolve({ version: request.version, rows: match.slice(range.start, range.end), totalRowCount: match.length, pageInfo: { hasNextPage: range.end < match.length } });
        });
      });
    },
  };
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) {
      while (pending.length) (pending.shift() as () => void)();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { source, requests, flush };
}

function setup(rows: readonly Item[], grouping: readonly string[], chunk = 10) {
  const remote = lazyRemote(rows);
  const modules = [createSortModule<Item>(), createGroupingModule<Item>(), createInfiniteScrollModule<Item>({ blockSize: 20 })] as DataGridModule<Item, any, any>[];
  const engine = createDataGridEngine<Item, DataGridModule<Item, any, any>[]>({
    getRowId: (r) => r.id,
    columns,
    dataSource: remote.source,
    modules,
    grouping: { lazy: true, lazyChunk: chunk },
    defaultQuery: { grouping: grouping.map((columnId) => ({ columnId })) },
  });
  const group = (id: string) => (engine as unknown as { grouping: { getGroup(id: string): GroupRowSnapshot | undefined } }).grouping.getGroup(id);
  const captionId = (key: string, depth = 0): string => {
    const rowsModel = engine.getSnapshot().rows;
    for (let i = 0; i < rowsModel.count; i++) {
      const id = engine.getRowIdAt(i) as string;
      const g = group(id);
      if (g && g.kind === 'group' && g.depth === depth && g.key === key) return id;
    }
    throw new Error(`no caption ${key}`);
  };
  const dataRows = () => {
    const model = engine.getSnapshot().rows;
    let n = 0;
    for (let i = 0; i < model.count; i++) if (model.view?.kindAt(i) === 'data') n++;
    return n;
  };
  const due = (start: number, end: number, threshold = 0) => lazyGroupsToAppend(engine.getSnapshot().rows.view, start, end, threshold);
  return { engine, remote, group, captionId, dataRows, due };
}

describe('scroll-driven lazy group loading', () => {
  it('a group whose loaded rows end inside the window (plus threshold) is due; others, collapsed and loading groups are not', async () => {
    const { engine, remote, group, captionId, due } = setup(items(100), ['team']);
    await remote.flush();
    const a = captionId('a');
    const b = captionId('b');
    assert.deepEqual(due(0, 10), [], 'collapsed groups are never due');
    engine.dispatch({ type: 'grouping.toggle', group: a, expanded: true });
    await remote.flush();
    // Rows: 0 caption a, 1..10 its first chunk, 11 caption b.
    assert.equal(group(a)?.hasMore, true);
    assert.deepEqual(due(0, 5), [], 'the end of the chunk is below the window');
    assert.deepEqual(due(0, 5, 6), [a], 'within threshold rows below the window');
    assert.deepEqual(due(8, 12), [a], 'the end of the chunk is inside the window');
    assert.deepEqual(due(11, 12), [], 'the end is above the window');
    engine.dispatch({ type: 'grouping.loadMore', group: a });
    assert.equal(group(a)?.status, 'loading');
    assert.deepEqual(due(0, 30), [], 'a loading group is not due again');
    await remote.flush();
    // b expanded too: both chunk ends inside one window are due, in view order.
    engine.dispatch({ type: 'grouping.toggle', group: b, expanded: true });
    await remote.flush();
    const end = engine.getSnapshot().rows.count;
    assert.deepEqual(due(0, end), [a, b]);
  });

  it('scrolling the window down appends group children until the group is complete (renderer loop)', async () => {
    const rows = items(100);
    const { engine, remote, group, captionId, dataRows, due } = setup(rows, ['team']);
    await remote.flush();
    const a = captionId('a');
    engine.dispatch({ type: 'grouping.toggle', group: a, expanded: true });
    await remote.flush();
    assert.equal(dataRows(), 10);
    const total = rows.filter((r) => r.team === 'a').length;
    // A 10-row viewport that follows the end of what is loaded (the user keeps scrolling).
    let reads = 0;
    for (let step = 0; step < 20 && group(a)?.hasMore; step++) {
      const end = engine.getSnapshot().rows.count;
      for (const id of due(Math.max(0, end - 10), end)) {
        engine.dispatch({ type: 'grouping.loadMore', group: id });
        reads++;
      }
      await remote.flush();
    }
    assert.equal(group(a)?.hasMore, false);
    assert.equal(dataRows(), total, 'every child appended by scrolling');
    assert.equal(reads, Math.ceil(total / 10) - 1, 'one read per chunk');
    assert.deepEqual(due(0, engine.getSnapshot().rows.count, 50), [], 'nothing left to load');
  });

  it('nested groups: the deepest group and its parent are due where both end', async () => {
    const { engine, remote, group, captionId, due } = setup(items(200), ['team', 'region'], 1);
    await remote.flush();
    const b = captionId('b');
    engine.dispatch({ type: 'grouping.toggle', group: b, expanded: true });
    await remote.flush();
    // Chunk 1: b loads one sub-group (East) and has more.
    assert.equal(group(b)?.hasMore, true);
    const east = captionId('East', 1);
    engine.dispatch({ type: 'grouping.toggle', group: east, expanded: true });
    await remote.flush();
    // Rows: b caption, East caption, one East row; then caption a.
    const count = engine.getSnapshot().rows.count;
    assert.deepEqual(due(0, count), [east, b], 'inner group first, then the parent');
    engine.dispatch({ type: 'grouping.loadMore', group: b });
    await remote.flush();
    assert.equal(group(b)?.hasMore, false, 'the second region chunk ends the sub-groups');
    assert.equal(group(captionId('West', 1))?.depth, 1);
  });
});
