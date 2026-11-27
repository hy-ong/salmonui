// Transports carry protocol messages. The data source only ever calls a
// `JsonTransport`; HTTP, batching, GraphQL bridges, or in-process handlers
// are all just transports.

import type { WireAnyRequest, WireAnyResponse, WireBatchRequest, WireBatchResponse, WireRequest, WireResponse } from './protocol.js';
import { abortError, createAbortController, isAbortError } from './scheduler.js';
import type { AbortSignalLike, FetchLike, FetchRequestInit } from './types.js';

export interface TransportContext {
  readonly signal: AbortSignalLike;
}

/** Sends one protocol request and resolves with its response. Must honor `signal`. */
export type JsonTransport = (request: WireRequest, ctx: TransportContext) => Promise<WireResponse>;

/** A transport that also carries `pivot` requests (`createJsonPivotSource`). */
export type PivotJsonTransport = (request: WireAnyRequest, ctx: TransportContext) => Promise<WireAnyResponse>;

/** The built-in transports carry every request kind: usable as either transport type. */
export type UniversalJsonTransport = JsonTransport & PivotJsonTransport;

/** Non-2xx HTTP response. 4xx are not retried by default. */
export class HttpError extends Error {
  override readonly name = 'HttpError';
  readonly status: number;
  readonly body: string;
  constructor(status: number, statusText: string, body: string) {
    super(`HTTP ${status}${statusText ? ` ${statusText}` : ''}`);
    this.status = status;
    this.body = body;
  }
}

/** `error` member of a protocol response. */
export class ProtocolError extends Error {
  override readonly name = 'ProtocolError';
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Default retry predicate: network failures, 408, 429, and 5xx. Never aborts, 4xx, or protocol errors. */
export function isRetryableError(error: unknown): boolean {
  if (isAbortError(error) || error instanceof ProtocolError) return false;
  if (error instanceof HttpError) return error.status === 408 || error.status === 429 || error.status >= 500;
  return true;
}

export function resolveFetch(fetch: FetchLike | undefined): FetchLike {
  if (fetch) return fetch;
  const global = (globalThis as { fetch?: FetchLike }).fetch;
  if (!global) throw new Error('@salmonui/data: no fetch in this runtime; pass the fetch option.');
  return global.bind(globalThis) as FetchLike;
}

export interface FetchTransportOptions {
  readonly url: string;
  /** Injected fetch. Defaults to `globalThis.fetch`, read lazily per request. */
  readonly fetch?: FetchLike;
  readonly headers?: Readonly<Record<string, string>> | (() => Readonly<Record<string, string>>);
  readonly requestInit?: Omit<FetchRequestInit, 'method' | 'body' | 'signal' | 'headers'>;
}

/** POSTs a JSON body to `url` and parses the JSON response. */
export async function postJson(options: FetchTransportOptions, body: unknown, signal: AbortSignalLike): Promise<unknown> {
  const fetchFn = resolveFetch(options.fetch);
  const extra = typeof options.headers === 'function' ? options.headers() : options.headers;
  const init: FetchRequestInit = {
    ...options.requestInit,
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...extra },
    body: JSON.stringify(body),
    signal,
  };
  const response = await fetchFn(options.url, init);
  if (!response.ok) throw new HttpError(response.status, response.statusText ?? '', await response.text().catch(() => ''));
  return response.json();
}

function checked(response: WireAnyResponse): WireAnyResponse {
  if (response.error) throw new ProtocolError(response.error.code, response.error.message);
  return response;
}

/** One HTTP request per protocol request. */
export function createFetchTransport(options: FetchTransportOptions): UniversalJsonTransport {
  const transport: PivotJsonTransport = async (request, ctx) => checked((await postJson(options, request, ctx.signal)) as WireAnyResponse);
  return transport as UniversalJsonTransport;
}

/**
 * Multiplexes every request issued in the same tick into one
 * `{ v: 1, batch: [...] }` call (lazy group children, facets, prefetch).
 * A consumer that aborts is rejected immediately; the shared call is aborted
 * only when every consumer in it has aborted.
 */
export function createBatchingTransport(send: (batch: WireBatchRequest, ctx: TransportContext) => Promise<WireBatchResponse>, options: { readonly maxBatch?: number } = {}): UniversalJsonTransport {
  const maxBatch = options.maxBatch ?? 50;
  interface Pending {
    request: WireAnyRequest;
    resolve(value: WireAnyResponse): void;
    reject(error: unknown): void;
    done: boolean;
  }
  let queue: Pending[] = [];
  let scheduled = false;

  const flush = (): void => {
    scheduled = false;
    const all = queue;
    queue = [];
    for (let i = 0; i < all.length; i += maxBatch) dispatch(all.slice(i, i + maxBatch).filter((p) => !p.done));
  };

  const dispatch = (items: Pending[]): void => {
    if (items.length === 0) return;
    const controller = createAbortController();
    let live = items.length;
    const settle = (p: Pending): void => {
      p.done = true;
      if (--live === 0) controller.abort();
    };
    for (const p of items) (p as Pending & { onAbort?: () => void }).onAbort = () => settle(p);
    send({ v: 1, batch: items.map((p) => p.request) }, { signal: controller.signal }).then(
      (response) => {
        items.forEach((p, i) => {
          if (p.done) return;
          p.done = true;
          const r = response.batch[i];
          if (!r) p.reject(new ProtocolError('batch-mismatch', `Batch response has no entry ${i}.`));
          else {
            try {
              p.resolve(checked(r));
            } catch (error) {
              p.reject(error);
            }
          }
        });
      },
      (error: unknown) => {
        for (const p of items) {
          if (!p.done) {
            p.done = true;
            p.reject(error);
          }
        }
      },
    );
  };

  const transport: PivotJsonTransport = (request, ctx) =>
    new Promise<WireAnyResponse>((resolve, reject) => {
      if (ctx.signal.aborted) {
        reject(abortError(ctx.signal));
        return;
      }
      const p: Pending & { onAbort?: () => void } = { request, resolve, reject, done: false };
      ctx.signal.addEventListener('abort', () => {
        if (p.done) return;
        p.onAbort?.();
        p.done = true;
        reject(abortError(ctx.signal));
      });
      queue.push(p);
      if (!scheduled) {
        scheduled = true;
        void Promise.resolve().then(flush);
      }
    });
  return transport as UniversalJsonTransport;
}

/** Batching HTTP transport: same-tick requests share one POST. */
export function createBatchingFetchTransport(options: FetchTransportOptions & { readonly maxBatch?: number }): UniversalJsonTransport {
  return createBatchingTransport(async (batch, ctx) => (await postJson(options, batch, ctx.signal)) as WireBatchResponse, options);
}
