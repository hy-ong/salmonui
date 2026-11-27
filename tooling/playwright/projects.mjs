// Shared project split for the three Playwright configs: functional
// specs run fully parallel,
// timing specs (ms budgets calibrated on a quiet machine) run alone, one
// worker, after every functional test has finished.
//
// A test is a timing test when its file is a `*-perf.spec.ts` or it (or its
// describe block) carries the `@perf` tag. Playwright matches `grep` against
// "<project> <file> <describe titles> <title> <tags>".
import { availableParallelism } from 'node:os';

export const PERF_GREP = /-perf\.spec\.ts|@perf\b/;

/**
 * Worker count for the functional project from PW_WORKERS: a number, a
 * percentage of the cores ("75%"), or "auto" (all cores but two). The
 * default, 50%, keeps a developer machine usable.
 */
export function functionalWorkers(env = process.env) {
  const raw = (env.PW_WORKERS ?? '').trim();
  if (!raw) return '50%';
  if (raw === 'auto') return Math.max(1, availableParallelism() - 2);
  if (/^\d+%$/.test(raw)) return raw;
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;
  throw new Error(`PW_WORKERS must be a positive integer, a percentage or "auto" (got "${raw}")`);
}

/** The functional and timing projects, both with the given `use` options. */
export function splitProjects(use) {
  return [
    { name: 'functional', use, grepInvert: PERF_GREP, fullyParallel: true },
    { name: 'timing', use, grep: PERF_GREP, fullyParallel: false, workers: 1, dependencies: ['functional'] },
  ];
}
