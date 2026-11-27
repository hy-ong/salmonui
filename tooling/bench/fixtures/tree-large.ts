// `tree-large` fixture:
// 1,000,000 rows, depth 6, flat self-referential `parentId`. One definition
// for the Node gates (packages/data-grid-core/tests/tree-performance.test.ts)
// and the browser page (examples/vite-spa/tree-perf.html), so both measure
// the same rows.
//
// Seed rules of the other fixtures (examples/vite-spa/src/fixture.ts, the
// `large` / `million` mix): one LCG (`state * 1664525 + 1013904223`, seed 1),
// the 256-word string pool and the 365-day 2025 date pool; column `c` is a
// string, number, date or boolean column by `c % 10` (4 / 3 / 2 / 1), keyed
// `${kind}${c}`. Rows are emitted level by level (roots first); each row's
// parent is drawn from the level above with the same generator, before its
// cells. Row ids are `t${index}`. Pure data: no imports, no DOM, no Node APIs.

export type TreeFixtureValue = string | number | boolean | Date | null;
export type TreeFixtureRow = Record<string, TreeFixtureValue> & { readonly id: string; readonly parentId: string | null };
export type TreeFixtureKind = 's' | 'n' | 'd' | 'b';

/** `tree-large`: 1,000,000 rows over 6 levels (10 roots, x10 per level below the second). */
export const TREE_LARGE_LEVELS: readonly number[] = [10, 90, 900, 9000, 90000, 900000];
/** `hierarchy`: 50,000 rows, depth 4. */
export const HIERARCHY_LEVELS: readonly number[] = [20, 180, 1800, 48000];
/**
 * Data columns: one cycle of the `large` mix (4 string, 3 number, 2 date,
 * 1 boolean; 1,660 px with the id column, wider than the 1,280 px viewport).
 * Wider rows only add heap: at 20 columns the 1M tree engine creation measured
 * about 200 ms slower (GC), with no extra work per row.
 */
export const TREE_LARGE_COLUMNS = 10;

export interface TreeFixture {
  readonly rows: TreeFixtureRow[];
  /** Data column keys in column order (`id` and `parentId` excluded). */
  readonly keys: readonly string[];
  readonly kinds: readonly TreeFixtureKind[];
}

export function createTreeFixture(levels: readonly number[] = TREE_LARGE_LEVELS, columnCount = TREE_LARGE_COLUMNS, seed = 1): TreeFixture {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const words = Array.from({ length: 256 }, (_, i) => `word-${i.toString(36)}-${(i * 7919) % 1000}`);
  const dates = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)));
  const kinds: TreeFixtureKind[] = [];
  for (let c = 0; c < columnCount; c++) {
    const slot = c % 10;
    kinds.push(slot < 4 ? 's' : slot < 7 ? 'n' : slot < 9 ? 'd' : 'b');
  }
  const keys = kinds.map((k, c) => `${k}${c}`);
  const total = levels.reduce((a, b) => a + b, 0);
  const rows: TreeFixtureRow[] = new Array(total);
  let r = 0;
  let prevStart = 0;
  let prevSize = 0;
  for (let level = 0; level < levels.length; level++) {
    const start = r;
    const size = levels[level] as number;
    for (let i = 0; i < size; i++, r++) {
      const row: Record<string, TreeFixtureValue> = { id: `t${r}`, parentId: level === 0 ? null : `t${prevStart + (next() % prevSize)}` };
      for (let c = 0; c < columnCount; c++) {
        const key = keys[c] as string;
        switch (kinds[c]) {
          case 's':
            row[key] = words[next() & 255] as string;
            break;
          case 'n':
            row[key] = next() % 100000;
            break;
          case 'd':
            row[key] = dates[next() % 365] as Date;
            break;
          default:
            row[key] = ((next() >>> 16) & 1) === 1;
        }
      }
      rows[r] = row as TreeFixtureRow;
    }
    prevStart = start;
    prevSize = size;
  }
  return { rows, keys, kinds };
}
