// The demo backend: /api/orders, /api/odata/orders, /api/export and
// /api/pivot. One
// implementation for both hosts:
// - server modes (`next dev`, `next start`): the thin `app/api/**/route.api.ts`
//   route handlers call `handleDemoApi`;
// - the static export: `demoFetch` (lib/remote.ts) imports this module on
//   first use and answers the request in the browser tab.
// Only `Request`, `Response`, `URL` and @salmonui/* public exports: no Node
// built-ins, no file system. Module-level state (the order handler) is
// backend state created on first use, never render state.
import { exportToResponse } from '@salmonui/data-grid/engine/export-server';
import { exportOrderColumns, exportOrders } from './export-demo';
import { ORDER_FIELDS, ordersHandler } from './orders-server';

const knownOrderFields = new Set<string>(ORDER_FIELDS);

/** Answers a demo endpoint request, or `null` when the URL is not a demo endpoint. */
export async function handleDemoApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  switch (url.pathname) {
    case '/api/orders':
      if (method === 'GET') return ordersList(url);
      if (method === 'POST') return ordersQuery(url, request);
      return methodNotAllowed('GET, POST');
    case '/api/odata/orders':
      if (method === 'GET') return odataOrders(url);
      return methodNotAllowed('GET');
    case '/api/export':
      if (method === 'POST') return serverExport(request);
      return methodNotAllowed('POST');
    case '/api/pivot':
      if (method === 'POST') return pivotQuery(url, request);
      return methodNotAllowed('POST');
    default:
      return null;
  }
}

function methodNotAllowed(allow: string): Response {
  return new Response(null, { status: 405, headers: { allow } });
}

// Plain JSON array of the first `?limit=<n>` orders (max 5000), for the
// offline data source demo, which loads once and queries locally.
function ordersList(url: URL): Response {
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000) || 1000, 5000);
  return Response.json(ordersHandler().rows().slice(0, limit));
}

// Salmon UI JSON protocol endpoint for the remote-data demos. `?delay=<ms>`
// (max 2000) simulates network latency so loading states are visible.
async function ordersQuery(url: URL, request: Request): Promise<Response> {
  const delay = Math.min(Number(url.searchParams.get('delay') ?? 0) || 0, 2000);
  let message: unknown;
  try {
    message = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON' }, { status: 400 });
  }
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  return Response.json(ordersHandler().handle(message));
}

// A minimal OData-style endpoint (`$orderby`, `$skip`, `$top`, `$count`,
// `$select`) over the same order table as /api/orders. It stands in for an
// existing OData, Web API or GraphQL backend: the odata-bridge demo reaches
// it through a user-written transport, not through the Salmon UI protocol.
function odataOrders(url: URL): Response {
  const params = url.searchParams;
  let rows = ordersHandler().rows();
  const orderby = params.get('$orderby');
  if (orderby) {
    const keys = orderby.split(',').map((part) => {
      const [field = '', dir = 'asc'] = part.trim().split(/\s+/);
      return { field, desc: dir === 'desc' };
    });
    const bad = keys.find((k) => !knownOrderFields.has(k.field));
    if (bad) return Response.json({ error: { code: 'BadRequest', message: `Unknown $orderby field "${bad.field}"` } }, { status: 400 });
    rows = [...rows].sort((a, b) => {
      for (const { field, desc } of keys) {
        const x = a[field] as string | number;
        const y = b[field] as string | number;
        const order = x < y ? -1 : x > y ? 1 : 0;
        if (order !== 0) return desc ? -order : order;
      }
      return 0;
    });
  }
  const total = rows.length;
  const skip = Math.max(0, Number(params.get('$skip') ?? 0) || 0);
  const top = Math.min(Math.max(0, Number(params.get('$top') ?? 100) || 100), 1000);
  const select = params.get('$select')?.split(',').filter((field) => knownOrderFields.has(field));
  const value = rows.slice(skip, skip + top).map((row) => (select ? Object.fromEntries(select.map((field) => [field, row[field]])) : row));
  return Response.json({ ...(params.get('$count') === 'true' ? { '@odata.count': total } : {}), value });
}

// Server export for the export-print demo: the client posts its
// `serializeDataGridState(api.getState())` text and a format; the handler
// rebuilds the same view (sort, filters, search, grouping, column order and
// visibility) from the shared rows and columns and returns the file.
async function serverExport(request: Request): Promise<Response> {
  let body: { format?: unknown; state?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Request body must be JSON' }, { status: 400 });
  }
  const format = body.format === 'csv' || body.format === 'pdf' ? body.format : 'excel';
  const state = typeof body.state === 'string' ? body.state : undefined;
  const response = await exportToResponse(
    { rows: exportOrders, columns: exportOrderColumns, ...(state ? { state } : {}), locale: 'en-US', currency: 'USD', timeZone: 'UTC' },
    { format, fileName: 'orders-server' },
  );
  return (response as Response | null) ?? new Response(null, { status: 204 });
}

// Salmon UI JSON protocol endpoint of the remote pivot demo (`pivot`, `facet`
// and `read` requests): the reference handler of @salmonui/data/server runs
// the pivot engine here. It requires `authorization: Bearer demo-token` (the
// demo source's `headers` option) and honours `?delay=<ms>` (max 2000) so the
// loading state is visible. The handler module loads on the first request.
async function pivotQuery(url: URL, request: Request): Promise<Response> {
  const { PIVOT_DEMO_TOKEN, pivotHandler } = await import('./pivot-server');
  if (request.headers.get('authorization') !== `Bearer ${PIVOT_DEMO_TOKEN}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const delay = Math.min(Number(url.searchParams.get('delay') ?? 0) || 0, 2000);
  let message: unknown;
  try {
    message = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON' }, { status: 400 });
  }
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  return Response.json(pivotHandler().handle(message));
}
