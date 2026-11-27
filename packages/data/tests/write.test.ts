// CRUD write path: optimistic success, partial failure, conflicts,
// pessimistic mode, rollback, and which rows/cells are notified.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createConflictReview,
  createJsonDataSource,
  resolveConflicts,
  setConflictChoice,
  type DataSourceEvent,
  type JsonTransport,
  type WireWriteRequest,
  type WriteRequest,
  type WriteStateEvent,
} from '@salmonui/data';
import { manualTransport, ORDER_FIELDS, orderServer, query, request, settle, signal } from './helpers.ts';

type Tuple = readonly unknown[];
const F = (name: (typeof ORDER_FIELDS)[number]) => ORDER_FIELDS.indexOf(name);
const set = (row: Tuple, field: (typeof ORDER_FIELDS)[number], value: unknown): Tuple => {
  const next = row.slice();
  next[F(field)] = value;
  return next;
};
const idOf = (row: Tuple) => String(row[0]);

function setup(transport?: JsonTransport) {
  const server = orderServer(240, {
    validate: (row) => ((row['Freight'] as number) < 0 ? [{ field: 'Freight', code: 'range', message: 'Freight must be >= 0' }] : []),
  });
  const source = createJsonDataSource({ transport: transport ?? server.transport(), key: 'OrderID', fields: ORDER_FIELDS, versionField: 'version' });
  const events: DataSourceEvent<Tuple>[] = [];
  const writes: WriteStateEvent[] = [];
  source.subscribe((e) => events.push(e as DataSourceEvent<Tuple>));
  source.subscribeWriteState((e) => writes.push(e));
  return { server, source, events, writes };
}

function writeRequest(init: Partial<WriteRequest<Tuple>>): WriteRequest<Tuple> {
  return { version: 1, added: [], changed: [], deleted: [], mode: 'batch', signal: signal(), ...init };
}

const change = (row: Tuple, field: (typeof ORDER_FIELDS)[number], value: unknown) => ({
  rowId: idOf(row),
  row: set(row, field, value),
  previous: row,
  changedColumnIds: [field],
});

describe('optimistic writes', () => {
  it('success: applies immediately, marks pending, reconciles with the server echo', async () => {
    const { server, source, events, writes } = setup();
    const page = await source.read(request(query({ paging: { page: 1, pageSize: 10 } })));
    const row = page.rows[0] as Tuple;
    const pending = source.write(writeRequest({ mode: 'cell', changed: [change(row, 'Freight', 5)] }));

    assert.equal(events.length, 1, 'optimistic patch emitted synchronously');
    assert.deepEqual(events[0], { type: 'patch', rows: source.getRows(), updated: ['10248'], added: [], removed: [] });
    assert.equal((source.getRows()[0] as Tuple)[F('Freight')], 5);
    assert.deepEqual(writes[0], { rows: ['10248'], cells: ['10248:Freight'] });
    assert.deepEqual([...source.getWriteState().pending], ['10248']);

    const result = await pending;
    assert.equal(result.status, 'applied');
    assert.equal(result.changed?.[0]?.row[F('version')], 2, 'server echo carries the new version');
    assert.equal(events.length, 2);
    assert.deepEqual((events[1] as unknown as { updated: string[] }).updated, ['10248'], 'only the written row is notified');
    assert.equal(source.getWriteState().pending.size, 0);
    assert.deepEqual(writes[1], { rows: ['10248'], cells: ['10248:Freight'] });
    assert.equal(server.rows()[0]!['Freight'], 5);
  });

  it('partial failure: rolls back rejected rows, keeps applied ones, reports cell errors', async () => {
    const { source, events, writes } = setup();
    const page = await source.read(request(query({ paging: { page: 1, pageSize: 10 } })));
    const [r0, r1, r2] = page.rows as Tuple[];
    const added = set(set(r0!, 'OrderID', null), 'Freight', 1);
    const result = await source.write(
      writeRequest({
        added: [{ tempId: 'tmp-1', row: added }],
        changed: [change(r0!, 'Freight', 7), change(r1!, 'Freight', -1)],
        deleted: [{ rowId: idOf(r2!), row: r2! }],
      }),
    );
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.cellErrors, { '10249:Freight': ['Freight must be >= 0'] });
    assert.deepEqual(result.deleted, ['10250']);
    assert.equal(result.added?.[0]?.tempId, 'tmp-1');
    assert.equal(result.added?.[0]?.row[0], 'k1', 'temp id reconciled to the server key');

    const rows = source.getRows() as Tuple[];
    assert.equal(rows.find((r) => r[0] === 10248)![F('Freight')], 7);
    assert.equal(rows.find((r) => r[0] === 10249)![F('Freight')], r1![F('Freight')], 'rejected change rolled back to previous');
    assert.equal(rows.some((r) => r[0] === 10250), false);
    assert.equal(rows.at(-1)![0], 'k1');
    assert.equal(rows.length, 10);
    assert.equal(events.at(-1)!.type, 'reset', 'structural change (add/remove) resets');

    const state = source.getWriteState();
    assert.deepEqual(state.cellErrors, { '10249:Freight': ['Freight must be >= 0'] });
    assert.equal(state.pending.size, 0);
    const last = writes.at(-1)!;
    assert.deepEqual([...last.rows].sort(), ['10248', '10249', '10250', 'tmp-1']);
    assert.deepEqual([...last.cells].sort(), ['10248:Freight', '10249:Freight']);
  });

  it('conflict: publishes a snapshot, rolls back, and the review produces a follow-up write', async () => {
    const { server, source } = setup();
    const page = await source.read(request(query({ paging: { page: 1, pageSize: 10 } })));
    const row = page.rows[3] as Tuple;
    // Another client changes the row first.
    server.handle({ v: 1, id: 'x', write: { fields: ['OrderID', 'Freight'], added: [], changed: [{ key: 10251, set: { Freight: 99 } }], removed: [] } } satisfies WireWriteRequest);

    const result = await source.write(writeRequest({ changed: [change(row, 'Freight', 1)] }));
    assert.equal(result.status, 'rejected');
    const conflict = result.conflicts![0]!;
    assert.equal(conflict.rowId, '10251');
    assert.equal(conflict.version, '2');
    assert.deepEqual(conflict.cells, [{ columnId: 'Freight', local: 1, server: 99 }]);
    assert.equal(conflict.base, row);
    assert.equal((source.getRows()[3] as Tuple)[F('Freight')], row[F('Freight')]);
    assert.equal(source.getWriteState().conflicts.length, 1);

    let review = createConflictReview(result.conflicts!);
    assert.equal(review.choices['10251:Freight'], 'defer');
    review = setConflictChoice(review, '10251', 'keepLocal');
    const followUp = resolveConflicts(review, { version: 2, signal: signal(), setValue: (r, columnId, v) => set(r, columnId as 'Freight', v) });
    assert.equal(followUp.changed.length, 1);
    assert.equal(followUp.changed[0]!.previous[F('version')], 2, 'expected version is the server version');
    const retry = await source.write(followUp);
    assert.equal(retry.status, 'applied');
    assert.equal(server.rows()[3]!['Freight'], 1);
    assert.equal(source.getWriteState().conflicts.length, 0);
  });

  it('transport failure rolls everything back and rethrows', async () => {
    const { transport, calls } = manualTransport(orderServer());
    const { source, events } = setup(transport);
    const read = source.read(request(query({ paging: { page: 1, pageSize: 5 } })));
    await settle();
    calls[0]!.resolve();
    const page = await read;
    const before = source.getRows();
    const pending = source.write(writeRequest({ changed: [change(page.rows[0] as Tuple, 'Freight', 3)] }));
    await settle();
    calls[1]!.reject(new TypeError('offline'));
    await assert.rejects(pending, TypeError);
    assert.equal(source.getRows(), before);
    assert.equal(events.at(-1)!.type, 'reset');
    assert.equal(source.getWriteState().pending.size, 0);
  });
});

describe('pessimistic writes', () => {
  it('keeps rows untouched until applied, then patches with the echo', async () => {
    const { source, events } = setup();
    const page = await source.read(request(query({ paging: { page: 1, pageSize: 10 } })));
    const pending = source.write(writeRequest({ mode: 'dialog', changed: [change(page.rows[1] as Tuple, 'ShipCity', 'Paris')] }));
    assert.equal(events.length, 0);
    assert.equal(source.getWriteState().pending.size, 0);
    const result = await pending;
    assert.equal(result.status, 'applied');
    assert.deepEqual((events[0] as unknown as { updated: string[] }).updated, ['10249']);
    assert.equal((source.getRows()[1] as Tuple)[F('ShipCity')], 'Paris');
  });

  it('sends one request per batch submit with field-level changes and expected versions', async () => {
    const sent: WireWriteRequest[] = [];
    const server = orderServer();
    const { source } = setup(async (req) => {
      sent.push(req as WireWriteRequest);
      return JSON.parse(JSON.stringify(server.handle(req)));
    });
    const page = await source.read(request(query({ paging: { page: 1, pageSize: 3 } })));
    const [a, b] = page.rows as Tuple[];
    await source.write(writeRequest({ changed: [change(a!, 'Freight', 1), change(b!, 'ShipName', 'X')], deleted: [] }));
    const w = sent.at(-1)!.write;
    assert.deepEqual(w.changed, [
      { key: 10248, set: { Freight: 1 }, version: '1' },
      { key: 10249, set: { ShipName: 'X' }, version: '1' },
    ]);
    assert.equal(sent.length, 2, 'one read + one write');
  });
});
