// Request policy: TTL cache, in-flight dedupe, retry with backoff. Keys are
// canonical serialized requests, so equal queries share entries.

import { abortError, createAbortController, delay, type AbortControllerLike } from './scheduler.js';
import { isRetryableError } from './transport.js';
import type { AbortSignalLike, RequestPolicy, Scheduler } from './types.js';

export type CacheScope = 'rows' | 'counts' | 'facets';

export interface RunnerStats {
  transportCalls: number;
  cacheHits: number;
  deduped: number;
  retries: number;
}

interface InFlight {
  readonly promise: Promise<unknown>;
  readonly controller: AbortControllerLike;
  consumers: number;
}

/** @internal */
export interface RequestRunner {
  run<T>(key: string, scope: CacheScope, signal: AbortSignalLike, exec: (signal: AbortSignalLike) => Promise<T>, cacheable?: boolean): Promise<T>;
  peek<T>(key: string): T | undefined;
  invalidate(scope: CacheScope | 'all'): void;
  readonly stats: RunnerStats;
}

/** @internal */
export function createRequestRunner(policy: RequestPolicy, scheduler: Scheduler): RequestRunner {
  const ttl = policy.cache?.ttlMs ?? 0;
  const maxEntries = policy.cache?.maxEntries ?? 100;
  const dedupe = policy.dedupe !== false;
  const cache = new Map<string, { value: unknown; expires: number; scope: CacheScope }>();
  const inFlight = new Map<string, InFlight>();
  const stats: RunnerStats = { transportCalls: 0, cacheHits: 0, deduped: 0, retries: 0 };
  let generation = 0;

  const attempt = async <T>(exec: (signal: AbortSignalLike) => Promise<T>, signal: AbortSignalLike): Promise<T> => {
    const retry = policy.retry;
    const retryOn = retry?.retryOn ?? isRetryableError;
    for (let n = 1; ; n++) {
      stats.transportCalls++;
      try {
        return await exec(signal);
      } catch (error) {
        if (signal.aborted) throw abortError(signal);
        if (!retry || n >= retry.attempts || !retryOn(error)) throw error;
        stats.retries++;
        const ms = typeof retry.delayMs === 'function' ? retry.delayMs(n) : retry.delayMs * 2 ** (n - 1);
        await delay(scheduler, ms, signal);
      }
    }
  };

  const consume = <T>(entry: InFlight, key: string, signal: AbortSignalLike): Promise<T> => {
    entry.consumers++;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const onAbort = (): void => {
        if (done) return;
        done = true;
        reject(abortError(signal));
        if (--entry.consumers === 0) {
          entry.controller.abort();
          if (inFlight.get(key) === entry) inFlight.delete(key);
        }
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);
      entry.promise.then(
        (value) => {
          if (done) return;
          done = true;
          signal.removeEventListener('abort', onAbort);
          resolve(value as T);
        },
        (error: unknown) => {
          if (done) return;
          done = true;
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  };

  return {
    stats,
    peek<T>(key: string): T | undefined {
      const hit = cache.get(key);
      if (!hit) return undefined;
      if (hit.expires <= scheduler.now()) {
        cache.delete(key);
        return undefined;
      }
      return hit.value as T;
    },
    run<T>(key: string, scope: CacheScope, signal: AbortSignalLike, exec: (signal: AbortSignalLike) => Promise<T>, cacheable = true): Promise<T> {
      if (signal.aborted) return Promise.reject(abortError(signal));
      if (ttl > 0 && cacheable) {
        const hit = this.peek<T>(key);
        if (hit !== undefined) {
          stats.cacheHits++;
          // refresh LRU position
          const entry = cache.get(key);
          if (entry) {
            cache.delete(key);
            cache.set(key, entry);
          }
          return Promise.resolve(hit);
        }
      }
      if (dedupe) {
        const existing = inFlight.get(key);
        if (existing) {
          stats.deduped++;
          return consume<T>(existing, key, signal);
        }
      }
      const controller = createAbortController();
      const gen = generation;
      const promise = attempt(exec, controller.signal).then(
        (value) => {
          if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
          if (ttl > 0 && cacheable && gen === generation) {
            cache.delete(key);
            cache.set(key, { value, expires: scheduler.now() + ttl, scope });
            while (cache.size > maxEntries) cache.delete(cache.keys().next().value as string);
          }
          return value;
        },
        (error: unknown) => {
          if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
          throw error;
        },
      );
      // Unobserved rejections are handled by the consumers.
      promise.catch(() => {});
      const entry: InFlight = { promise, controller, consumers: 0 };
      if (dedupe) inFlight.set(key, entry);
      return consume<T>(entry, key, signal);
    },
    invalidate(scope) {
      generation++;
      if (scope === 'all') {
        cache.clear();
        return;
      }
      for (const [key, entry] of cache) if (entry.scope === scope || (scope === 'rows' && entry.scope === 'counts')) cache.delete(key);
    },
  };
}
