// Deterministic request-policy tests (injected scheduler + manual transport):
// stale rejection, abort on supersede, dedupe, TTL, retry backoff, prefetch.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createJsonDataSource,
  createManualScheduler,
  HttpError,
  isAbortError,
  RequestCanceledError,
  StaleResponseError,
  type JsonTransport,
  type WireReadRequest,
  type WireReadResponse,
} from '@salmonui/data';
import { manualTransport, ORDER_FIELDS, orderServer, query, request, settle } from './helpers.ts';

const paged = (page: number) => query({ paging: { page, pageSize: 10 } });

describe('abort and versions', () => {
  it('aborts the superseded request on the same channel and resolves the newer one', async () => {
    const { transport, calls } = manualTransport(orderServer());
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, scheduler: createManualScheduler() });
    const first = source.read(request(paged(1)));
    const second = source.read(request(paged(2)));
    await settle();
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.signal.aborted, true, 'first transport call aborted');
    calls[1]!.resolve();
    await assert.rejects(first, (e: unknown) => isAbortError(e));
    const result = await second;
    assert.equal((result.rows[0] as unknown[])[0], 10258);
  });

  it('rejects a response older than one already applied (stale-version rejection)', async () => {
    const { transport, calls } = manualTransport(orderServer());
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS });
    // Version 5 is applied first; a later-issued request carrying version 3 is stale.
    const newer = source.read({ ...request(paged(1)), version: 5 });
    await settle();
    calls[0]!.resolve();
    await newer;
    const older = source.read({ ...request(paged(2)), version: 3 });
    await settle();
    calls[1]!.resolve();
    await assert.rejects(older, (e: unknown) => e instanceof StaleResponseError && e.version === 3);
  });

  it('caller abort rejects silently with AbortError', async () => {
    const { transport, calls } = manualTransport(orderServer());
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS });
    const controller = new AbortController();
    const pending = source.read({ ...request(paged(1)), signal: controller.signal });
    await settle();
    controller.abort();
    await assert.rejects(pending, (e: unknown) => isAbortError(e));
    assert.equal(calls[0]!.signal.aborted, true);
  });

  it('onRequest can cancel and onResponse/onError observe', async () => {
    const events: string[] = [];
    let fail = false;
    const server = orderServer();
    const transport: JsonTransport = async (req) => {
      if (fail) throw new HttpError(500, 'Server Error', '');
      return server.handle(req) as never;
    };
    const source = createJsonDataSource({
      transport,
      key: 'OrderID',
      fields: ORDER_FIELDS,
      onRequest: (e) => {
        events.push(`begin:${e.kind}`);
        return (e.request as WireReadRequest).query.page?.limit !== 99;
      },
      onResponse: (e) => {
        events.push(`complete:${e.kind}`);
      },
      onError: (e) => events.push(`failure:${(e.error as Error).message}`),
    });
    await source.read(request(paged(1)));
    await assert.rejects(source.read(request(query({ paging: { page: 1, pageSize: 99 } }))), RequestCanceledError);
    fail = true;
    await assert.rejects(source.read(request(paged(3))), HttpError);
    assert.deepEqual(events, ['begin:read', 'complete:read', 'begin:read', 'begin:read', 'failure:HTTP 500 Server Error']);
  });

  it('onResponse can replace the response before it is decoded (beforeDataBound)', async () => {
    const server = orderServer();
    const seen: number[] = [];
    let transform = true;
    const source = createJsonDataSource({
      transport: async (req) => server.handle(req) as never,
      key: 'OrderID',
      fields: ORDER_FIELDS,
      policy: { cache: { ttlMs: 60_000 } },
      onResponse: (e) => {
        const response = e.response as WireReadResponse;
        seen.push(response.rows.length);
        if (!transform) return undefined;
        // A new object: keep two rows and report a server-side total of 2.
        return { ...response, rows: response.rows.slice(0, 2), total: 2 };
      },
    });
    const first = await source.read(request(paged(1)));
    assert.equal(first.rows.length, 2);
    assert.equal(first.totalRowCount, 2);
    assert.deepEqual(source.getRows().map((r) => (r as unknown[])[0]), (first.rows as unknown[][]).map((r) => r[0]));
    transform = false;
    const cached = await source.read(request(paged(1)));
    assert.equal(cached.rows.length, 10, 'the cache kept the original response; the hook ran again on the hit');
    assert.deepEqual(seen, [10, 10]);
  });

  it('onResponse return values other than objects keep the response (observe only)', async () => {
    const server = orderServer();
    const log: string[] = [];
    const source = createJsonDataSource({
      transport: async (req) => server.handle(req) as never,
      key: 'OrderID',
      fields: ORDER_FIELDS,
      onResponse: ((e: { kind: string }) => log.push(e.kind)) as never,
    });
    const result = await source.read(request(paged(1)));
    assert.equal(result.rows.length, 10);
    assert.deepEqual(log, ['read']);
  });
});

describe('dedupe and cache', () => {
  it('a foreground read joins the identical in-flight prefetch (one transport call)', async () => {
    const { transport, calls } = manualTransport(orderServer());
    const source = createJsonDataSource({
      transport,
      key: 'OrderID',
      fields: ORDER_FIELDS,
      scheduler: createManualScheduler(),
      policy: { cache: { ttlMs: 10_000 }, prefetch: { adjacentPages: 1 } },
    });
    const first = source.read(request(paged(2)));
    await settle();
    calls[0]!.resolve();
    await first;
    await settle();
    assert.equal(calls.length, 3, 'read + 2 prefetches');
    const third = source.read(request(paged(3)));
    await settle();
    assert.equal(calls[1]!.signal.aborted, false, 'page 3 prefetch kept: the foreground read consumes it');
    assert.equal(calls[2]!.signal.aborted, true, 'page 1 prefetch aborted');
    assert.equal(source.getStats().deduped, 1);
    calls[1]!.resolve();
    const result = await third;
    assert.equal((result.rows[0] as unknown[])[0], 10268);
    await settle();
    assert.equal(calls.length, 4, 'no call for page 3; then prefetch page 4 (page 2 is cached)');
  });

  it('serves repeats from the TTL cache until expiry', async () => {
    const scheduler = createManualScheduler();
    const { transport, calls } = manualTransport(orderServer());
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, scheduler, policy: { cache: { ttlMs: 1000 } } });
    const load = async () => {
      const p = source.read(request(paged(1)));
      await settle();
      calls.at(-1)?.resolve();
      return p;
    };
    await load();
    scheduler.advance(999);
    const before = calls.length;
    await source.read(request(paged(1)));
    assert.equal(calls.length, before, 'cache hit');
    scheduler.advance(1);
    await load();
    assert.equal(calls.length, before + 1, 'expired entry refetched');
    assert.equal(source.getStats().cacheHits, 1);
    source.invalidate('rows');
    await load();
    assert.equal(calls.length, before + 2, 'invalidate clears the cache');
  });

  it('evicts the least recently used entry beyond maxEntries', async () => {
    const server = orderServer();
    let count = 0;
    const transport: JsonTransport = async (req) => (count++, server.handle(req) as never);
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, policy: { cache: { ttlMs: 1e9, maxEntries: 2 } }, scheduler: createManualScheduler() });
    await source.read(request(paged(1)));
    await source.read(request(paged(2)));
    await source.read(request(paged(1))); // hit, refreshes page 1
    await source.read(request(paged(3))); // evicts page 2
    assert.equal(count, 3);
    await source.read(request(paged(1)));
    assert.equal(count, 3);
    await source.read(request(paged(2)));
    assert.equal(count, 4);
  });
});

describe('retry with backoff', () => {
  it('retries network errors with exponential delays on the injected scheduler', async () => {
    const scheduler = createManualScheduler();
    const server = orderServer();
    let attempts = 0;
    const transport: JsonTransport = async (req) => {
      attempts++;
      if (attempts < 3) throw new TypeError('network down');
      return server.handle(req) as never;
    };
    const source = createJsonDataSource({ transport, key: 'OrderID', fields: ORDER_FIELDS, scheduler, policy: { retry: { attempts: 3, delayMs: 100 } } });
    const pending = source.read(request(paged(1)));
    await settle();
    assert.equal(attempts, 1);
    scheduler.advance(99);
    await settle();
    assert.equal(attempts, 1);
    scheduler.advance(1);
    await settle();
    assert.equal(attempts, 2);
    scheduler.advance(199);
    await settle();
    assert.equal(attempts, 2, 'second delay is 200ms');
    scheduler.advance(1);
    await pending;
    assert.equal(attempts, 3);
    assert.equal(source.getStats().retries, 2);
  });

  it('does not retry 4xx and aborts a pending backoff', async () => {
    const scheduler = createManualScheduler();
    let attempts = 0;
    const source = createJsonDataSource({
      transport: async () => {
        attempts++;
        throw new HttpError(attempts === 1 ? 400 : 503, '', '');
      },
      key: 'OrderID',
      fields: ORDER_FIELDS,
      scheduler,
      policy: { retry: { attempts: 5, delayMs: () => 50 } },
    });
    await assert.rejects(source.read(request(paged(1))), (e: unknown) => e instanceof HttpError && e.status === 400);
    assert.equal(attempts, 1);
    const controller = new AbortController();
    const pending = source.read({ ...request(paged(2)), signal: controller.signal });
    await settle();
    assert.equal(attempts, 2);
    assert.equal(scheduler.pending, 1, 'backoff timer scheduled');
    controller.abort();
    await assert.rejects(pending, (e: unknown) => isAbortError(e));
    assert.equal(scheduler.pending, 0, 'backoff timer cleared');
  });
});

describe('prefetch isolation', () => {
  it('prefetches adjacent pages into the cache, off the foreground path, and a new foreground read aborts them', async () => {
    const scheduler = createManualScheduler();
    const { transport, calls } = manualTransport(orderServer());
    const kinds: string[] = [];
    const source = createJsonDataSource({
      transport,
      key: 'OrderID',
      fields: ORDER_FIELDS,
      scheduler,
      policy: { cache: { ttlMs: 10_000 }, prefetch: { adjacentPages: 1 } },
      onRequest: (e) => void kinds.push(e.kind),
    });
    const first = source.read(request(paged(2)));
    await settle();
    calls[0]!.resolve();
    await first;
    await settle();
    assert.deepEqual(kinds, ['read', 'prefetch', 'prefetch']);
    const offsets = calls.slice(1).map((c) => (c.request as WireReadRequest).query.page);
    assert.deepEqual(offsets, [{ offset: 20, limit: 10 }, { offset: 0, limit: 10 }]);
    calls[1]!.resolve(); // page 3 lands in the cache
    await settle();
    const next = await source.read(request(paged(3)));
    assert.equal((next.rows[0] as unknown[])[0], 10268, 'page 3 from the prefetch cache');
    assert.equal(calls[2]!.signal.aborted, true, 'outstanding prefetch aborted by the foreground read');
  });
});
