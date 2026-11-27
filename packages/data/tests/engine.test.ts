// End-to-end with the data-grid-core engine: tuple rows through tupleColumns with
// no row-object materialization, server-performed stages, optimistic writes
// notifying only the written row, and errors keeping the last rows.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, defineDataGridModule, type ColumnDef } from '@salmonui/data-grid/engine';
import { createJsonDataSource, HttpError, tupleColumns, tupleRowId, type JsonTransport, type TupleRow } from '@salmonui/data';
import { ORDER_FIELDS, orderServer, settle } from './helpers.ts';

const columns: ColumnDef<TupleRow>[] = tupleColumns<ColumnDef<TupleRow>>(
  [{ field: 'OrderID', type: 'number' }, { field: 'ShipCity' }, { field: 'Freight', type: 'number' }, { field: 'OrderDate', type: 'date', format: { timeZone: 'UTC', skeleton: 'yMd' } }],
  ORDER_FIELDS,
);

type PageCommand = { type: 'pg.go'; page: number };
const pager = defineDataGridModule<TupleRow, number, PageCommand, 'pg'>({
  name: 'pg',
  commands: ['pg.go'],
  initialState: () => 1,
  reduce: (_s, c) => c.page,
  extendQuery: (query, page) => ({ ...query, paging: { page, pageSize: 10 } }),
});

describe('data-grid-core engine integration', () => {
  it('renders tuple rows with index accessors and re-reads on query change', async () => {
    let fail = false;
    const server = orderServer();
    const transport: JsonTransport = async (req) => {
      if (fail) throw new HttpError(503, '', '');
      return JSON.parse(JSON.stringify(server.handle(req)));
    };
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, versionField: 'version' });
    const engine = createDataGridEngine({ getRowId: tupleRowId(ORDER_FIELDS, 'OrderID'), columns, dataSource: source, modules: [pager], locale: 'en-US' });
    await settle(10);
    const snap = engine.getSnapshot();
    assert.equal(snap.data.status, 'ready');
    assert.equal(snap.data.totalRowCount, 240);
    assert.equal(snap.rows.count, 10);
    assert.equal(engine.getCellValue('10248', 'OrderID'), 10248);
    assert.equal(typeof engine.getCellValue('10248', 'OrderDate'), 'number', 'dates stay epoch ms');
    assert.match(engine.getCellSnapshot('10248', 'OrderDate')!.formattedValue, /^\d{1,2}\/\d{1,2}\/2024$/);
    assert.ok(Array.isArray(engine.getRow('10248')), 'rows are the decoded tuples');

    engine.dispatch({ type: 'pg.go', page: 2 });
    await settle(10);
    assert.equal(engine.getRowIdAt(0), '10258');

    // Optimistic cell write notifies only that row.
    const notified: string[] = [];
    engine.subscribeRow('10258', () => notified.push('10258'));
    engine.subscribeRow('10259', () => notified.push('10259'));
    engine.getRowSnapshot('10258');
    engine.getRowSnapshot('10259');
    const row = engine.getRow('10258')!;
    const next = columns[2]!.valueSetter!(row, 1.5);
    const pending = source.write({ version: 1, mode: 'cell', added: [], deleted: [], changed: [{ rowId: '10258', row: next, previous: row, changedColumnIds: ['Freight'] }], signal: new AbortController().signal });
    assert.equal(engine.getCellValue('10258', 'Freight'), 1.5);
    engine.getRowSnapshot('10258');
    await pending;
    assert.ok(notified.length > 0 && notified.every((id) => id === '10258'), `notified ${notified.join(',')}`);

    // A failed read keeps the last good rows.
    fail = true;
    engine.dispatch({ type: 'pg.go', page: 3 });
    await settle(10);
    assert.equal(engine.getSnapshot().data.status, 'error');
    assert.equal(engine.getRowIdAt(0), '10258');
    engine.dispose();
  });
});
