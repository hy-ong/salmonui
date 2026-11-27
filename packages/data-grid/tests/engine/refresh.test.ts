import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDataGridApi,
  createDataGridEngine,
  createLocalDataSource,
  createSortModule,
  type DataSourceRequest,
  type DataSourceResult,
  type DataSource,
} from '@salmonui/data-grid/engine';
import { people, personColumns, type Person } from './fixtures.ts';

const getRowId = (row: Person) => row.id;

describe('refresh()', () => {
  it('re-reads local rows mutated in place, keeps the sort, and re-notifies rendered cells', () => {
    const rows = people(5) as { -readonly [K in keyof Person]: Person[K] }[];
    const engine = createDataGridEngine({ getRowId, columns: personColumns, dataSource: createLocalDataSource<Person>(rows, { getRowId }), modules: [createSortModule<Person>()] });
    const api = createDataGridApi(engine);
    api.sortColumn('name', 'desc');
    const before = engine.getCellSnapshot('p2', 'name');
    assert.equal(before?.value, 'Person 2');
    let notified = 0;
    engine.subscribeCell('p2', 'name', () => notified++);
    // Usage: mutate the bound array, then refresh.
    (rows[2] as { name: string }).name = 'Zed';
    assert.equal(engine.getCellSnapshot('p2', 'name')?.value, 'Person 2', 'without refresh the cached snapshot stays');
    api.refresh();
    assert.equal(engine.getCellSnapshot('p2', 'name')?.value, 'Zed');
    assert.equal(notified, 1, 'the rendered cell is notified once');
    // The sort is kept and re-applied to the new value.
    assert.deepEqual(engine.getSnapshot().query.sorting, [{ columnId: 'name', direction: 'desc' }]);
    assert.equal(engine.getRowIdAt(0), 'p2');
  });

  it('re-issues a remote read with the current query, invalidating the source cache first', async () => {
    const reads: DataSourceRequest[] = [];
    const invalidated: string[] = [];
    let label = 'a';
    const source: DataSource<Person> = {
      mode: 'remote',
      read(request): Promise<DataSourceResult<Person>> {
        reads.push(request);
        const rows = people(3).map((p) => ({ ...p, name: `${p.name} ${label}` }));
        return Promise.resolve({ version: request.version, rows, totalRowCount: 3 });
      },
      invalidate(scope) {
        invalidated.push(scope ?? 'all');
      },
    };
    const engine = createDataGridEngine<Person>({ getRowId, columns: personColumns, dataSource: source });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(engine.getSnapshot().data.status, 'ready');
    assert.equal(reads.length, 1);
    label = 'b';
    engine.refresh();
    assert.deepEqual(invalidated, ['all']);
    assert.equal(reads.length, 2, 'the same query is read again');
    assert.equal(engine.getSnapshot().data.status, 'loading');
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(engine.getSnapshot().data.status, 'ready');
    assert.equal(engine.getCellSnapshot('p0', 'name')?.value, 'Person 0 b');
  });

  it('an identical read in flight is aborted and re-issued', async () => {
    const reads: DataSourceRequest[] = [];
    const source: DataSource<Person> = {
      mode: 'remote',
      read: (request) => {
        reads.push(request);
        return new Promise<DataSourceResult<Person>>(() => {});
      },
    };
    const engine = createDataGridEngine<Person>({ getRowId, columns: personColumns, dataSource: source });
    assert.equal(reads.length, 1);
    engine.refresh();
    assert.equal(reads.length, 2);
    assert.equal(reads[0]?.signal.aborted, true);
    assert.ok((reads[1]?.version ?? 0) > (reads[0]?.version ?? 0));
  });
});
