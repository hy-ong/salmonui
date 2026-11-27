// Landing page hero data. Deterministic: the same
// seed gives the same rows on the server and the client, so the server markup
// of the hero grid hydrates without mismatches. No Date.now() or Math.random().
// Rows are small flat objects (no Date, shared strings) so that 1,000,000 of
// them stay cheap to generate in the browser.
import { seeded } from './fixtures';

export interface HeroRow {
  readonly id: string;
  readonly customer: string;
  readonly region: string;
  readonly product: string;
  readonly status: 'Open' | 'Packed' | 'Shipped' | 'Delivered' | 'Returned';
  readonly quantity: number;
  readonly unitPrice: number;
  readonly total: number;
  readonly margin: number;
}

const CUSTOMERS = [
  'Aiko Tan',
  'Bao Nguyen',
  'Chen Wei',
  'Dewi Lestari',
  'Elif Kaya',
  'Farah Aziz',
  'Goran Petrov',
  'Hana Sato',
  'Ines Duarte',
  'Jun Park',
  'Kofi Mensah',
  'Lena Vogel',
  'Mateo Ruiz',
  'Nadia Haddad',
  'Oskar Lind',
  'Priya Nair',
];
const REGIONS = ['Lyon', 'Berlin', 'Osaka', 'Penang', 'Porto', 'Austin', 'Nairobi', 'Oslo', 'Seoul', 'Lima'];
const PRODUCTS: readonly (readonly [string, number])[] = [
  ['Espresso beans', 18.5],
  ['Filter beans', 14],
  ['Green tea', 9.25],
  ['Oolong tea', 12.75],
  ['Burr grinder', 129],
  ['Gooseneck kettle', 64.9],
  ['Pour-over kit', 42],
  ['Cold brew jar', 27.5],
];
const STATUSES: readonly HeroRow['status'][] = ['Open', 'Packed', 'Shipped', 'Shipped', 'Delivered', 'Delivered', 'Delivered', 'Returned'];

/** The seed of the hero data set; the 1,000,000-row set uses the same one. */
export const HERO_SEED = 2026;

export function createHeroRows(count: number, seed = HERO_SEED): HeroRow[] {
  const next = seeded(seed);
  const out: HeroRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const [product, unitPrice] = PRODUCTS[next() % PRODUCTS.length] as readonly [string, number];
    const quantity = 1 + (next() % 24);
    out[i] = {
      id: `SO-${String(100_000 + i)}`,
      customer: CUSTOMERS[next() % CUSTOMERS.length] as string,
      region: REGIONS[next() % REGIONS.length] as string,
      product,
      status: STATUSES[next() % STATUSES.length] as HeroRow['status'],
      quantity,
      unitPrice,
      total: Math.round(quantity * unitPrice * 100) / 100,
      margin: (8 + (next() % 33)) / 100,
    };
  }
  return out;
}
