import type { FetchLike, FetchRequestInit } from '@salmonui/data';
import type { Order } from './fixtures';

/** Order rows served by /api/orders (no date column: the demos keep wire types simple). */
export type RemoteOrder = Omit<Order, 'placed'>;

/**
 * Browser fetch for the demos' endpoints (`/api/orders`, `/api/odata/orders`,
 * `/api/export`). During server rendering the grid shows its loading state
 * and the request is left pending: the endpoint is relative to the page, and
 * the client issues the real request after hydration, so server and client
 * markup match.
 *
 * In the static export (`NEXT_PUBLIC_SITE_STATIC === '1'`) there is no
 * server, so requests under `/api/` are answered in the tab by
 * `lib/demo-api.ts`, imported on first use so pages without a remote demo
 * never load it.
 */
export function demoFetch(input: string, init?: FetchRequestInit): Promise<Response> {
  if (typeof window === 'undefined') return new Promise(() => {});
  const requestInit = init as RequestInit | undefined;
  if (process.env.NEXT_PUBLIC_SITE_STATIC === '1') {
    const url = new URL(input, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) return browserDemoApi(new Request(url, requestInit));
  }
  return fetch(input, requestInit);
}

// Typed check that demoFetch stays usable as a @salmonui/data transport.
demoFetch satisfies FetchLike;

async function browserDemoApi(request: Request): Promise<Response> {
  const signal = request.signal;
  signal.throwIfAborted();
  const { handleDemoApi } = await import('./demo-api');
  const work = handleDemoApi(request).then((response) => response ?? new Response(null, { status: 404 }));
  // Honour aborts like `fetch`: the handler may be waiting on `?delay`.
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
