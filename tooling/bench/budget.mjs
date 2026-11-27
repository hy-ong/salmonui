// Absolute timing budgets of the timing tests (node `*performance.test.ts`
// suites, `@perf` unit tests, Playwright `*-perf.spec.ts` and `@perf` tests).
//
// Every budget is a product target, calibrated on the development Mac
// (`local`). On an environment gated relatively (`linux-2080ti`, a slower
// machine) a missed target does not fail the test: the metric is still
// recorded, `npm run bench` fails on a regression against that
// environment's baseline instead, and lists the missed targets as a warning.
//
// Each check prints a `[perf-target]` line (met or missed) so the bench can
// collect the targets with the fastest measured value across its runs.
import assert from 'node:assert/strict';

/** Environments whose absolute targets are reported, not asserted. */
export const RELATIVE_GATE_ENVIRONMENTS = new Set(['linux-2080ti']);

/**
 * The bench environment: SALMON_BENCH_ENV, else `linux-2080ti` on Linux
 * (the release environment) and `local` elsewhere (its quiet-run preset
 * needs Linux).
 */
export function benchEnv(vars = process.env, platform = process.platform) {
  return vars.SALMON_BENCH_ENV || (platform === 'linux' ? 'linux-2080ti' : 'local');
}

/** Whether absolute targets fail the test on `env`. */
export function enforcesTargets(env = benchEnv()) {
  return !RELATIVE_GATE_ENVIRONMENTS.has(env);
}

const round = (v) => Math.round(v * 1000) / 1000;

/** The comparison operator of a check. */
const opOf = ({ strict = false, atLeast = false } = {}) => (atLeast ? (strict ? '>' : '>=') : strict ? '<' : '<=');

/** Whether `value` meets `budget` under operator `op`. */
const meets = (value, budget, op) => (op === '<' ? value < budget : op === '<=' ? value <= budget : op === '>' ? value > budget : value >= budget);

/** The `[perf-target]` line of one check. */
export function targetLine(label, value, budget, { strict = false, atLeast = false, unit = 'ms' } = {}) {
  return `[perf-target] ${label}: value=${round(value)}${unit} target${opOf({ strict, atLeast })}${budget}${unit}`;
}

/**
 * Parses `[perf-target]` lines into `{ label: { value, budget, op, unit } }`,
 * keeping the best value per label (lowest for an upper bound, highest for
 * a lower bound), as the bench keeps the fastest run.
 */
export function parseTargets(output) {
  const targets = {};
  for (const m of output.matchAll(/\[perf-target\] (.+?): value=(-?[\d.]+)([a-zA-Z%]*) target(<=|<|>=|>)(-?[\d.]+)[a-zA-Z%]*/g)) {
    const [, label, value, unit, op, budget] = m;
    const v = Number(value);
    const prev = targets[label];
    const better = !prev || (op.startsWith('>') ? v > prev.value : v < prev.value);
    if (better) targets[label] = { value: v, budget: Number(budget), op, unit };
  }
  return targets;
}

/** Whether a parsed target is missed. */
export const missed = (t) => !meets(t.value, t.budget, t.op);

/**
 * Checks `value` against its product target `budget`: `value <= budget`
 * (`strict`: `<`), or with `atLeast` a lower bound `value >= budget`
 * (`strict`: `>`). Prints the `[perf-target]` line, then fails through
 * `fail(message)` on an enforcing environment; elsewhere a miss is only
 * reported (`warn`). Returns whether the target was met.
 */
export function checkBudget(value, budget, label, { strict = false, atLeast = false, unit = 'ms', env = benchEnv(), fail, warn, log = console.log } = {}) {
  if (typeof value !== 'number' || Number.isNaN(value)) throw new TypeError(`checkBudget: ${label}: value is not a number (${value})`);
  const op = opOf({ strict, atLeast });
  log(targetLine(label, value, budget, { strict, atLeast, unit }));
  if (meets(value, budget, op)) return true;
  const message = `${label}: ${round(value)}${unit} (target ${op} ${budget}${unit})`;
  if (enforcesTargets(env)) (fail ?? ((m) => assert.fail(m)))(message);
  else {
    const note = `perf target missed (reported, not failing on ${env}): ${message}`;
    console.warn(note);
    warn?.(note);
  }
  return false;
}

/** node:test form: asserts on an enforcing environment, reports elsewhere. */
export function assertBudget(value, budget, label, options = {}) {
  return checkBudget(value, budget, label, { ...options, fail: (m) => assert.fail(m) });
}
