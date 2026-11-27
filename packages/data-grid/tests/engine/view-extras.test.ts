import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, createPagingModule, type DataSource, type PageInfo } from '@salmonui/data-grid/engine';

// Name-table additions in the core: the `rowNumber` column type,
// the remote total override `paging.totalRowCount`, and
// `engine.reload()` (the retry of the data error UI).

interface Item {
  readonly id: string;
  readonly n: number;
}

const items = (count: number, from = 0): Item[] => Array.from({ length: count }, (_, i) => ({ id: `r${from + i}`, n: from + i }));
const getRowId = (row: Item): string => row.id;

/** A remote source that pages on the server and reports no total. */
function pagedRemote(total: number | undefined): { source: DataSource<Item>; reads: number[] } {
  const reads: number[] = [];
  const source: DataSource<Item> = {
    mode: 'remote',
    read(request) {
      const paging = request.query.paging ?? { page: 1, pageSize: 10 };
      reads.push(paging.page);
      const rows = items(paging.pageSize, (paging.page - 1) * paging.pageSize);
      return { version: request.version, rows, performed: ['page'], ...(total !== undefined ? { totalRowCount: total } : {}) };
    },
  };
  return { source, reads };
}

const info = (engine: unknown): PageInfo => (engine as { paging: { getInfo(): PageInfo } }).paging.getInfo();

describe('rowNumber column type', () => {
  it('compiles without a field, value, or type inference', () => {
    const engine = createDataGridEngine<Item>({
      getRowId,
      columns: [{ id: 'no', type: 'rowNumber', header: '#' }, { field: 'n' }],
      dataSource: items(3),
    });
    const column = engine.getSnapshot().columns.byId.get('no');
    assert.equal(column?.type, 'rowNumber');
    assert.equal(column?.typeSource, 'definition');
    assert.equal(column?.field, null);
    assert.equal(engine.getCellValue('r1', 'no'), undefined);
  });
});

describe('paging.totalRowCount', () => {
  it('gives a remote source without a total its page count', () => {
    const { source, reads } = pagedRemote(undefined);
    const engine = createDataGridEngine({ getRowId, columns: [{ field: 'n' }], dataSource: source, modules: [createPagingModule<Item>()], paging: { pageSize: 10, totalRowCount: 95 } });
    assert.equal(info(engine).pageCount, 10);
    assert.equal(info(engine).totalRowCount, 95);
    assert.equal(engine.dispatch({ type: 'paging.goToPage', page: 7 }).status, 'applied');
    assert.deepEqual(reads, [1, 7]);
  });

  it('wins over the reported total and can be cleared', () => {
    const { source } = pagedRemote(40);
    const engine = createDataGridEngine({ getRowId, columns: [{ field: 'n' }], dataSource: source, modules: [createPagingModule<Item>()], paging: { pageSize: 10 } });
    assert.equal(info(engine).pageCount, 4);
    assert.equal(engine.dispatch({ type: 'paging.setTotalRowCount', totalRowCount: 200 }).status, 'applied');
    assert.equal(info(engine).pageCount, 20);
    engine.dispatch({ type: 'paging.setTotalRowCount', totalRowCount: null });
    assert.equal(info(engine).pageCount, 4);
    assert.equal(engine.dispatch({ type: 'paging.setTotalRowCount', totalRowCount: -1 }).status, 'rejected');
  });

  it('is ignored when the page stage runs locally', () => {
    const engine = createDataGridEngine({ getRowId, columns: [{ field: 'n' }], dataSource: items(25), modules: [createPagingModule<Item>()], paging: { pageSize: 10, totalRowCount: 500 } });
    assert.equal(info(engine).pageCount, 3);
  });
});

describe('engine.reload()', () => {
  it('re-reads a failed remote source with the unchanged query', async () => {
    let fail = true;
    let reads = 0;
    const source: DataSource<Item> = {
      mode: 'remote',
      read(request) {
        reads++;
        if (fail) return Promise.reject(new Error('offline'));
        return Promise.resolve({ version: request.version, rows: items(3), totalRowCount: 3 });
      },
    };
    const engine = createDataGridEngine<Item>({ getRowId, columns: [{ field: 'n' }], dataSource: source });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.getSnapshot().data.status, 'error');
    fail = false;
    engine.reload();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(reads, 2);
    assert.equal(engine.getSnapshot().data.status, 'ready');
    assert.equal(engine.getSnapshot().rows.count, 3);
  });

  it('retries a read that threw synchronously', () => {
    let fail = true;
    const source: DataSource<Item> = {
      mode: 'remote',
      read(request) {
        if (fail) throw new Error('bad request');
        return { version: request.version, rows: items(2), totalRowCount: 2 };
      },
    };
    const engine = createDataGridEngine<Item>({ getRowId, columns: [{ field: 'n' }], dataSource: source });
    assert.equal(engine.getSnapshot().data.status, 'error');
    fail = false;
    engine.reload();
    assert.equal(engine.getSnapshot().data.status, 'ready');
    assert.equal(engine.getSnapshot().rows.count, 2);
  });
});
