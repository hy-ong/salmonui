// Server-generated identity keys on add: the write response of a
// remote source supplies the key of an added row; the source replaces the
// temporary row with the server echo and the grid re-keys the row. Local
// sources fill identity columns with max + 1 (data-grid-core edit tests); remote
// sources leave the key empty for the server.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createControlledDataSource, createJsonDataSource, type DataSourceEvent, type WriteRequest, type WriteResult } from '@salmonui/data';
import { createDataGridEngine } from '@salmonui/data-grid/engine';
import { createEditApi, createEditModule } from '@salmonui/data-grid/engine/edit';
import { ORDER_FIELDS, orderServer, query, request, signal } from './helpers.ts';

interface Keyed {
  readonly id: number | null;
  readonly name: string;
}

const seed: readonly Keyed[] = Object.freeze([
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
]);

describe('server-generated identity key on add', () => {
  it('JSON source: the write response key replaces the temporary row of an added record', async () => {
    type Tuple = readonly unknown[];
    const server = orderServer(20);
    const source = createJsonDataSource({ transport: server.transport(), key: 'OrderID', fields: ORDER_FIELDS, versionField: 'version' });
    const events: DataSourceEvent<Tuple>[] = [];
    source.subscribe((e) => events.push(e as DataSourceEvent<Tuple>));
    const page = await source.read(request(query({ paging: { page: 1, pageSize: 5 } })));
    const added = (page.rows[0] as Tuple).slice();
    added[0] = null; // identity key left empty for the server
    const result = await source.write({ version: 1, added: [{ tempId: 'tmp-1', row: added }], changed: [], deleted: [], mode: 'batch', signal: signal() });
    assert.equal(result.status, 'applied');
    assert.equal(result.added?.length, 1);
    assert.equal(result.added?.[0]?.tempId, 'tmp-1');
    const key = result.added?.[0]?.row[0];
    assert.ok(key !== null && key !== undefined, 'the response supplies the identity key');
    const rows = source.getRows() as Tuple[];
    assert.equal(rows.filter((r) => r[0] === null).length, 0, 'no temporary row with an empty key remains');
    assert.equal(rows.filter((r) => r[0] === key).length, 1, 'the added row carries the server key');
    assert.equal(events.at(-1)?.type, 'reset', 'a re-keyed row is a structural change');
  });

  it('controlled source: the onDataChange echo of an added row (server key) is the row the grid receives', async () => {
    const requests: WriteRequest<Keyed>[] = [];
    const source = createControlledDataSource<Keyed>({
      onQueryChange: (req) => ({ version: req.version, rows: seed, totalRowCount: 2 }),
      onDataChange: async (req): Promise<WriteResult<Keyed>> => {
        requests.push(req);
        return { version: req.version, status: 'applied', added: req.added.map((a, i) => ({ tempId: a.tempId, row: { ...a.row, id: 100 + i } })) };
      },
    });
    const events: DataSourceEvent<Keyed>[] = [];
    source.subscribe?.((e) => events.push(e));
    await source.read(request(query()));
    const result = await source.write!({ version: 1, added: [{ tempId: 't1', row: { id: null, name: 'new' } }], changed: [], deleted: [], mode: 'row', signal: signal() });
    assert.equal(result.status, 'applied');
    const reset = events.at(-1) as Extract<DataSourceEvent<Keyed>, { type: 'reset' }>;
    assert.equal(reset.type, 'reset');
    assert.deepEqual(reset.rows.map((r) => r.id), [1, 2, 100]);
    assert.equal(reset.totalRowCount, 3);
  });

  it('engine + remote source: an identity primary key is not filled locally and the row is re-keyed to the server key after save', async () => {
    const requests: WriteRequest<Keyed>[] = [];
    const source = createControlledDataSource<Keyed>({
      onQueryChange: (req) => ({ version: req.version, rows: seed, totalRowCount: 2 }),
      onDataChange: async (req): Promise<WriteResult<Keyed>> => {
        requests.push(req);
        return { version: req.version, status: 'applied', added: req.added.map((a) => ({ tempId: a.tempId, row: { ...a.row, id: 501 } })) };
      },
    });
    const modules = [createEditModule<Keyed>()] as const;
    const engine = createDataGridEngine<Keyed, typeof modules>({
      getRowId: (r) => String(r.id),
      columns: [{ field: 'id', type: 'number', primaryKey: true, identity: true }, { field: 'name' }],
      dataSource: source,
      modules,
      edit: { mode: 'batch' },
    });
    const off = engine.connect();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.getRow('1')?.name, 'a');
    const api = createEditApi(engine);
    assert.equal(api.addRow({ name: 'server keyed' }).status, 'applied');
    api.saveCell();
    api.save();
    await api.whenEditSettled();
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.added.length, 1);
    const sent = requests[0]!.added[0]!.row;
    assert.equal(sent.id ?? null, null, 'a remote source sends the identity key empty (no local max + 1)');
    assert.equal(sent.name, 'server keyed');
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.getRow('501')?.name, 'server keyed', 'the added row is keyed by the server-generated id');
    assert.equal(engine.getRow('3'), undefined, 'no local max + 1 key');
    off();
  });
});
