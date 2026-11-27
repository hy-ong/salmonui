// Server side of the remote-data demos: the reference Salmon UI JSON protocol
// handler from @salmonui/data/server over an in-memory order table. Imported
// only by the demo backend (lib/demo-api.ts), which runs behind the route
// handlers (app/api/**/route.api.ts) and, on the static export, in the browser.
import { createJsonQueryHandler, type JsonQueryHandler } from '@salmonui/data/server';
import { createOrders } from './fixtures';

export const ORDER_FIELDS = ['id', 'customer', 'country', 'city', 'product', 'category', 'quantity', 'unitPrice', 'amount', 'discount', 'shipped', 'priority', 'note'] as const;

let handler: JsonQueryHandler | undefined;

/** One handler per server process or browser tab, created on first use. Demo writes are not supported. */
export function ordersHandler(): JsonQueryHandler {
  handler ??= createJsonQueryHandler(
    createOrders(50_000, 77).map(({ placed: _placed, ...row }) => row as Record<string, unknown>),
    { key: 'id', fields: ORDER_FIELDS, dict: ['customer', 'country', 'city', 'product', 'category', 'priority'] },
  );
  return handler;
}
