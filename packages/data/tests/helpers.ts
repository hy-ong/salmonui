// Shared test fixtures: an orders dataset, recorded DataQuery set, a fake fetch,
// and a manual transport for timing tests.
import { readFileSync } from 'node:fs';
import type { DataSourceRequest, FetchLike, DataQuery, JsonTransport, WireRequest, WireResponse } from '@salmonui/data';
import { createJsonQueryHandler, type JsonQueryHandler } from '@salmonui/data/server';

export interface Order {
  OrderID: number;
  CustomerID: string;
  ShipName: string;
  ShipCity: string;
  ShipCountry: string;
  ShipRegion: string | null;
  Freight: number;
  OrderDate: Date;
  EmployeeID: number;
  Verified: boolean;
  version: number;
}

export const ORDER_FIELDS = [
  'OrderID', 'CustomerID', 'ShipName', 'ShipCity', 'ShipCountry', 'ShipRegion', 'Freight', 'OrderDate', 'EmployeeID', 'Verified', 'version',
] as const;

const CUSTOMERS = ['VINET', 'TOMSP', 'HANAR', 'VICTE', 'SUPRD', 'RATTC', 'RICSU'];
const CITIES: [string, string][] = [
  ['Reims', 'France'], ['Lyon', 'France'], ['Münster', 'Germany'], ['Rio de Janeiro', 'Brazil'], ['Bern', 'Switzerland'], ['Albuquerque', 'USA'],
];
const NAMES = ['Vins et alcools Chevalier', 'Toms Spezialitäten', 'Hanari Carnes', 'Victuailles en stock', 'Suprêmes délices', 'Rattlesnake Canyon Grocery'];

export function orders(count = 240): Order[] {
  let s = 7;
  const next = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  const out: Order[] = [];
  for (let i = 0; i < count; i++) {
    const [city, country] = CITIES[next() % CITIES.length] as [string, string];
    out.push({
      OrderID: 10248 + i,
      CustomerID: CUSTOMERS[next() % CUSTOMERS.length] as string,
      ShipName: NAMES[next() % NAMES.length] as string,
      ShipCity: city,
      ShipCountry: country,
      ShipRegion: next() % 3 === 0 ? null : next() % 2 === 0 ? '' : 'RJ',
      Freight: (next() % 20000) / 100,
      OrderDate: new Date(Date.UTC(2024, 0, 1 + (next() % 365))),
      EmployeeID: 1 + (next() % 9),
      Verified: next() % 2 === 0,
      version: 1,
    });
  }
  return out;
}

export function orderServer(count = 240, extra: Partial<Parameters<typeof createJsonQueryHandler>[1]> = {}): JsonQueryHandler {
  return createJsonQueryHandler(orders(count) as unknown as Record<string, unknown>[], {
    key: 'OrderID',
    fields: ORDER_FIELDS,
    versionField: 'version',
    dict: ['CustomerID', 'ShipCity', 'ShipCountry', 'ShipName'],
    ...extra,
  });
}

const EMPTY_QUERY: DataQuery = {
  search: null,
  filters: [],
  sorting: [],
  grouping: [],
  aggregates: [],
  paging: null,
  expansion: { groups: {}, tree: {}, detail: {}, defaultGroupExpanded: true },
};

export function query(init: Partial<DataQuery> = {}): DataQuery {
  return { ...EMPTY_QUERY, ...init };
}

export interface QueryFixture {
  readonly name: string;
  readonly query: DataQuery;
  readonly range?: { start: number; end: number };
}

/** The recorded DataQuery set shared by every adapter conformance run. */
export function queryFixtures(): QueryFixture[] {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/grid-queries.json', import.meta.url), 'utf8')) as {
    name: string;
    query: Partial<DataQuery>;
    range?: { start: number; end: number };
  }[];
  return raw.map((f) => ({ name: f.name, query: query(f.query), ...(f.range ? { range: f.range } : {}) }));
}

export function signal(): AbortSignal {
  return new AbortController().signal;
}

let version = 0;
export function request(q: DataQuery, extra: Partial<DataSourceRequest> = {}): DataSourceRequest {
  return { version: ++version, query: q, signal: signal(), ...extra };
}

export interface FetchCall {
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

/** Fake fetch backed by the reference server handler; records every call. */
export function fakeFetch(server: JsonQueryHandler, options: { status?: () => number | undefined } = {}): { fetch: FetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const body = JSON.parse(init?.body as string) as unknown;
    calls.push({ url, body, headers: init?.headers as Record<string, string> });
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const status = options.status?.() ?? 200;
    const text = status >= 400 ? 'fail' : JSON.stringify(server.handle(body));
    return {
      ok: status < 400,
      status,
      statusText: status >= 400 ? 'Error' : 'OK',
      headers: { get: () => 'application/json' },
      json: async () => JSON.parse(text) as unknown,
      text: async () => text,
    };
  };
  return { fetch, calls };
}

export interface ManualCall {
  request: WireRequest;
  signal: AbortSignal;
  resolve(response?: WireResponse): void;
  reject(error: unknown): void;
}

/** Transport whose responses are released by the test, in any order. */
export function manualTransport(server: JsonQueryHandler): { transport: JsonTransport; calls: ManualCall[] } {
  const calls: ManualCall[] = [];
  const transport: JsonTransport = (request, ctx) =>
    new Promise<WireResponse>((resolve, reject) => {
      const s = ctx.signal as AbortSignal;
      s.addEventListener('abort', () => reject(s.reason ?? new DOMException('aborted', 'AbortError')));
      calls.push({
        request,
        signal: s,
        resolve: (response) => resolve(response ?? (JSON.parse(JSON.stringify(server.handle(JSON.parse(JSON.stringify(request))))) as WireResponse)),
        reject,
      });
    });
  return { transport, calls };
}

/** Lets pending promise callbacks run. */
export async function settle(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
