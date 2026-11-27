// Server side of the remote pivot demo: the reference `pivot` request handler
// from @salmonui/data/server running the pivot engine over an in-memory sales
// table. Imported only by the demo backend (lib/demo-api.ts), which runs behind
// app/api/pivot/route.api.ts and, on the static export, in the browser.
import { createPivotEngine } from '@salmonui/pivot-table/engine';
import { createPivotQueryHandler, type PivotQueryHandler } from '@salmonui/data/server';

/** The token the demo client sends in `authorization: Bearer <token>`. */
export const PIVOT_DEMO_TOKEN = 'demo-token';

const COUNTRIES: Record<string, string[]> = {
  Asia: ['Japan', 'India', 'Korea'],
  Europe: ['France', 'Germany', 'Spain'],
  Americas: ['Brazil', 'Canada', 'Mexico'],
};
const PRODUCTS = ['Bikes', 'Helmets', 'Gloves', 'Lights'];

/** 100,000 deterministic raw sales rows; they never leave the server (only aggregated windows and drill-through pages do). */
function makeRows(): Record<string, unknown>[] {
  const regions = Object.entries(COUNTRIES);
  const rows: Record<string, unknown>[] = [];
  let seed = 11;
  // The high bits pick the value: the low bits of a power-of-two LCG repeat with a
  // short period and would leave years and countries nearly empty.
  const next = (n: number) => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return Math.floor((seed / 0x80000000) * n);
  };
  for (let id = 1; id <= 100_000; id++) {
    const [region, countries] = regions[next(3)]!;
    const amount = next(900) + 100;
    rows.push({ id, region, country: countries[next(3)]!, product: PRODUCTS[next(4)]!, year: String(2023 + next(4)), amount, units: (amount % 11) + 1 });
  }
  return rows;
}

let handler: PivotQueryHandler | undefined;

/** One handler per server process or browser tab, created on first use. */
export function pivotHandler(): PivotQueryHandler {
  handler ??= createPivotQueryHandler(makeRows(), { engine: createPivotEngine, key: 'id', locale: 'en-US', dict: ['region', 'country', 'product', 'year'] });
  return handler;
}
