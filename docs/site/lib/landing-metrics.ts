// Landing page performance numbers. Server-only:
// read at build time from tooling/bench/baseline.json (the environment named
// by `LANDING_ENVIRONMENT`, the Linux test box the release gates run on).
// Numbers are never typed into the page; a listed metric missing from the
// baseline throws, which fails `next build`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type LandingMetricSpec = {
  /** Core path. */
  path: 'render' | 'scroll' | 'sort' | 'filter' | 'group' | 'edit';
  /** Exact metric name in the baseline. */
  key: string;
  label: string;
  /** What was measured, in plain words. */
  detail: string;
};

/** The headline metrics, one or two per core path. Every bench fixture here is 100,000 rows x 100 columns. */
export const LANDING_METRICS: readonly LandingMetricSpec[] = [
  { path: 'render', key: 'rows=100000 cols=100 create', label: 'Create the grid', detail: 'Engine creation over 100,000 rows and 100 columns' },
  { path: 'render', key: 'rows=100000 cols=100 firstViewport', label: 'First viewport', detail: 'Reading the first visible window of rows' },
  { path: 'scroll', key: 'vertical scroll 2000px/s wheel 100k x 100: p95', label: 'Scroll frame, p95', detail: 'Wheel scrolling at 2,000 px/s through 100,000 rows' },
  { path: 'sort', key: 'sort number column (cold)', label: 'Sort a column', detail: 'First sort of a number column, nothing cached' },
  { path: 'filter', key: 'contains filter (string) (cold)', label: 'Filter text', detail: 'A "contains" filter on a string column, cold' },
  { path: 'group', key: 'group s0 + sum/avg n0..n2 (cold)', label: 'Group and aggregate', detail: 'Group by one column with sum and average of three' },
  { path: 'edit', key: 'edit.commit one cell', label: 'Commit an edit', detail: 'Validate and write one edited cell' },
];

/** The bench environment (`SALMON_BENCH_ENV`) the landing page shows. */
export const LANDING_ENVIRONMENT = 'linux-2080ti';

export type LandingMetric = LandingMetricSpec & { value: number; unit: 'ms' };

export type LandingBaseline = {
  metrics: LandingMetric[];
  /** ISO timestamp of the recording. */
  date: string;
  platform: string;
  /** Human-readable machine label, else the platform string. */
  machine: string;
  node: string;
  sha: string;
};

type Baseline = {
  environments?: Record<string, { sha?: string; node?: string; platform?: string; machine?: string; date?: string; metrics?: Record<string, number> } | undefined>;
};

// `next build` runs with the site directory as cwd.
const BASELINE_FILE = join(process.cwd(), '..', '..', 'tooling', 'bench', 'baseline.json');

export function loadLandingBaseline(file: string = BASELINE_FILE): LandingBaseline {
  // Read at build time only; not a file the server output needs to trace.
  const baseline = JSON.parse(readFileSync(/* turbopackIgnore: true */ file, 'utf8')) as Baseline;
  const local = baseline.environments?.[LANDING_ENVIRONMENT];
  if (!local?.metrics || !local.date || !local.platform || !local.node) {
    throw new Error(`${file}: environments["${LANDING_ENVIRONMENT}"] with date, platform, node and metrics is required by the landing page`);
  }
  const values = local.metrics;
  const missing = LANDING_METRICS.filter((spec) => typeof values[spec.key] !== 'number');
  if (missing.length > 0) {
    throw new Error(`${file}: landing page metrics missing from environments["${LANDING_ENVIRONMENT}"].metrics: ${missing.map((spec) => JSON.stringify(spec.key)).join(', ')}`);
  }
  return {
    metrics: LANDING_METRICS.map((spec) => ({ ...spec, value: values[spec.key] as number, unit: 'ms' })),
    date: local.date,
    platform: local.platform,
    machine: local.machine ?? local.platform,
    node: local.node,
    sha: local.sha ?? 'unknown',
  };
}

/** `0.28` -> `0.28`, `12.91` -> `12.9`, `187.4` -> `187`. */
export function formatMetric(value: number): string {
  if (value < 1) return value.toFixed(2);
  return value < 100 ? value.toFixed(1) : value.toFixed(0);
}
