// The `pivot` request kind: wire model, windows and header reuse, drill-through pages,
// member lists over `facet`, service hooks, aborts, and the reference
// handler's `compute()`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createJsonPivotSource,
  ProtocolError,
  RequestCanceledError,
  toWirePivotModel,
  wirePivotModelKey,
  type FetchLike,
  type PivotJsonTransport,
  type WirePivotRequest,
  type WireReadRequest,
  type WireAnyRequest,
} from '@salmonui/data';
import { createPivotQueryHandler } from '@salmonui/data/server';
import { orders } from './helpers.ts';
import { fakePivotEngine } from './pivot-fake-engine.ts';

const rows = orders(120) as unknown as Record<string, unknown>[];
const model = { rows: [{ field: 'ShipCountry' }], columns: [{ field: 'CustomerID' }], values: [{ field: 'Freight', aggregate: 'sum' }] };

function server() {
  const handler = createPivotQueryHandler(rows, { engine: fakePivotEngine, key: 'OrderID' });
  const sent: WireAnyRequest[] = [];
  const inner = handler.transport();
  const transport: PivotJsonTransport = (request, ctx) => {
    sent.push(request);
    return inner(request, ctx);
  };
  return { handler, sent, transport };
}

const pivots = (sent: readonly WireAnyRequest[]): WirePivotRequest[] => sent.filter((r): r is WirePivotRequest => 'pivot' in r);

describe('pivot wire model', () => {
  it('omits defaults and client-only parts, with a canonical key order', () => {
    const wire = toWirePivotModel({
      ...model,
      filters: [],
      expanded: [],
      totals: { grand: 'both', grandPosition: 'end', sub: true, subPosition: 'auto' } as never,
      formats: { Freight: { number: { style: 'currency', currency: 'EUR' } } },
      conditionalFormats: [{ operator: 'greaterThan', value: 1 }],
      calculatedFields: [{ name: 'avg', formula: 'Sum(Freight)/Count(Freight)', format: { number: {} } }],
    });
    assert.deepEqual(Object.keys(wire), ['calculatedFields', 'columns', 'rows', 'values']);
    assert.deepEqual(wire.calculatedFields, [{ name: 'avg', formula: 'Sum(Freight)/Count(Freight)' }]);
    assert.equal(wirePivotModelKey({ values: model.values, rows: model.rows, columns: model.columns }), wirePivotModelKey({ ...model, showEmptyMembers: false }));
  });

  it('rejects a custom aggregator with pivot/unsupported-aggregate before sending', async () => {
    const { transport, sent } = server();
    const source = createJsonPivotSource({ transport });
    const custom = { ...model, values: [{ field: 'Freight', aggregate: 'custom', customId: 'p90' }] };
    await assert.rejects(source.query({ model: custom, window: { rows: [0, 10], columns: [0, 10] } }), (e: unknown) => e instanceof ProtocolError && e.code === 'pivot/unsupported-aggregate');
    const engine = source.createEngine({ model });
    await assert.rejects(engine.setModel(custom), (e: unknown) => e instanceof ProtocolError && e.code === 'pivot/unsupported-aggregate');
    assert.throws(() => toWirePivotModel({ values: [{ field: 'x', aggregate: ((a: number) => a) as never }] }), /client-side aggregator/);
    assert.equal(sent.length, 0);
  });
});

describe('pivot windows', () => {
  it('loads a window with headers and cells, then scrolls inside the held headers with headers: false', async () => {
    const { transport, sent, handler } = server();
    const source = createJsonPivotSource({ transport });
    const engine = source.createEngine({ model, window: { rows: [0, 3], columns: [0, 2] }, overscan: { rows: 0, columns: 0 } });
    let notified = 0;
    engine.subscribe(() => notified++);
    const first = await engine.refresh();
    const full = handler.compute(model);
    assert.equal(first.rowCount, full.rowCount);
    assert.equal(first.columnCount, full.columnCount);
    assert.equal(first.memberAt('rows', 1).label, full.memberAt('rows', 1).label);
    assert.equal(first.valueAt(1, 1), full.valueAt(1, 1));
    assert.equal(first.isLoaded(5, 5), false);
    assert.equal(first.valueAt(5, 5), null);
    assert.equal(first.memberAt('rows', 5).key, '');
    assert.ok(notified >= 2, 'computing and ready are published');
    assert.equal(engine.getStatus(), 'ready');

    // Inside the held header range: cells only.
    await engine.setWindow({ rows: [1, 2], columns: [0, 1] });
    assert.equal(pivots(sent).length, 1, 'a loaded block is not requested again');
    await engine.setWindow({ rows: [3, full.rowCount], columns: [0, 2] });
    const last = pivots(sent).at(-1) as WirePivotRequest;
    assert.equal(last.pivot.headers, undefined, 'new rows need their headers');
    await engine.setWindow({ rows: [0, full.rowCount], columns: [0, 2] });
    assert.equal((pivots(sent).at(-1) as WirePivotRequest).pivot.headers, false);
    const snap = engine.getSnapshot();
    for (let r = 0; r < full.rowCount; r++) for (let c = 0; c < 2; c++) assert.equal(snap.valueAt(r, c), full.valueAt(r, c));
    const cell = snap.cellAt(full.rowCount - 1, 0);
    assert.equal(cell.kind, 'grandTotal');
    assert.equal(cell.measure, 'Freight');
    assert.equal(cell.rowKey, '');
    assert.equal(snap.rowTree.length, full.rowCount);
  });

  it('loadWindow inside the held result sends no request; outside it, or during a reload, it queries', async () => {
    const { transport, sent, handler } = server();
    const engine = createJsonPivotSource({ transport }).createEngine({ model, window: { rows: [0, 4], columns: [0, 3] }, overscan: { rows: 0, columns: 0 } });
    await engine.refresh();
    assert.equal(pivots(sent).length, 1);
    const full = handler.compute(model);
    const held = await engine.loadWindow({ rows: [0, 1], columns: [0, 3] });
    const block = await engine.loadWindow({ rows: [1, 4], columns: [1, 2] });
    assert.equal(pivots(sent).length, 1, 'served from the refresh result');
    assert.equal(held.memberAt('columns', 2).label, full.memberAt('columns', 2).label);
    assert.equal(block.valueAt(3, 1), full.valueAt(3, 1));
    await engine.loadWindow({ rows: [4, 6], columns: [0, 3] });
    assert.equal(pivots(sent).length, 2, 'rows beyond the held block are queried');
    const reload = engine.setModel({ ...model, values: [{ field: 'Freight', aggregate: 'max' }] } as never);
    await engine.loadWindow({ rows: [0, 1], columns: [0, 3] });
    assert.ok(pivots(sent).length >= 4, 'a reload in flight is not served from the old result');
    await reload;
  });

  it('a changed server result while scrolling with headers: false reloads the headers', async () => {
    const { transport, sent, handler } = server();
    const engine = createJsonPivotSource({ transport }).createEngine({ model, window: { rows: [0, 4], columns: [0, 1] }, overscan: { rows: 0, columns: 0 } });
    const before = await engine.refresh();
    await engine.setWindow({ rows: [0, 4], columns: [1, 3] });
    handler.setRows(rows.slice(0, 40));
    const count = pivots(sent).length;
    await engine.setWindow({ rows: [0, 4], columns: [0, 3] });
    assert.equal(pivots(sent)[count]?.pivot.headers, false);
    const after = engine.getSnapshot();
    assert.notEqual(after.resultVersion, before.resultVersion);
    assert.equal(after.valueAt(0, 0), handler.compute(model).valueAt(0, 0));
    assert.equal((pivots(sent).at(-1) as WirePivotRequest).pivot.headers, undefined);
  });

  it('a new model aborts its predecessor; expand and collapse edit model.expanded', async () => {
    const { handler } = server();
    const inner = handler.transport();
    const aborted: string[] = [];
    const transport: PivotJsonTransport = (request, ctx) =>
      new Promise((resolve, reject) => {
        ctx.signal.addEventListener('abort', () => {
          aborted.push(request.id);
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
        setTimeout(() => void inner(request, ctx).then(resolve, reject), 5);
      });
    const engine = createJsonPivotSource({ transport }).createEngine({ model });
    const a = engine.setModel(model);
    const b = engine.setModel({ ...model, expanded: [['rows', 'France']] });
    await Promise.all([a, b]);
    assert.equal(aborted.length, 1);
    assert.deepEqual(engine.getModel().expanded, [['rows', 'France']]);
    await engine.expand(['rows', 'Germany']);
    await engine.collapse(['rows', 'France']);
    assert.deepEqual(engine.getModel().expanded, [['rows', 'Germany']]);
    await engine.collapseAll('rows');
    assert.deepEqual(engine.getModel().expanded, []);
    await engine.expandAll();
    assert.equal(engine.getModel().expanded, 'all');
  });

  it('a too large window is a protocol error', async () => {
    const handler = createPivotQueryHandler(rows, { engine: fakePivotEngine, maxCells: 4 });
    const source = createJsonPivotSource({ transport: handler.transport() });
    await assert.rejects(source.query({ model, window: { rows: [0, 10], columns: [0, 10] } }), (e: unknown) => e instanceof ProtocolError && e.code === 'pivot/window-too-large');
  });
});

describe('pivot drill through and members', () => {
  it('drill through returns paged raw rows as tuples, decoded to objects with dates', async () => {
    const { transport, handler } = server();
    const engine = createJsonPivotSource({ transport }).createEngine({ model });
    const snap = await engine.refresh();
    const full = handler.compute(model);
    const expected = full.rowsAt(0, 0);
    const page = await engine.drillThrough(0, 0, { page: { offset: 0, limit: 2 } });
    assert.equal(page.total, expected.length);
    assert.equal(page.rows.length, Math.min(2, expected.length));
    assert.equal(page.rows[0]?.['OrderID'], rows[expected[0] as number]?.['OrderID']);
    assert.ok(page.rows[0]?.['OrderDate'] instanceof Date);
    assert.equal(snap.rowsAt(0, 0).length, 0, 'raw rows stay on the server');
    const select = await engine.drillThrough(snap.rowCount - 1, snap.columnCount - 1, { select: ['OrderID'] });
    assert.equal(select.total, rows.length);
    assert.deepEqual(select.fields, ['OrderID']);
  });

  it('members come from the facet request, filtered by the other fields', async () => {
    const { transport, sent } = server();
    const source = createJsonPivotSource({ transport });
    const engine = source.createEngine({ model: { ...model, filterBy: { CustomerID: { include: ['VINET'] } } } as never });
    const members = await engine.getMembers('ShipCountry');
    const facet = sent.find((r): r is WireReadRequest => 'facet' in r && (r as WireReadRequest).facet !== undefined) as WireReadRequest;
    assert.deepEqual(facet.query.where, { field: 'CustomerID', op: 'in', value: ['VINET'] });
    const expected = new Map<string, number>();
    for (const r of rows) if (r['CustomerID'] === 'VINET') expected.set(String(r['ShipCountry']), (expected.get(String(r['ShipCountry'])) ?? 0) + 1);
    assert.deepEqual(new Map(members.map((m) => [m.key as string, m.count])), expected);
    const ids = await source.members('EmployeeID', { limit: 3 });
    assert.equal(ids.members.length, 3);
    assert.equal(typeof ids.members[0]?.key, 'number', 'keys typed by the field wire type');
    assert.equal(ids.complete, false);
  });
});

describe('service hooks', () => {
  it('headers travel on every pivot POST, onRequest sees kind pivot and can cancel, onResponse can replace', async () => {
    const handler = createPivotQueryHandler(rows, { engine: fakePivotEngine });
    const seen: { headers: Record<string, string>; body: unknown }[] = [];
    let token = 'a';
    const fetch: FetchLike = async (_url, init = {}) => {
      seen.push({ headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      const body = handler.handle(JSON.parse(String(init.body)));
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)), text: async () => '' };
    };
    const kinds: string[] = [];
    let cancel = false;
    const source = createJsonPivotSource({
      url: '/pivot',
      fetch,
      batch: false,
      headers: () => ({ authorization: `Bearer ${token}` }),
      onRequest: (e) => {
        kinds.push(e.kind);
        return cancel ? false : undefined;
      },
      onResponse: (e) => ('pivot' in e.request && e.response && 'rowCount' in e.response ? { ...e.response, rowCount: 999 } : undefined),
    });
    const r = await source.query({ model, window: { rows: [0, 2], columns: [0, 2] } });
    assert.equal(r.rowCount, 999);
    token = 'b';
    await source.members('ShipCountry');
    assert.deepEqual(seen.map((s) => s.headers['authorization']), ['Bearer a', 'Bearer b', 'Bearer b']);
    assert.deepEqual(kinds, ['pivot', 'facet', 'facet']);
    cancel = true;
    await assert.rejects(source.query({ model, window: { rows: [0, 1], columns: [0, 1] } }), RequestCanceledError);
  });

  it('a custom transport sees and may rewrite the pivot payload', async () => {
    const handler = createPivotQueryHandler(rows, { engine: fakePivotEngine });
    const inner = handler.transport();
    const source = createJsonPivotSource({
      transport: (request, ctx) => inner('pivot' in request ? { ...request, pivot: { ...request.pivot, where: { field: 'ShipCountry', op: 'equal', value: 'France' } } } : request, ctx),
    });
    const r = await source.query({ model, window: { rows: [0, 10], columns: [0, 1] } });
    assert.equal(r.rowCount, 2, 'France and the grand total');
  });
});

describe('reference handler', () => {
  it('answers batches mixing pivot and read, applies where, and compute() returns the whole result', () => {
    const handler = createPivotQueryHandler(rows, { engine: fakePivotEngine, key: 'OrderID' });
    const where = { field: 'ShipCountry', op: 'equal', value: 'France' } as const;
    const res = handler.handle({
      v: 1,
      batch: [
        { v: 1, id: 'a', pivot: { model, where, window: { rows: [0, 5], columns: [0, 5] } } },
        { v: 1, id: 'b', query: { where, page: { offset: 0, limit: 1 } } },
      ],
    }) as { batch: { id: string; rowCount?: number; total?: number; rowHeaders?: unknown[] }[] };
    assert.equal(res.batch[0]?.rowCount, 2);
    assert.equal(res.batch[0]?.rowHeaders?.length, 2);
    assert.equal(res.batch[1]?.total, rows.filter((r) => r['ShipCountry'] === 'France').length);
    const all = handler.compute(model, { where });
    assert.equal(all.rowCount, 2);
    const write = handler.handle({ v: 1, id: 'w', write: { fields: ['OrderID', 'Freight'], added: [], changed: [{ key: rows[0]?.['OrderID'] as number, set: { Freight: 1000 } }], removed: [] } }) as { ok?: unknown[] };
    assert.equal(write.ok?.length, 1);
    assert.equal(handler.rows().find((r) => r['OrderID'] === rows[0]?.['OrderID'])?.['Freight'], 1000);
  });
});
