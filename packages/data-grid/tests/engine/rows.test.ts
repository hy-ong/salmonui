import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridApi, createDataGridEngine, createLocalDataSource, rowIdFromKey } from '@salmonui/data-grid/engine';
import { collectWarnings, people, personColumns, type Person } from './fixtures.ts';

const getRowId = (row: Person) => row.id;

function make(rows: Person[] = people()) {
  const w = collectWarnings();
  const source = createLocalDataSource(rows, { getRowId });
  const engine = createDataGridEngine<Person>({ getRowId, columns: personColumns, dataSource: source, dev: true, instrument: true, onWarning: w.onWarning });
  return { engine, source, w, api: createDataGridApi(engine) };
}

describe('row model', () => {
  it('stores raw row references with parallel ids and no wrapper objects', () => {
    const rows = people();
    const { engine } = make(rows);
    const model = engine.getSnapshot().rows;
    assert.equal(model.source, rows);
    assert.deepEqual(model.sourceIds, ['p0', 'p1', 'p2', 'p3', 'p4']);
    assert.equal(model.order, null);
    assert.equal(model.count, 5);
    assert.equal(engine.getRow('p3'), rows[3]);
    assert.equal(engine.getRowAt(3), rows[3]);
    assert.equal(engine.getInstrumentation()?.rowSnapshots, 0);
  });

  it('keeps row ids stable across data replacement and patches', () => {
    const { engine, source } = make();
    const before = engine.getRowSnapshot('p2');
    source.patch({ append: [{ ...people(1)[0]!, id: 'p9' }] });
    assert.equal(engine.getRowSnapshot('p2'), before, 'unaffected row keeps its snapshot');
    assert.equal(engine.getRowIndex('p9'), 5);
    source.patch({ remove: ['p0'] });
    assert.equal(engine.getRowSnapshot('p2')?.index, 1);
    assert.equal(engine.getRowSnapshot('p2')?.id, 'p2');
    source.setRows([...people()].reverse());
    assert.equal(engine.getRowIndex('p2'), 2);
    assert.equal(engine.getRowIndex('p4'), 0);
    assert.equal(engine.getRow('p0')?.id, 'p0');
  });

  it('warns on duplicate and non-string ids', () => {
    const w = collectWarnings();
    const rows = [...people(3), { ...people(1)[0]!, name: 'Dup' }];
    createDataGridEngine<Person>({ getRowId, columns: personColumns, dataSource: rows, dev: true, onWarning: w.onWarning });
    assert.deepEqual(w.codes(), ['row-id-duplicate']);
    assert.match(w.warnings[0]?.message ?? '', /"p0"/);

    const w2 = collectWarnings();
    const engine = createDataGridEngine<Person>({ getRowId: (r) => Number(r.id.slice(1)) as never, columns: personColumns, dataSource: people(2), dev: true, onWarning: w2.onWarning });
    assert.deepEqual(w2.codes(), ['row-id-invalid']);
    assert.equal(engine.getRow('1')?.id, 'p1');
  });

  it('patch notifies only the updated row and its cells', () => {
    const { engine, source } = make();
    const rowHits: string[] = [];
    const cellHits: string[] = [];
    let grid = 0;
    engine.subscribe(() => grid++);
    for (const p of people()) {
      engine.getRowSnapshot(p.id);
      engine.subscribeRow(p.id, () => rowHits.push(p.id));
      for (const col of ['name', 'age']) {
        engine.getCellSnapshot(p.id, col);
        engine.subscribeCell(p.id, col, () => cellHits.push(`${p.id}:${col}`));
      }
    }
    const before = engine.getCellSnapshot('p3', 'name');
    const other = engine.getCellSnapshot('p1', 'name');
    source.patch({ upsert: [{ ...people(4)[3]!, name: 'Renamed' }] });
    assert.deepEqual(rowHits, ['p3']);
    assert.deepEqual(cellHits.sort(), ['p3:age', 'p3:name']);
    assert.equal(grid, 1);
    assert.notEqual(engine.getCellSnapshot('p3', 'name'), before);
    assert.equal(engine.getCellSnapshot('p3', 'name')?.formattedValue, 'Renamed');
    assert.equal(engine.getCellSnapshot('p1', 'name'), other);
  });

  it('hiding a column does not notify row or cell subscribers', () => {
    const { engine } = make();
    let hits = 0;
    engine.getRowSnapshot('p1');
    engine.getCellSnapshot('p1', 'name');
    engine.subscribeRow('p1', () => hits++);
    engine.subscribeCell('p1', 'name', () => hits++);
    engine.columns.hide({ keys: ['age'] });
    assert.equal(hits, 0);
  });

  it('getRowId helper from a primary key', () => {
    const one = rowIdFromKey<Person>('id');
    const two = rowIdFromKey<Person>(['id', 'name']);
    const fn = rowIdFromKey<Person>((r) => r.age ?? 0);
    const p = people(2)[1] as Person;
    assert.equal(one(p), 'p1');
    assert.equal(two(p), 'p1\u001fPerson 1');
    assert.equal(fn(p), '21');
  });
});

describe('local data source', () => {
  it('accepts a plain array or createLocalDataSource', () => {
    const rows = people();
    const fromArray = createDataGridEngine<Person>({ getRowId, columns: personColumns, dataSource: rows });
    assert.equal(fromArray.getDataSource().mode, 'local');
    assert.equal(fromArray.getSnapshot().rows.source, rows);
    assert.deepEqual(fromArray.getSnapshot().data, {
      status: 'ready', error: null, totalRowCount: 5, version: 1, mode: 'local', performed: [], aggregates: null,
    });
  });

  it('supports setRows, patch (append/upsert/remove) and synchronous write', async () => {
    const { engine, source } = make();
    source.patch({ upsert: [{ ...people(1)[0]!, name: 'Zero' }, { ...people(1)[0]!, id: 'new' }] });
    assert.equal(engine.getRow('p0')?.name, 'Zero');
    assert.equal(engine.getRowIndex('new'), 5);
    source.patch({ remove: ['p1', 'missing'] });
    assert.equal(engine.getRow('p1'), undefined);
    assert.equal(engine.getSnapshot().data.totalRowCount, 5);

    const previous = engine.getRow('p2') as Person;
    const pending = source.write({
      version: 1,
      added: [{ tempId: 'tmp', row: { ...previous, id: 'added' } }],
      changed: [{ rowId: 'p2', row: { ...previous, name: 'Two' }, previous, changedColumnIds: ['name'] }],
      deleted: [{ rowId: 'p3', row: engine.getRow('p3') as Person }],
      mode: 'batch',
      signal: { aborted: false, addEventListener() {}, removeEventListener() {} },
    });
    // Applied before the promise settles.
    assert.equal(engine.getRow('p2')?.name, 'Two');
    assert.equal(engine.getRow('p3'), undefined);
    assert.ok(engine.getRow('added'));
    const result = await pending;
    assert.equal(result.status, 'applied');
    assert.deepEqual(result.deleted, ['p3']);
    assert.deepEqual(engine.getSnapshot().rows.sourceIds, ['p0', 'p2', 'p4', 'new', 'added']);
  });

  it('upsert and remove require getRowId on a standalone source', () => {
    const source = createLocalDataSource(people());
    assert.throws(() => source.patch({ remove: ['p0'] }), /requires the getRowId option/);
    source.patch({ append: people(1) });
    assert.equal(source.getRows().length, 6);
  });
});

describe('row API', () => {
  it('getViewRows, getRow, getRowInfo, getCell, getDataSource, dispose', () => {
    const { engine, api, source } = make();
    assert.equal(api.getViewRows(), engine.getSnapshot().rows.source);
    assert.equal(api.getRow('p1')?.name, 'Person 1');
    assert.deepEqual(api.getRowInfo('p1'), { id: 'p1', kind: 'data', row: engine.getRow('p1'), index: 1, depth: 0, parentId: null });
    assert.deepEqual(api.getCell('p1', 'age'), { rowId: 'p1', columnId: 'age', value: 21, formattedValue: '21' });
    assert.equal(api.getCell('p1', 'missing'), undefined);
    assert.equal(api.getCell('missing', 'age'), undefined);
    assert.equal(api.getDataSource(), source);
    assert.deepEqual(api.getPrimaryKeyFields(), ['id']);
    assert.equal(api.getRowIndex('p1'), 1);
    assert.equal(api.getRowIndex('missing'), -1);
    assert.equal(api.getRowIdAt(1), 'p1');
    assert.equal(api.getRowIdAt(api.getRowIndex('p3')), 'p3');
    assert.equal(api.getRowIdAt(99), undefined);
    api.dispose();
    assert.equal(engine.disposed, true);
    source.setRows([]);
    assert.equal(engine.getSnapshot().rows.count, 5, 'a disposed engine ignores source events');
  });
});

describe('setRows notification precision', () => {
  it('notifies only subscribers whose row reference or index changed', () => {
    const rows = people();
    const { engine, source } = make(rows);
    const hits: string[] = [];
    for (const p of rows) {
      engine.getRowSnapshot(p.id);
      engine.getCellSnapshot(p.id, 'name');
      engine.subscribeRow(p.id, () => hits.push(`row:${p.id}`));
      engine.subscribeCell(p.id, 'name', () => hits.push(`cell:${p.id}`));
    }
    const next = rows.slice();
    next[2] = { ...(rows[2] as Person), name: 'Two' };
    source.setRows(next);
    assert.deepEqual(hits.sort(), ['cell:p2', 'row:p2']);
  });
});
