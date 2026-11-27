import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDataGridEngine,
  createDataGridQuery,
  defineDataGridModule,
  deserializeDataGridQuery,
  serializeDataGridQuery,
  type DataSourceRequest,
  type DataSourceResult,
  type DataSource,
  type DataGridModule,
} from '@salmonui/data-grid/engine';
import { collectWarnings, people, personColumns, type Person } from './fixtures.ts';

const getRowId = (row: Person) => row.id;

interface Deferred {
  request: DataSourceRequest;
  resolve(result: DataSourceResult<Person>): void;
  reject(error: unknown): void;
}

/** A custom adaptor: a user-implemented remote source with manual resolution. */
function manualRemote() {
  const requests: Deferred[] = [];
  const source: DataSource<Person> = {
    mode: 'remote',
    read(request) {
      return new Promise((resolve, reject) => requests.push({ request, resolve, reject }));
    },
  };
  return { source, requests };
}

/** Module that writes `query.filters` from its state, to drive remote re-reads. */
type FilterCommand = { type: 'qf.set'; text: string };
const queryFilter = defineDataGridModule<Person, string, FilterCommand, 'qf'>({
  name: 'qf',
  commands: ['qf.set'],
  initialState: () => '',
  reduce: (_s, c) => c.text,
  extendQuery: (query, text) =>
    text ? { ...query, filters: [{ columnId: 'name', operator: 'contains', value: text, predicate: 'and', source: 'api' }] } : query,
  pipeline: [
    {
      name: 'filter',
      key: (q) => [q.filters],
      run: () => {
        throw new Error('filter stage must be skipped when the server performed it');
      },
    },
  ],
});

describe('DataQuery', () => {
  it('serializes deterministically and round-trips', () => {
    const a = createDataGridQuery({ sorting: [{ columnId: 'name', direction: 'asc' }], paging: { pageSize: 20, page: 2 } });
    const b = createDataGridQuery({ paging: { page: 2, pageSize: 20 }, sorting: [{ direction: 'asc', columnId: 'name' }] });
    assert.equal(serializeDataGridQuery(a), serializeDataGridQuery(b));
    assert.deepEqual(deserializeDataGridQuery(serializeDataGridQuery(a)), a);
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.sorting) && Object.isFrozen(a.sorting[0]));
    assert.throws(() => deserializeDataGridQuery('[]'), /expected a JSON object/);
    assert.throws(() => deserializeDataGridQuery('{"sorting":1}'), /must be an array/);
  });

  it('drops local-only aggregate functions when serializing', () => {
    const q = createDataGridQuery({ aggregates: [{ columnId: 'age', type: 'custom', custom: () => 1, placement: ['footer'] }] });
    assert.equal(typeof q.aggregates[0]?.custom, 'function');
    assert.deepEqual(JSON.parse(serializeDataGridQuery(q)).aggregates[0], { columnId: 'age', placement: ['footer'], type: 'custom' });
  });
});

describe('defaultQuery', () => {
  it('becomes the initial query and is sent to remote sources', async () => {
    const { source, requests } = manualRemote();
    const engine = createDataGridEngine<Person>({
      getRowId,
      columns: personColumns,
      dataSource: source,
      defaultQuery: { paging: { page: 1, pageSize: 2 }, filters: [{ columnId: 'age', operator: 'greaterThan', value: 21, predicate: 'and', source: 'api' }] },
    });
    assert.equal(engine.getSnapshot().query.paging?.pageSize, 2);
    assert.equal(requests[0]?.request.query, engine.getSnapshot().query);
    assert.equal(engine.getSnapshot().data.status, 'loading');
    requests[0]?.resolve({ version: 1, rows: people(2), totalRowCount: 40 });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(engine.getSnapshot().data.status, 'ready');
    assert.equal(engine.getSnapshot().data.totalRowCount, 40);
    assert.deepEqual(engine.getSnapshot().data.performed, ['search', 'filter', 'sort', 'group', 'aggregate', 'page']);
  });

  it('warns for local data when no module handles a query part', () => {
    const w = collectWarnings();
    createDataGridEngine<Person>({
      getRowId,
      columns: personColumns,
      dataSource: people(),
      defaultQuery: { sorting: [{ columnId: 'age', direction: 'desc' }] },
      dev: true,
      onWarning: w.onWarning,
    });
    assert.deepEqual(w.codes(), ['query-unhandled']);
  });
});

describe('remote reads', () => {
  it('versions requests, aborts superseded ones and discards stale results', async () => {
    const { source, requests } = manualRemote();
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source, modules: [queryFilter], instrument: true });
    assert.equal(requests.length, 1);
    engine.qf.set({ text: 'a' });
    engine.qf.set({ text: 'ab' });
    assert.deepEqual(requests.map((r) => r.request.version), [1, 2, 3]);
    assert.deepEqual(requests.map((r) => r.request.signal.aborted), [true, true, false]);

    requests[2]?.resolve({ version: 3, rows: people(1), totalRowCount: 1, performed: ['filter'] });
    requests[0]?.resolve({ version: 1, rows: people(5), totalRowCount: 5 });
    requests[1]?.reject(new Error('aborted'));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.getSnapshot().rows.count, 1);
    assert.equal(engine.getSnapshot().data.version, 3);
    assert.equal(engine.getSnapshot().data.status, 'ready');
    assert.equal(engine.getInstrumentation()?.staleResults, 2);
  });

  it('dedupes identical requests and does not refetch an unchanged query', () => {
    const { source, requests } = manualRemote();
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source, modules: [queryFilter] });
    engine.qf.set({ text: 'x' });
    engine.qf.set({ text: 'x' });
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.request.signal.aborted, false);
  });

  it('runs stages the server did not perform', async () => {
    let ran = 0;
    const counting: DataGridModule<Person> = {
      name: 'pager',
      commands: [],
      initialState: () => null,
      pipeline: [{ name: 'page', key: () => [], run: (i) => (ran++, i) }],
    };
    const { source, requests } = manualRemote();
    createDataGridEngine({ getRowId, columns: personColumns, dataSource: source, modules: [queryFilter, counting] });
    requests[0]?.resolve({ version: 1, rows: people(), performed: ['filter'] });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(ran, 1, 'page stage runs because the server did not page');
  });

  it('keeps the last good rows on error and stays usable', async () => {
    const { source, requests } = manualRemote();
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source, modules: [queryFilter] });
    requests[0]?.resolve({ version: 1, rows: people(3) });
    await new Promise((r) => setTimeout(r, 0));
    engine.qf.set({ text: 'boom' });
    const failure = new Error('500');
    requests[1]?.reject(failure);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.getSnapshot().data.status, 'error');
    assert.equal(engine.getSnapshot().data.error, failure);
    assert.equal(engine.getSnapshot().rows.count, 3);
  });

  it('dispose aborts the in-flight request', () => {
    const { source, requests } = manualRemote();
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source });
    engine.dispose();
    assert.equal(requests[0]?.request.signal.aborted, true);
  });

  it('a synchronous custom source works without promises', () => {
    const custom: DataSource<Person> = {
      mode: 'remote',
      read: (request) => ({ version: request.version, rows: people(2), totalRowCount: 99 }),
    };
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: custom });
    assert.equal(engine.getSnapshot().data.status, 'ready');
    assert.equal(engine.getSnapshot().data.totalRowCount, 99);
    assert.equal(engine.getSnapshot().columns.byId.get('age')?.type, 'number');
  });

  it('resolves pending column types once async rows arrive', async () => {
    const { source, requests } = manualRemote();
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source });
    assert.equal(engine.getSnapshot().columns.byId.get('joined')?.typeSource, 'pending');
    requests[0]?.resolve({ version: 1, rows: people() });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.getSnapshot().columns.byId.get('joined')?.type, 'date');
  });
});
