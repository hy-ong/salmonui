// Deterministic sales fixture of the Pivot Table page (examples/vite-spa/pivot.html,
// tests/browser/pivot*.spec.ts): row `i` is a pure function of `i` and the seed,
// so every run and every count produces the same rows.

export interface SalesRow {
  id: number;
  region: string;
  country: string;
  city: string;
  product: string;
  category: string;
  year: number;
  quarter: string;
  date: string;
  customer: string;
  amount: number;
  units: number;
}

export const GEOGRAPHY: readonly (readonly [region: string, country: string, cities: readonly string[]])[] = [
  ['Asia', 'Japan', ['Tokyo', 'Osaka']],
  ['Asia', 'India', ['Mumbai', 'Delhi']],
  ['Asia', 'Singapore', ['Singapore']],
  ['Europe', 'Germany', ['Berlin', 'Munich']],
  ['Europe', 'France', ['Paris', 'Lyon']],
  ['Europe', 'United Kingdom', ['London', 'Leeds']],
  ['Americas', 'United States', ['New York', 'Chicago']],
  ['Americas', 'Canada', ['Toronto']],
  ['Americas', 'Brazil', ['Sao Paulo']],
];

export const PRODUCTS: readonly (readonly [product: string, category: string])[] = [
  ['Laptop', 'Electronics'],
  ['Phone', 'Electronics'],
  ['Tablet', 'Electronics'],
  ['Desk', 'Furniture'],
  ['Chair', 'Furniture'],
  ['Pen', 'Office'],
  ['Paper', 'Office'],
];

export const YEARS = [2023, 2024, 2025, 2026] as const;

const CITIES: readonly (readonly [string, string, string])[] = GEOGRAPHY.flatMap(([region, country, cities]) => cities.map((city) => [region, country, city] as const));

/** Integer hash (xorshift-multiply), uniform enough for a fixture. */
function hash(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * `count` rows. `customers`: distinct customer names (`C00001` ...), so a large
 * fixture can carry a field with 100,000 members.
 */
export function createSales(count: number, customers = 500): SalesRow[] {
  const rows: SalesRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const h = hash(i);
    const geo = CITIES[h % CITIES.length] as readonly [string, string, string];
    const prod = PRODUCTS[(h >>> 5) % PRODUCTS.length] as readonly [string, string];
    const year = YEARS[(h >>> 9) % YEARS.length] as number;
    const month = ((h >>> 12) % 12) + 1;
    const day = ((h >>> 16) % 28) + 1;
    rows[i] = {
      id: i,
      region: geo[0],
      country: geo[1],
      city: geo[2],
      product: prod[0],
      category: prod[1],
      year,
      quarter: `Q${Math.ceil(month / 3)}`,
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      customer: `C${String((i * 7919) % customers).padStart(6, '0')}`,
      amount: 10 + (hash(i + 0x5bd1e995) % 991),
      units: 1 + ((h >>> 20) % 20),
    };
  }
  return rows;
}
