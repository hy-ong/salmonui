// Shared adapter conformance suite: every
// adapter configuration is fed the recorded DataQuery set and must emit the
// recorded wire request and map the reference server's response to the same
// DataSourceResult. Re-record with RECORD=1 after a deliberate protocol change.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  createBatchingTransport,
  createJsonDataSource,
  type DataSourceResult,
  type JsonDataSource,
  type JsonTransport,
  type WireBatchRequest,
  type WireRequest,
  type WireResponse,
} from '@salmonui/data';
import { fakeFetch, ORDER_FIELDS, orderServer, queryFixtures, request } from './helpers.ts';

const EXPECTED_URL = new URL('./fixtures/wire-requests.json', import.meta.url);
const RECORD = process.env['RECORD'] === '1';

interface Adapter {
  readonly name: string;
  /** Returns the source and the wire read requests it sent (ids stripped). */
  make(): { source: JsonDataSource<unknown>; sent: () => unknown[]; tuple: boolean };
}

const strip = (r: unknown): unknown => {
  const { id: _id, ...rest } = r as WireRequest;
  return rest;
};

const adapters: Adapter[] = [
  {
    name: 'fetch transport, tuple rows',
    make() {
      const { fetch, calls } = fakeFetch(orderServer());
      const source = createJsonDataSource({ url: '/api/orders', fetch, batch: false, key: 'OrderID', fields: ORDER_FIELDS });
      return { source, sent: () => calls.map((c) => strip(c.body)), tuple: true };
    },
  },
  {
    name: 'batching fetch transport, object rows',
    make() {
      const { fetch, calls } = fakeFetch(orderServer());
      const source = createJsonDataSource({ url: '/api/orders', fetch, key: 'OrderID', fields: ORDER_FIELDS, rowShape: 'object' });
      return { source, sent: () => calls.flatMap((c) => (c.body as WireBatchRequest).batch.map(strip)), tuple: false };
    },
  },
  {
    // A user transport bridging to another protocol (here: a GraphQL-style envelope).
    name: 'custom transport (GraphQL-style bridge), tuple rows',
    make() {
      const server = orderServer();
      const sent: unknown[] = [];
      const graphql = async (body: { query: string; variables: { request: WireRequest } }): Promise<{ data: { grid: WireResponse } }> => ({
        data: { grid: JSON.parse(JSON.stringify(server.handle(body.variables.request))) as WireResponse },
      });
      const transport: JsonTransport = async (req) => {
        sent.push(strip(req));
        return (await graphql({ query: 'query DataGrid($request: JSON!) { grid(request: $request) }', variables: { request: req } })).data.grid;
      };
      const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS });
      return { source, sent: () => sent, tuple: true };
    },
  },
  {
    name: 'in-process batching transport, tuple rows',
    make() {
      const server = orderServer();
      const sent: unknown[] = [];
      const transport = createBatchingTransport(async (batch) => {
        sent.push(...batch.batch.map(strip));
        return JSON.parse(JSON.stringify(server.handle(batch)));
      });
      const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS });
      return { source, sent: () => sent, tuple: true };
    },
  },
];

const normalize = (result: DataSourceResult<unknown>, tuple: boolean): unknown => ({
  ...result,
  version: 0,
  rows: tuple ? result.rows : (result.rows as Record<string, unknown>[]).map((o) => ORDER_FIELDS.map((f) => o[f])),
});

describe('adapter conformance (recorded DataQuery set)', async () => {
  const fixtures = queryFixtures();
  const recorded = RECORD ? null : (JSON.parse(readFileSync(EXPECTED_URL, 'utf8')) as { name: string; request: unknown }[]);
  const results = new Map<string, unknown>();

  for (const adapter of adapters) {
    it(adapter.name, async () => {
      const out: { name: string; request: unknown }[] = [];
      for (const f of fixtures) {
        const { source, sent, tuple } = adapter.make();
        const result = await source.read(request(f.query, f.range ? { range: f.range } : {}));
        const requests = sent();
        assert.equal(requests.length, 1, `${f.name}: one request`);
        out.push({ name: f.name, request: requests[0] });
        if (recorded) assert.deepEqual(requests[0], recorded.find((r) => r.name === f.name)?.request, `${f.name}: wire request`);
        const mapped = normalize(result, tuple);
        const previous = results.get(f.name);
        if (previous === undefined) results.set(f.name, mapped);
        else assert.deepEqual(mapped, previous, `${f.name}: mapped result differs from the first adapter`);
      }
      if (RECORD && adapter === adapters[0]) writeFileSync(EXPECTED_URL, JSON.stringify(out, null, 2) + '\n');
    });
  }

  it('maps results the way the query asks', async () => {
    const fixture = (name: string) => fixtures.find((f) => f.name === name)!;
    const { source } = adapters[0]!.make();
    const page = await source.read(request(fixture('page 3 sorted desc').query));
    assert.equal(page.totalRowCount, 240);
    assert.equal(page.rows.length, 20);
    assert.equal((page.rows[0] as unknown[])[0], 10248 + 239 - 40);
    assert.deepEqual(page.performed, ['search', 'filter', 'sort', 'aggregate', 'page']);
    assert.equal(page.pageInfo?.hasNextPage, true);

    const grouped = await adapters[0]!.make().source.read(request(fixture('group sort aggregate page').query));
    assert.ok(grouped.aggregates?.['Freight']?.['sum'] !== undefined);
    assert.ok(typeof grouped.aggregates?.['Verified']?.['trueCount'] === 'number');
    assert.ok(!grouped.performed?.includes('group'), 'non-lazy grouping is done by the core over the returned rows');

    // Dates arrive as epoch ms, dictionary cells are expanded.
    const row = page.rows[0] as unknown[];
    assert.equal(typeof row[ORDER_FIELDS.indexOf('OrderDate')], 'number');
    assert.equal(typeof row[ORDER_FIELDS.indexOf('ShipCity')], 'string');

    const range = await adapters[0]!.make().source.read(request(fixture('virtual range').query, { range: { start: 100, end: 150 } }));
    assert.equal(range.rows.length, 50);
    assert.equal((range.rows[0] as unknown[])[0], 10348);
  });
});
