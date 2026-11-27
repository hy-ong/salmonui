import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, createLocalDataSource, createSortModule, type DataSourceEvent, type DataSourceRequest, type DataSource } from '@salmonui/data-grid/engine';
import { createLookupModule, type LookupSource } from '@salmonui/data-grid/engine/lookup';
import { people, personColumns, type Person } from './fixtures.ts';

// `deferDataSource`: creating the engine is
// free of data-source side effects, so a renderer can create it during render;
// `connect()` subscribes and reads after commit.

const getRowId = (row: Person) => row.id;

function spySource(mode: DataSource<Person>['mode'], result: () => Person[] | Promise<Person[]>) {
  const calls = { read: 0, subscribe: 0, unsubscribe: 0, aborted: 0 };
  let listener: ((event: DataSourceEvent<Person>) => void) | null = null;
  const source: DataSource<Person> = {
    mode,
    read(request: DataSourceRequest) {
      calls.read++;
      request.signal.addEventListener?.('abort', () => calls.aborted++);
      const rows = result();
      return rows instanceof Promise ? rows.then((r) => ({ version: request.version, rows: r })) : { version: request.version, rows };
    },
    subscribe(l) {
      calls.subscribe++;
      listener = l;
      return () => {
        calls.unsubscribe++;
        listener = null;
      };
    },
  };
  return { source, calls, emit: (event: DataSourceEvent<Person>) => listener?.(event) };
}

describe('deferDataSource and connect()', () => {
  it('creation neither reads nor subscribes; connect does both once', async () => {
    const { source, calls } = spySource('remote', () => people(3));
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source, deferDataSource: true });
    assert.deepEqual(calls, { read: 0, subscribe: 0, unsubscribe: 0, aborted: 0 });
    assert.equal(engine.getServerSnapshot().data.status, 'loading');
    assert.equal(engine.getSnapshot().rows.count, 0);
    const disconnect = engine.connect();
    assert.equal(calls.read, 1);
    assert.equal(calls.subscribe, 1);
    // The creation-time request was gated: even a synchronous result settles asynchronously.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(engine.getSnapshot().rows.count, 3);
    assert.equal(engine.getSnapshot().data.status, 'ready');
    assert.equal(engine.getServerSnapshot().rows.count, 0, 'the server snapshot keeps the creation state');
    assert.equal(engine.connect()(), undefined, 'connect while connected is a no-op');
    assert.equal(calls.read, 1);
    disconnect();
    assert.equal(calls.unsubscribe, 1);
  });

  it('a query change before connect supersedes the gated read', async () => {
    const queries: string[] = [];
    const source: DataSource<Person> = {
      mode: 'remote',
      read(request) {
        queries.push(JSON.stringify(request.query.sorting));
        return { version: request.version, rows: people(2) };
      },
    };
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source, modules: [createSortModule<Person>()], deferDataSource: true });
    engine.dispatch({ type: 'sort.toggle', columnId: 'name' });
    assert.deepEqual(queries, []);
    engine.connect();
    assert.equal(queries.length, 1, 'only the latest request reaches the source');
    assert.match(queries.join(), /name/);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.getSnapshot().rows.count, 2);
  });

  it('a local getRows() snapshot is read at creation; subscribe still waits', () => {
    const source = createLocalDataSource(people(5), { getRowId });
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source, deferDataSource: true });
    assert.equal(engine.getServerSnapshot().rows.count, 5);
    assert.equal(engine.getServerSnapshot().data.status, 'ready');
    // Not subscribed yet: changes before connect do not reach the engine...
    source.setRows(people(2));
    assert.equal(engine.getSnapshot().rows.count, 5);
    // ...and connect catches up.
    const disconnect = engine.connect();
    assert.equal(engine.getSnapshot().rows.count, 2);
    source.patch({ append: people(4).slice(2) });
    assert.equal(engine.getSnapshot().rows.count, 4);
    disconnect();
    source.setRows(people(1));
    assert.equal(engine.getSnapshot().rows.count, 4, 'disconnected');
    engine.connect();
    assert.equal(engine.getSnapshot().rows.count, 1, 'reconnect catches up');
  });

  it('disconnect aborts an in-flight read and the next connect re-issues it', async () => {
    let resolve!: (rows: Person[]) => void;
    const { source, calls } = spySource('remote', () => new Promise<Person[]>((r) => (resolve = r)));
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source, deferDataSource: true });
    const disconnect = engine.connect();
    assert.equal(calls.read, 1);
    disconnect();
    assert.equal(calls.aborted, 1);
    resolve(people(9));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.getSnapshot().rows.count, 0, 'the aborted result is discarded');
    engine.connect();
    assert.equal(calls.read, 2);
    resolve(people(7));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.getSnapshot().rows.count, 7);
  });

  it('remote lookups queued by render-time reads load only after connect', async () => {
    let loads = 0;
    const lookup: LookupSource = {
      load(request) {
        loads++;
        return request.keys.map((k) => ({ key: k, label: `L${String(k)}` }));
      },
    };
    const engine = createDataGridEngine({
      getRowId,
      columns: [...personColumns, { id: 'who', field: 'id', lookup: { data: lookup, keyField: 'key', displayField: 'label' } }],
      dataSource: people(3),
      modules: [createLookupModule<Person>()],
      deferDataSource: true,
    });
    assert.equal(engine.getCellSnapshot('p0', 'who')?.formattedValue, '');
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(loads, 0, 'no lookup load before connect');
    engine.connect();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(loads, 1);
    assert.equal(engine.getCellSnapshot('p0', 'who')?.formattedValue, 'Lp0');
  });

  it('without deferDataSource the engine reads and subscribes at creation (unchanged)', () => {
    const { source, calls } = spySource('remote', () => people(3));
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: source });
    assert.equal(calls.read, 1);
    assert.equal(calls.subscribe, 1);
    assert.equal(engine.getServerSnapshot().rows.count, 3);
    engine.connect()();
    assert.equal(calls.unsubscribe, 0, 'connect is a no-op for an engine created connected');
  });
});
