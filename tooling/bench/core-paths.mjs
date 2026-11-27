// Core-path benchmark metrics. The single definition of which
// `bench` metrics are core paths: a regression against the baseline fails
// `bench` (and so `release:verify`) only for these metrics; every other
// metric is measured, reported, and a regression is a warning.
//
// Bundle, the eighth core path, is gated absolutely by `bundle:check`, not by
// `bench`. Export has no `bench` metric yet; its pattern is reserved so a new
// export scenario gates as soon as it emits `[perf]` lines named `export ...`.
//
// Tree mode joins `sort`, `filter` and `scroll` through its `tree-large ...` metrics; the flat 1M references
// (`flat 1M reference ...`) and the tree moves (`tree-large move ...`) are
// measured and reported, not core.

/** @type {ReadonlyArray<{ path: string; patterns: readonly RegExp[] }>} */
export const CORE_PATHS = [
  // Engine creation and the first viewport of the 100k x 100 fixture.
  { path: 'render', patterns: [/^rows=\d+ cols=\d+ (create|firstViewport)$/] },
  // Plain vertical and horizontal scroll, scrollToRow, grouped scroll.
  {
    path: 'scroll',
    patterns: [
      /^vertical scroll 2000px\/s (programmatic|wheel) 100k x 100: /,
      /^horizontal scroll 2000px\/s wide 10k x 500: /,
      /^scrollToRow /,
      /^grouped scroll 2000px\/s: /,
      // Tree mode, fully expanded `tree-large` (tests/browser/tree-perf.spec.ts).
      /^tree-large vertical scroll 2000px\/s (programmatic|wheel) fully expanded/,
    ],
  },
  {
    path: 'sort',
    patterns: [
      /^sort (number|string) column /,
      /^multi-sort \d+ columns /,
      /^re-apply unchanged sort\+filter /,
      // Tree mode sibling sort on `tree-large` (data-grid-core tree-performance.test.ts).
      /^tree-large sort /,
    ],
  },
  {
    path: 'filter',
    patterns: [
      /^contains filter \(string\) /,
      /^type filter char by char /,
      /^global search /,
      // Tree mode `contains` with filterMode 'ancestors' on `tree-large`.
      /^tree-large contains filter /,
    ],
  },
  { path: 'group', patterns: [/^group s0/, /^toggle one group /, /^collapse\/expand all /, /^patch 1 row \(s0/] },
  { path: 'edit', patterns: [/^edit[ .]/, /^1,000 batch cell edits /] },
  { path: 'export', patterns: [/^export[ .]/] },
  // Pivot Table: initial aggregation (in-process and
  // through the Worker host), drill down and up, member filter apply and clear, field sort.
  { path: 'pivot', patterns: [/^pivot initial aggregation /, /^pivot drill (down|up) /, /^pivot filter (apply|clear) /, /^pivot sort (row|column) field/] },
  // 500 Sparklines in Data Grid cells: protects the grid scroll budgets.
  { path: 'sparklines in grid', patterns: [/^sparkline grid scroll 2000px\/s: /] },
];

/** Returns the core path a `bench` metric belongs to, or null for a non-core metric. */
export function corePath(metric) {
  for (const { path, patterns } of CORE_PATHS) if (patterns.some((p) => p.test(metric))) return path;
  return null;
}
