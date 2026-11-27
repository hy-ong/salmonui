// Offset, cursor, and infinite (block) paging; lazy groups, tree children, facets.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createJsonDataSource,
  CursorUnknownError,
  type GroupedRowEnvelope,
  type TreeLoadResult,
  type JsonTransport,
  type WireReadRequest,
} from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { ORDER_FIELDS, orderServer, query, request } from './helpers.ts';

function recording(server = orderServer()): { transport: JsonTransport; sent: WireReadRequest[] } {
  const sent: WireReadRequest[] = [];
  return {
    sent,
    transport: async (req) => {
      sent.push(req as WireReadRequest);
      return JSON.parse(JSON.stringify(server.handle(req)));
    },
  };
}

const firstId = (rows: readonly unknown[]): unknown => (rows[0] as unknown[])[0];

describe('cursor paging', () => {
  it('forwards the cursor of page n to page n+1 and rejects unknown jumps (cursorUnknown)', async () => {
    const { transport, sent } = recording();
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, paging: { kind: 'cursor' } });
    const q = (page: number) => query({ paging: { page, pageSize: 50 } });
    const p1 = await source.read(request(q(1)));
    assert.deepEqual(sent[0]!.query.page, { cursor: null, limit: 50 });
    assert.equal(p1.pageInfo?.endCursor, 'o:50');
    const p2 = await source.read(request(q(2)));
    assert.deepEqual(sent[1]!.query.page, { cursor: 'o:50', limit: 50 });
    assert.equal(firstId(p2.rows), 10298);
    await assert.rejects(source.read(request(q(4))), (e: unknown) => e instanceof CursorUnknownError && e.reason === 'cursorUnknown');
    // A new structural query (filter) starts a fresh chain.
    const filtered = query({ paging: { page: 2, pageSize: 50 }, sorting: [{ columnId: 'Freight', direction: 'asc' }] });
    await assert.rejects(source.read(request(filtered)), CursorUnknownError);
    assert.equal(source.capabilities.cursor, true);
  });

  it('reports the last page without a next cursor', async () => {
    const { transport } = recording(orderServer(60));
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, paging: { kind: 'cursor' } });
    await source.read(request(query({ paging: { page: 1, pageSize: 50 } })));
    const last = await source.read(request(query({ paging: { page: 2, pageSize: 50 } })));
    assert.equal(last.rows.length, 10);
    assert.equal(last.pageInfo?.hasNextPage, false);
    assert.equal(last.pageInfo?.endCursor, null);
  });

  it('reports startCursor from the response prev cursor', async () => {
    const server = orderServer(120);
    const transport: JsonTransport = async (req) => {
      const response = JSON.parse(JSON.stringify(server.handle(req))) as Record<string, unknown>;
      const cursor = (req as WireReadRequest).query.page as { cursor?: string | null } | undefined;
      return (cursor?.cursor ? { ...response, prev: `before:${cursor.cursor}` } : response) as never;
    };
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, paging: { kind: 'cursor' } });
    const first = await source.read(request(query({ paging: { page: 1, pageSize: 50 } })));
    assert.equal(first.pageInfo?.startCursor, null);
    assert.equal(first.pageInfo?.hasPreviousPage, false);
    const second = await source.read(request(query({ paging: { page: 2, pageSize: 50 } })));
    assert.equal(second.pageInfo?.startCursor, `before:${first.pageInfo?.endCursor}`);
    assert.equal(second.pageInfo?.hasPreviousPage, true);
  });
});

describe('infinite scroll blocks', () => {
  it('appends blocks for a range past the loaded end without dropping loaded rows', async () => {
    const { transport, sent } = recording();
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, paging: { kind: 'infinite', blockSize: 40 } });
    const q = query({ sorting: [{ columnId: 'OrderID', direction: 'asc' }] });
    const first = await source.read(request(q));
    assert.equal(first.rows.length, 40);
    assert.equal(first.pageInfo?.hasNextPage, true);
    const second = await source.read(request(q, { range: { start: 40, end: 80 } }));
    assert.equal(second.rows.length, 80, 'rows 0..80');
    assert.equal(firstId(second.rows), 10248);
    assert.equal(sent.length, 2, 'block 0 not refetched');
    assert.deepEqual(sent[1]!.query.page, { offset: 40, limit: 40 });
    // Initial blocks: a wide range loads several blocks at once.
    const wide = await source.read(request(q, { range: { start: 0, end: 200 } }));
    assert.equal(wide.rows.length, 200);
    assert.equal(sent.length, 5);
    const end = await source.read(request(q, { range: { start: 200, end: 260 } }));
    assert.equal(end.rows.length, 240);
    assert.equal(end.pageInfo?.hasNextPage, false, 'canLoadNextPage is false at the end');
    assert.equal(sent.length, 6, 'no block requested past totalRowCount');
  });

  it('evicts the farthest block beyond maxBlocks and reports rowOffset', async () => {
    const { transport } = recording();
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, paging: { kind: 'infinite', blockSize: 40, maxBlocks: 2 } });
    const q = query();
    await source.read(request(q));
    await source.read(request(q, { range: { start: 40, end: 80 } }));
    const third = await source.read(request(q, { range: { start: 80, end: 120 } }));
    assert.equal(third.rows.length, 80);
    assert.equal(third.rowOffset, 40);
    assert.equal(firstId(third.rows), 10288);
  });

  it('cursor strategy walks blocks in order', async () => {
    const { transport, sent } = recording();
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, paging: { kind: 'infinite', blockSize: 100, strategy: 'cursor' } });
    const q = query();
    await source.read(request(q));
    const more = await source.read(request(q, { range: { start: 100, end: 200 } }));
    assert.equal(more.rows.length, 200);
    assert.deepEqual(sent.map((r) => r.query.page), [{ cursor: null, limit: 100 }, { cursor: 'o:100', limit: 100 }]);
    const fresh = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, paging: { kind: 'infinite', blockSize: 100, strategy: 'cursor' } });
    await assert.rejects(fresh.read(request(q, { range: { start: 200, end: 300 } })), CursorUnknownError);
  });
});

describe('lazy group loading (request/response envelopes)', () => {
  it('loads the root level as group envelopes, then a group’s children with per-group paging', async () => {
    const { transport, sent } = recording();
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS });
    const q = query({ grouping: [{ columnId: 'ShipCountry' }, { columnId: 'ShipCity' }], aggregates: [{ columnId: 'Freight', type: 'sum', placement: ['groupCaption'] }] });
    const root = await source.read(request(q, { groupPath: [] }));
    const groups = root.rows as unknown as GroupedRowEnvelope<unknown>[];
    assert.ok(groups.length > 1);
    assert.equal(groups.reduce((n, g) => n + g.count, 0), 240);
    const france = groups.find((g) => g.key === 'France')!;
    assert.equal(france.kind, 'group');
    assert.equal(france.columnId, 'ShipCountry');
    assert.deepEqual(france.groupPath, [{ columnId: 'ShipCountry', key: 'France' }]);
    assert.ok(typeof france.aggregates?.['Freight']?.['sum'] === 'number');
    assert.equal(france.items, undefined, 'lazy: no items');
    assert.deepEqual(sent[0]!.groupPath, []);

    const cities = await source.read(request(q, { groupPath: france.groupPath }));
    const lyon = (cities.rows as unknown as GroupedRowEnvelope<unknown>[]).find((g) => g.key === 'Lyon')!;
    assert.equal(lyon.columnId, 'ShipCity');
    const leaf = await source.read(request(q, { groupPath: lyon.groupPath, cursor: null, range: { start: 0, end: 5 } }));
    assert.equal(leaf.rows.length, 5);
    assert.ok((leaf.rows as unknown[][]).every((r) => r[ORDER_FIELDS.indexOf('ShipCity')] === 'Lyon'));
    assert.equal(leaf.pageInfo?.hasNextPage, lyon.count > 5);
    assert.ok(leaf.performed?.includes('group'));
  });

  it('a new main query aborts in-flight group loads', async () => {
    const pending: { signal: AbortSignal }[] = [];
    const source = createJsonDataSource({
      transport: (req, ctx) =>
        new Promise((resolve, reject) => {
          pending.push({ signal: ctx.signal as AbortSignal });
          (ctx.signal as AbortSignal).addEventListener('abort', () => reject(new DOMException('x', 'AbortError')));
          if ((req as WireReadRequest).groupPath === undefined) resolve(orderServer().handle(req) as never);
        }),
      key: 'OrderID',
      fields: ORDER_FIELDS,
    });
    const q = query({ grouping: [{ columnId: 'ShipCountry' }] });
    const group = source.read(request(q, { groupPath: [{ columnId: 'ShipCountry', key: 'France' }] }));
    await source.read(request(query({ grouping: [{ columnId: 'ShipCity' }] })));
    await assert.rejects(group, { name: 'AbortError' });
  });
});

describe('tree children and facets', () => {
  it('loads tree children with hasChildren from childCounts', async () => {
    const rows = [
      { id: 'a', parent: null, name: 'root' },
      { id: 'b', parent: 'a', name: 'child 1' },
      { id: 'c', parent: 'a', name: 'child 2' },
      { id: 'd', parent: 'b', name: 'grandchild' },
    ];
    const server = createJsonQueryHandler(rows, { key: 'id', parentField: 'parent' });
    const source = createJsonDataSource({ transport: server.transport(), key: 'id', fields: ['id', 'parent', 'name'] });
    const children = (await source.read(request(query(), { parentRowId: 'a' }))) as unknown as TreeLoadResult<unknown>;
    assert.deepEqual(
      children.rows.map((t) => [t.kind, (t.row as unknown[])[0], t.parentId, t.hasChildren]),
      [['tree', 'b', 'a', true], ['tree', 'c', 'a', false]],
    );
  });

  it('answers facet requests from other columns’ filters', async () => {
    const source = createJsonDataSource({ transport: orderServer().transport(), key: 'OrderID', fields: ORDER_FIELDS });
    const q = query({
      filters: [
        { columnId: 'ShipCountry', operator: 'equal', value: 'France', predicate: 'and', source: 'excel' },
        { columnId: 'ShipCity', operator: 'equal', value: 'Lyon', predicate: 'and', source: 'excel' },
      ],
    });
    const result = await source.read(request(q, { facet: { columnId: 'ShipCity' } }));
    assert.equal(result.facet?.columnId, 'ShipCity');
    assert.deepEqual(result.facet?.entries.map((e) => e.key).sort(), ['Lyon', 'Reims']);
    assert.equal(result.facet?.complete, true);
    assert.equal(result.rows.length, 0);
  });
});
