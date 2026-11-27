// Cached lookups for lookup (foreign-key) columns. A lookup satisfies the Data Grid engine's
// structural `LookupSource` (`load({ keys, keyField, displayField, signal })`)
// and keeps a per-key cache: resolved and known-missing keys are served from
// the cache, only uncached keys reach the loader, identical in-flight keys
// are joined, and entries expire after `ttl` by the injected scheduler.

import { systemScheduler } from './scheduler.js';
import { postJson, ProtocolError, type FetchTransportOptions } from './transport.js';
import type { AbortSignalLike, Json, Scheduler } from './types.js';

export interface LookupRequest {
  readonly keys: readonly Json[];
  readonly keyField: string;
  readonly displayField: string;
  readonly signal: AbortSignalLike;
}

export interface LookupOptions {
  /** Loads the rows of `keys` (only keys not cached). May return extra rows; they are cached too. */
  load(request: LookupRequest): readonly unknown[] | Promise<readonly unknown[]>;
  /** Field of the returned rows holding the looked-up value. Default: the request's `keyField`. Dot paths allowed. */
  readonly keyField?: string;
  /** Entry lifetime in ms. Default: never expires. */
  readonly ttl?: number;
  readonly scheduler?: Scheduler;
}

export interface CachedLookup {
  load(request: LookupRequest): Promise<readonly unknown[]>;
  /** Cached row of a key: the row, null when known missing, undefined when not cached. */
  peek(key: Json): unknown;
  /** Drops every entry (or one key). */
  invalidate(key?: Json): void;
  /** Loader calls so far (instrumentation). */
  readonly loads: number;
}

interface Entry {
  readonly row: unknown;
  readonly at: number;
}

function readPath(row: unknown, path: string): unknown {
  let current = row;
  for (const part of path.split('.')) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

const cacheKey = (key: unknown): string => (key instanceof Date ? String(key.getTime()) : String(key));

/** Wraps a loader as a cached Data Grid engine `LookupSource`. One lookup may back several columns and grids. */
export function createLookup(options: LookupOptions): CachedLookup {
  const scheduler = options.scheduler ?? systemScheduler();
  const ttl = options.ttl ?? Infinity;
  const cache = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<void>>();
  let loads = 0;

  const fresh = (entry: Entry | undefined): entry is Entry => entry !== undefined && (ttl === Infinity || scheduler.now() - entry.at < ttl);

  async function fetchKeys(keys: Json[], request: LookupRequest): Promise<void> {
    loads++;
    const rows = await options.load({ ...request, keys });
    const keyField = options.keyField ?? request.keyField;
    const at = scheduler.now();
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = readPath(row, keyField);
      if (key != null) cache.set(cacheKey(key), { row, at });
    }
    for (const key of keys) {
      const k = cacheKey(key);
      if (!fresh(cache.get(k))) cache.set(k, { row: null, at });
    }
  }

  return {
    async load(request) {
      const missing: Json[] = [];
      const waits = new Set<Promise<void>>();
      for (const key of request.keys) {
        const k = cacheKey(key);
        if (fresh(cache.get(k))) continue;
        const pending = inFlight.get(k);
        if (pending) waits.add(pending);
        else missing.push(key);
      }
      if (missing.length) {
        const promise = fetchKeys(missing, request);
        const settled = promise.finally(() => {
          for (const key of missing) if (inFlight.get(cacheKey(key)) === settled) inFlight.delete(cacheKey(key));
        });
        for (const key of missing) inFlight.set(cacheKey(key), settled);
        waits.add(settled);
      }
      await Promise.all(waits);
      const out: unknown[] = [];
      for (const key of request.keys) {
        const entry = cache.get(cacheKey(key));
        if (entry && entry.row !== null) out.push(entry.row);
      }
      return out;
    },
    peek(key) {
      const entry = cache.get(cacheKey(key));
      return fresh(entry) ? entry.row : undefined;
    },
    invalidate(key) {
      if (key === undefined) cache.clear();
      else cache.delete(cacheKey(key));
    },
    get loads() {
      return loads;
    },
  };
}

export interface JsonLookupOptions extends FetchTransportOptions {
  /** Lookup name the server knows (`createJsonQueryHandler(rows, { lookups: { [name]: rows } })`). */
  readonly name: string;
  readonly ttl?: number;
  readonly scheduler?: Scheduler;
}

/**
 * Cached lookup over the JSON protocol endpoint:
 * `{ v: 1, lookup: { name, keys, keyField, displayField } }` -> `{ v: 1, rows }`.
 */
export function createJsonLookup(options: JsonLookupOptions): CachedLookup {
  return createLookup({
    ...(options.ttl !== undefined ? { ttl: options.ttl } : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    async load({ keys, keyField, displayField, signal }) {
      const res = (await postJson(options, { v: 1, lookup: { name: options.name, keys, keyField, displayField } }, signal)) as {
        rows?: unknown[];
        error?: { code: string; message: string };
      };
      if (res.error) throw new ProtocolError(res.error.code, res.error.message);
      return Array.isArray(res.rows) ? res.rows : [];
    },
  });
}
