// Remote pivot conformance: on equal data, the remote result (createJsonPivotSource ->
// createPivotQueryHandler running createPivotEngine) equals the local engine
// result to the last digit, header for header and cell for cell, and an
// export over the remote engine equals the export of the local result.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computePivot, createPivotEngine, type PivotModelInput, type PivotResult } from '@salmonui/pivot-table/engine';
import { createJsonPivotSource, type RemotePivotResult } from '@salmonui/data';
import { createPivotQueryHandler } from '@salmonui/data/server';
import { exportPivot, streamPivotCsv } from '@salmonui/export/pivot';
import { orders } from './helpers.ts';

const data = orders(600).map((o) => ({ ...o, Units: 1 + (o.OrderID % 17), Year: o.OrderDate.getUTCFullYear() + (o.OrderID % 3) })) as unknown as Record<string, unknown>[];

const MODELS: Record<string, PivotModelInput> = {
  'two row levels, one column field, sum and count, all expanded': {
    rows: [{ field: 'ShipCountry' }, { field: 'ShipCity' }],
    columns: [{ field: 'CustomerID' }],
    values: [
      { field: 'Freight', aggregate: 'sum' },
      { field: 'Units', aggregate: 'count' },
    ],
    expanded: 'all',
  },
  'collapsed members, average and stdev, values on rows': {
    rows: [{ field: 'ShipCountry' }, { field: 'EmployeeID' }],
    columns: [{ field: 'Year' }],
    values: [
      { field: 'Freight', aggregate: 'average' },
      { field: 'Freight', aggregate: 'sampleStdev', caption: 'Stdev' },
    ],
    expanded: [['rows', 'France']],
    valuesPlacement: { axis: 'rows', index: -1 },
  },
  'show values as, a calculated field, member filter and sorts': {
    rows: [{ field: 'ShipCountry' }],
    columns: [{ field: 'Verified' }],
    values: [
      { field: 'Freight', aggregate: 'sum', showAs: { kind: 'percentOfGrandTotal' } },
      { field: 'Units', aggregate: 'sum', showAs: { kind: 'runningTotal', baseField: 'ShipCountry' } },
      { field: 'PerUnit', aggregate: 'sum' },
    ],
    calculatedFields: [{ name: 'PerUnit', formula: '"Sum(Freight)" / "Sum(Units)"' }],
    filterBy: { ShipCountry: { exclude: ['USA'] } },
    sort: { ShipCountry: 'desc' },
    totals: { grand: 'both', grandPosition: 'start', sub: true, subPosition: 'auto' },
  },
};

function compare(remote: RemotePivotResult, local: PivotResult, label: string): void {
  assert.equal(remote.rowCount, local.rowCount, `${label}: rowCount`);
  assert.equal(remote.columnCount, local.columnCount, `${label}: columnCount`);
  assert.equal(remote.rowDepth, local.rowDepth, `${label}: rowDepth`);
  assert.equal(remote.columnDepth, local.columnDepth, `${label}: columnDepth`);
  for (const axis of ['rows', 'columns'] as const) {
    const count = axis === 'rows' ? local.rowCount : local.columnCount;
    for (let i = 0; i < count; i++) {
      const a = remote.memberAt(axis, i);
      const b = local.memberAt(axis, i);
      assert.deepEqual(
        { key: a.key, kind: a.kind, path: a.path, label: a.label, depth: a.depth, position: a.position, span: a.span, field: a.field, measure: a.measure },
        { key: b.key, kind: b.kind, path: b.path, label: b.label, depth: b.depth, position: b.position, span: b.span, field: b.field, measure: b.measure },
        `${label}: ${axis} ${i}`,
      );
    }
  }
  for (let r = 0; r < local.rowCount; r++) {
    for (let c = 0; c < local.columnCount; c++) {
      const expected = local.valueAt(r, c);
      const actual = remote.valueAt(r, c);
      assert.ok(Object.is(actual, expected === null || Number.isFinite(expected) ? expected : null), `${label}: cell ${r},${c}: ${actual} !== ${expected}`);
      const a = remote.cellAt(r, c);
      const b = local.cellAt(r, c);
      assert.deepEqual([a.kind, a.measure, a.rowKey, a.columnKey, a.formattedValue], [b.kind, b.measure, b.rowKey, b.columnKey, b.formattedValue], `${label}: cell ${r},${c}`);
    }
  }
}

describe('remote pivot conformance', () => {
  for (const [name, model] of Object.entries(MODELS)) {
    it(`equals the local engine to the last digit: ${name}`, async () => {
      const local = computePivot({ data, model });
      const handler = createPivotQueryHandler(data, { engine: createPivotEngine });
      const engine = createJsonPivotSource({ transport: handler.transport() }).createEngine({ model: model as never, window: { rows: [0, 25], columns: [0, 7] }, overscan: { rows: 0, columns: 0 } });
      await engine.refresh();
      // Scroll through the whole result window by window (cells-only requests inside held headers).
      for (let r = 0; r < local.rowCount; r += 25) for (let c = 0; c < local.columnCount; c += 7) await engine.setWindow({ rows: [r, r + 25], columns: [c, c + 7] });
      await engine.setWindow({ rows: [0, local.rowCount], columns: [0, local.columnCount] });
      compare(engine.getSnapshot(), local, name);
      // Tree nodes match the local tree (all windows loaded).
      assert.deepEqual(engine.getSnapshot().rowTree.map((n) => n.key), local.rowTree.map((n) => n.key));
      assert.deepEqual(engine.getSnapshot().columnTree.map((n) => n.key), local.columnTree.map((n) => n.key));
      // Drill through: the same raw rows behind a cell.
      const r = Math.min(1, local.rowCount - 1);
      const c = Math.min(1, local.columnCount - 1);
      const page = await engine.drillThrough(r, c, { page: { offset: 0, limit: 10_000 }, select: ['OrderID'] });
      assert.deepEqual(page.rows.map((row) => row['OrderID']).sort(), local.rowsAt(r, c).map((i) => data[i]?.['OrderID']).sort());
    });
  }

  it('members of a pivot field over the facet request equal the engine members (keys, labels, counts)', async () => {
    const handler = createPivotQueryHandler(data, { engine: createPivotEngine });
    const remote = createJsonPivotSource({ transport: handler.transport() }).createEngine({ model: { rows: [{ field: 'ShipCountry' }], values: [{ field: 'Freight', aggregate: 'sum' }] } });
    const local = createPivotEngine({ data });
    for (const field of ['ShipCountry', 'EmployeeID', 'CustomerID']) {
      const a = (await remote.getMembers(field)).map((m) => [m.key, m.label, m.count]);
      const b = local.getMembers(field).map((m) => [m.key, m.label, m.count]);
      const order = (x: unknown[][]): unknown[][] => [...x].sort((p, q) => String(p[0]).localeCompare(String(q[0])));
      assert.deepEqual(order(a), order(b), field);
    }
  });

  it('a drill is a new model.expanded and matches the local engine after expand and collapse', async () => {
    const model = MODELS['collapsed members, average and stdev, values on rows'] as PivotModelInput;
    const handler = createPivotQueryHandler(data, { engine: createPivotEngine });
    const engine = createJsonPivotSource({ transport: handler.transport() }).createEngine({ model: model as never, window: { rows: [0, 500], columns: [0, 50] } });
    await engine.refresh();
    await engine.expand(['rows', 'Germany']);
    await engine.collapse(['rows', 'France']);
    assert.deepEqual(engine.getModel().expanded, [['rows', 'Germany']]);
    // The server engine drills incrementally; compare with a local engine that took the same steps.
    const local = createPivotEngine({ data, model });
    local.setModel({ ...model, expanded: [['rows', 'France'], ['rows', 'Germany']] });
    compare(engine.getSnapshot(), local.setModel({ ...model, expanded: [['rows', 'Germany']] }), 'after drill');
  });
});

describe('remote pivot export', () => {
  it('exportPivot over the remote engine equals the export of the local result; CSV streams by row windows', async () => {
    const model = MODELS['two row levels, one column field, sum and count, all expanded'] as PivotModelInput;
    const local = computePivot({ data, model });
    const handler = createPivotQueryHandler(data, { engine: createPivotEngine });
    const requests: unknown[] = [];
    const inner = handler.transport();
    const engine = createJsonPivotSource({
      transport: (request, ctx) => {
        requests.push(request);
        return inner(request, ctx);
      },
    }).createEngine({ model: model as never });
    const remoteFile = await exportPivot(engine, { format: 'xlsx', windowCells: local.columnCount * 20, xlsx: { compress: false } });
    const localFile = await exportPivot(local, { format: 'xlsx', xlsx: { compress: false } });
    assert.ok(remoteFile && localFile);
    assert.ok(requests.length >= Math.ceil(local.rowCount / 20), 'paged by row windows');
    const sheet = (bytes: Uint8Array): string => {
      const text = new TextDecoder().decode(bytes);
      return /<sheetData>[\s\S]*<\/sheetData>/.exec(text)?.[0] ?? '';
    };
    assert.equal(sheet(remoteFile.data), sheet(localFile.data));
    let csv = '';
    for await (const chunk of streamPivotCsv(engine, { windowCells: local.columnCount * 20, values: 'raw' })) csv += chunk;
    const whole = await exportPivot(local, { format: 'csv', csv: { values: 'raw' } });
    assert.equal(csv, whole?.data);
    // Server-side export from the handler's compute().
    const server = await exportPivot(handler.compute(model), { format: 'csv', csv: { values: 'raw' } });
    assert.equal(server?.data, whole?.data);
  });
});
