// Deterministic demo data: identical on the server and the client, so SSR
// markup hydrates without mismatches. No Date.now() or Math.random().

export interface Order {
  readonly id: string;
  readonly customer: string;
  readonly country: string;
  readonly city: string;
  readonly product: string;
  readonly category: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
  readonly discount: number;
  readonly placed: Date;
  readonly shipped: boolean;
  readonly priority: 'Low' | 'Normal' | 'High';
  readonly note: string;
}

const CUSTOMERS = ['Aiko Tan', 'Bao Nguyen', 'Chen Wei', 'Dewi Lestari', 'Elif Kaya', 'Farah Aziz', 'Goran Petrov', 'Hana Sato', 'Ines Duarte', 'Jun Park'];
const PLACES: readonly (readonly [string, string])[] = [
  ['Lyon', 'France'],
  ['Reims', 'France'],
  ['Berlin', 'Germany'],
  ['Munich', 'Germany'],
  ['Osaka', 'Japan'],
  ['Tokyo', 'Japan'],
  ['Penang', 'Malaysia'],
  ['Kuala Lumpur', 'Malaysia'],
  ['Porto', 'Portugal'],
];
const PRODUCTS: readonly (readonly [string, string, number])[] = [
  ['Espresso beans', 'Coffee', 18.5],
  ['Filter beans', 'Coffee', 14],
  ['Green tea', 'Tea', 9.25],
  ['Oolong tea', 'Tea', 12.75],
  ['Grinder', 'Equipment', 129],
  ['Kettle', 'Equipment', 64.9],
  ['Pour-over kit', 'Equipment', 42],
];
const NOTES = ['', '', '', 'Leave the parcel with the building reception if nobody answers the door.', 'Gift wrap', '', 'Call before delivery'];

/**
 * Seeded generator: a linear congruential state with an output mix. The raw
 * LCG low bits repeat with short periods (bit k has period 2^(k+1)), so
 * `next() % n` for small n correlated fields of the same row (priority
 * followed the discount); the mix folds the high bits into the low ones.
 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    let x = state ^ (state >>> 16);
    x = Math.imul(x, 0x45d9f3b);
    return (x ^ (x >>> 16)) >>> 0;
  };
}

export function createOrders(count: number, seed = 42): Order[] {
  const next = seeded(seed);
  const out: Order[] = [];
  for (let i = 0; i < count; i++) {
    const [city, country] = PLACES[next() % PLACES.length] as readonly [string, string];
    const [product, category, unitPrice] = PRODUCTS[next() % PRODUCTS.length] as readonly [string, string, number];
    const quantity = 1 + (next() % 12);
    const discount = (next() % 4) * 0.05;
    out.push({
      id: `ORD-${String(10_000 + i)}`,
      customer: CUSTOMERS[next() % CUSTOMERS.length] as string,
      country,
      city,
      product,
      category,
      quantity,
      unitPrice,
      amount: Math.round(quantity * unitPrice * (1 - discount) * 100) / 100,
      discount,
      placed: new Date(Date.UTC(2026, next() % 12, 1 + (next() % 28), next() % 24, next() % 60)),
      shipped: ((next() >>> 16) & 1) === 1,
      priority: (['Low', 'Normal', 'Normal', 'High'] as const)[next() % 4] as Order['priority'],
      note: NOTES[next() % NOTES.length] as string,
    });
  }
  return out;
}

/** A row of the wide virtualization fixture: values are derived from the index by column getters. */
export interface WideRow {
  readonly id: number;
}

export function createWideRows(count: number): WideRow[] {
  const out: WideRow[] = new Array(count);
  for (let i = 0; i < count; i++) out[i] = { id: i };
  return out;
}

/** Deterministic integer hash of (row, column) for synthetic cell values. */
export function cellHash(row: number, column: number): number {
  let h = Math.imul(row + 1, 2654435761) ^ Math.imul(column + 1, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}
