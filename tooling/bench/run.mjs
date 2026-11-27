// npm run bench. Runs the budget suites, collects every `[perf]` metric, writes a
// JSON report to tooling/bench/results/, and compares against
// tooling/bench/baseline.json for the current environment.
//
// - Suites: the `*performance.test.ts` node suites (their absolute budgets
//   are asserted inside the suites, so a budget miss fails here too); with
//   `--browser`, also the Playwright timing specs (production build; the
//   `timing` project only, one worker, never the functional suite).
// - Environment: SALMON_BENCH_ENV (`linux-2080ti`, `local`, ...); default
//   `linux-2080ti` on Linux (the release environment) and `local` elsewhere
//   (tooling/bench/budget.mjs `benchEnv`). Baselines are per environment.
// - Product targets (tooling/bench/budget.mjs): the absolute budgets the
//   suites check fail them on `local`; on `linux-2080ti` a missed target is
//   only reported, and the gate there is the regression check below. Every
//   check prints a `[perf-target]` line; the bench lists the targets missed
//   by the fastest run as a warning (never a failure), and an upper-bound
//   `ms` target without a `[perf]` metric of the same name becomes a metric.
// - Regression: a metric more than 10 % slower than its baseline fails;
//   metrics below 1 ms also need an absolute slowdown above 0.25 ms, since
//   timer resolution and GC dominate there. Failing metrics are re-measured
//   once (two consecutive failures are a real failure); improvements above
//   10 % are reported so the baseline can be updated in the same PR.
// - Core paths (tooling/bench/core-paths.mjs):
//   only a regression or a missing baseline metric on a core path fails;
//   the same on any other metric is printed as a warning. `--all-paths`
//   fails on every metric (the pre-2026-11-11 behavior).
// - Quiet runs on a shared Linux machine (tooling/bench/quiet.mjs): `--pin=<cpus>`
//   runs every suite under `taskset -c`, `--nice=<n>` at that absolute
//   niceness (below the current one through passwordless sudo),
//   `--wait-quiet[=<percent>]` waits before each suite run until the pinned
//   CPUs are below that busy percentage (default 10), and `--netns` runs the
//   browser specs in tooling/playwright/netns.sh. The `linux-2080ti`
//   environment turns all four on (`--no-wait-quiet`, `--no-netns` opt out).
//   `--repeat=<n>` runs each node suite file in n processes and keeps each
//   metric's fastest median (`linux-2080ti`: 2); `--short-repeat=<n>` runs
//   the files that measure a metric whose baseline is below 10 ms in n
//   processes in all (default: the repeat count). The environment's
//   `nodeFlags` go to every node suite process (`linux-2080ti`:
//   `--single-threaded-gc`, see quiet.mjs).
// - Node suites: the `*performance.test.ts` files and the `@perf` tests of
//   the other node test files (the `test:perf` set), one process per file.
// - Browser (`--browser`): the whole Playwright `timing` project.
// - `--update-baseline` writes the measured values as the baseline for the
//   environment instead of comparing.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { benchEnv, missed, parseTargets } from './budget.mjs';
import { corePath } from './core-paths.mjs';
import { resolveQuietOptions, waitQuiet, wrapCommand } from './quiet.mjs';

const root = new URL('../../', import.meta.url).pathname;
const args = new Set(process.argv.slice(2));
const env = benchEnv();
const baselineFile = join(root, 'tooling/bench/baseline.json');
const resultsDir = join(root, 'tooling/bench/results');
const TOLERANCE = 0.1;
const SMALL_MS = 1;
const SMALL_FLOOR_MS = 0.25;
// Metrics whose baseline is below this take `quiet.shortRepeat` processes.
const SHORT_METRIC_MS = 10;
const quiet = resolveQuietOptions(env, process.argv.slice(2));
const quietSamples = [];

/** Runs a measured command pinned and niced as configured, after waiting for quiet CPUs. */
function measured(command, commandArgs, { netns = false, sampleMs = 2000, samples = 2 } = {}) {
  if (quiet.waitQuiet !== null) quietSamples.push(Number(waitQuiet(quiet, { sampleMs, samples }).busy.toFixed(1)));
  const line = wrapCommand(command, commandArgs, { ...quiet, netns: netns && quiet.netns }, { root });
  return spawnSync(line.command, line.args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function sha() {
  // A synced copy without its git directory (a test machine) passes the commit in.
  if (process.env.SALMON_BENCH_SHA) return process.env.SALMON_BENCH_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Parses `[perf]` lines into `{ metric: ms }`. Table rows and retry notices are skipped. */
export function parsePerf(output) {
  const metrics = {};
  for (const raw of output.split('\n')) {
    const at = raw.indexOf('[perf] ');
    if (at === -1) continue;
    const line = raw.slice(at + 7).trim();
    if (line.includes('|') || line.includes('retrying')) continue;
    let m;
    if ((m = /^(.+?): median=([\d.]+)ms/.exec(line))) metrics[m[1]] = Number(m[2]);
    else if ((m = /^(.+?): \w+=[\d.]+ms cold=([\d.]+)ms warm=([\d.]+)ms ratio=/.exec(line))) {
      // Cold and warm runs of a scenario compared with a recorded reference median.
      metrics[`${m[1]} (cold)`] = Number(m[2]);
      metrics[`${m[1]} (warm)`] = Number(m[3]);
    } else if ((m = /^(.+?): ([\d.]+)ms$/.exec(line))) metrics[m[1]] = Number(m[2]);
    else {
      // `key=12.3ms` pairs, prefixed by the non-timing context of the line.
      const pairs = [...line.matchAll(/([\w.]+)=([\d.]+)ms/g)];
      if (!pairs.length) continue;
      const context = line.replace(/\s*[\w.]+=[\d.,]+(?:ms|MB)?(?:\s*\([^)]*\))?/g, ' ').trim();
      const prefix = [...line.matchAll(/(rows|cols)=(\d+)/g)].map((p) => `${p[1]}=${p[2]}`).join(' ');
      for (const [, key, value] of pairs) metrics[[prefix || context, key].filter(Boolean).join(' ')] = Number(value);
    }
  }
  return metrics;
}

let examplesBuilt = false;

/** Per-metric minimum over several parsed runs. */
function minMetrics(runs) {
  const merged = {};
  for (const run of runs) for (const [k, v] of Object.entries(run)) merged[k] = k in merged ? Math.min(merged[k], v) : v;
  return merged;
}

/** Metrics of one run's output: `[perf]` lines, plus upper-bound `ms` targets without a metric of their own. */
function runMetrics(text) {
  const metrics = parsePerf(text);
  for (const [label, t] of Object.entries(parseTargets(text))) if (t.unit === 'ms' && t.op.startsWith('<') && !(label in metrics)) metrics[label] = t.value;
  return metrics;
}

/** The node files the bench runs: `{ file, perfOnly }` (`perfOnly`: only its `@perf` tests). */
function nodeFiles() {
  const suites = globSync('packages/*/tests/**/*performance.test.ts', { cwd: root }).sort();
  const tagged = globSync(['packages/*/tests/**/*.test.ts', 'tests/ssr/*.test.ts'], { cwd: root })
    .filter((f) => !f.endsWith('performance.test.ts') && readFileSync(join(root, f), 'utf8').includes('@perf'))
    .sort();
  return [...suites.map((file) => ({ file, perfOnly: false })), ...tagged.map((file) => ({ file, perfOnly: true }))];
}

/**
 * Runs node test files, each `quiet.repeat` times (round-robin, so a slow
 * period of the machine spreads over files), then the files with a short
 * metric (its baseline, or this run without one, below SHORT_METRIC_MS) up
 * to `quiet.shortRepeat` times in all.
 */
function runNode(files, baseMetrics, out) {
  const entries = files.map((f) => ({ ...f, runs: [], failed: 0 }));
  const once = (entry) => {
    // One 0.5 s quiet sample per process: a node file runs in seconds and
    // runs about a hundred times, so 2 s samples would add minutes of waiting.
    // `quiet.nodeFlags` go to the node process (and so to the test file's).
    const node = measured(process.execPath, [...quiet.nodeFlags, '--test', '--expose-gc', '--test-concurrency=1', ...(entry.perfOnly ? ['--test-name-pattern=@perf'] : []), entry.file], { sampleMs: 500, samples: 1 });
    const text = `${node.stdout}\n${node.stderr}`;
    out.push(text);
    entry.runs.push(runMetrics(text));
    if (node.status !== 0) entry.failed++;
  };
  for (let i = 0; i < quiet.repeat; i++) for (const entry of entries) once(entry);
  const isShort = (entry) => Object.entries(minMetrics(entry.runs)).some(([k, v]) => (typeof baseMetrics?.[k] === 'number' ? baseMetrics[k] : v) < SHORT_METRIC_MS);
  const short = entries.filter(isShort);
  for (let i = quiet.repeat; i < quiet.shortRepeat; i++) for (const entry of short) once(entry);
  return { entries, shortFiles: short.length };
}

/**
 * One measuring pass. `only` limits it to a set of node files and whether
 * the browser specs run (the re-measure of regressed metrics).
 */
function runSuites(baseMetrics, only = null) {
  const out = [];
  const failures = [];
  const t0 = performance.now();
  const { entries, shortFiles } = runNode(nodeFiles().filter((f) => !only || only.files.has(f.file)), baseMetrics, out);
  const fileOf = {};
  const runs = [];
  let processes = 0;
  for (const entry of entries) {
    processes += entry.runs.length;
    for (const k of Object.keys(minMetrics(entry.runs))) fileOf[k] = entry.file;
    runs.push(...entry.runs);
    // A failure in every process of a file is a failure; one slow process is not.
    if (entry.failed === entry.runs.length) failures.push(`node suite ${entry.file} failed in every process (a test error, or a missed target on an enforcing environment); see output above`);
    else if (entry.failed) console.warn(`bench: ${entry.file} failed in ${entry.failed} of ${entry.runs.length} processes (passed in the others)`);
  }
  console.log(`bench: node suites: ${entries.length} files, ${processes} processes (${shortFiles} files with a metric below ${SHORT_METRIC_MS} ms at ${quiet.shortRepeat} runs), ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  const browserMetrics = new Set();
  if (args.has('--browser') && (!only || only.browser)) {
    const b0 = performance.now();
    // `npm run bench` starts with `npm run build`, whose clean step removes the
    // examples' dist; the Playwright preview server needs them built again.
    if (!examplesBuilt) {
      const ex = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'examples:build'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (ex.status !== 0) {
        out.push(ex.stdout, ex.stderr);
        failures.push('examples:build failed');
        return { text: out.join('\n'), failures, metrics: minMetrics(runs), fileOf, browserMetrics };
      }
      examplesBuilt = true;
    }
    // The whole `timing` project (tooling/playwright/projects.mjs), without its
    // `functional` dependency: the bench measures, it does not re-run the
    // functional suite, and a functional failure must not skip the timings.
    const pw = measured(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'test', '--project=timing', '--no-deps', '--workers=1'], { netns: true });
    const text = `${pw.stdout}\n${pw.stderr}`;
    out.push(text);
    if (pw.status !== 0) failures.push('browser timing specs failed');
    const m = runMetrics(text);
    for (const k of Object.keys(m)) browserMetrics.add(k);
    runs.push(m);
    console.log(`bench: browser timing project ${((performance.now() - b0) / 1000).toFixed(0)}s`);
  }
  return { text: out.join('\n'), failures, metrics: minMetrics(runs), fileOf, browserMetrics };
}

function compare(metrics, base) {
  const regressions = [];
  const improvements = [];
  for (const [name, ms] of Object.entries(metrics)) {
    const b = base[name];
    if (typeof b !== 'number' || b <= 0) continue;
    const ratio = ms / b;
    const slower = ms - b;
    if (ratio > 1 + TOLERANCE && (b >= SMALL_MS || slower > SMALL_FLOOR_MS)) regressions.push({ name, ms, baseline: b, ratio });
    else if (ratio < 1 - TOLERANCE && (b >= SMALL_MS || -slower > SMALL_FLOOR_MS)) improvements.push({ name, ms, baseline: b, ratio });
  }
  return { regressions, improvements };
}

const baselines = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : { environments: {} };
const base = baselines.environments?.[env];
const benchStart = performance.now();
const first = runSuites(base?.metrics);
// Node's spec reporter marks a failing test `✖` and prints its AssertionError (the TAP reporter: `not ok`).
process.stdout.write(first.text.split('\n').filter((l) => /\[perf\]|^not ok|# (pass|fail)|^ℹ (pass|fail) |✘|✖|AssertionError|^\s+\d+ (passed|failed|flaky)|^Error/.test(l)).join('\n') + '\n');
const metrics = { ...first.metrics };
const outputs = [first.text];
const problems = [...first.failures];
let regressions = [];
let improvements = [];

if (!args.has('--update-baseline') && base) {
  ({ regressions, improvements } = compare(metrics, base.metrics ?? {}));
  // Re-measure only when a regression would fail (core path or --all-paths).
  if (regressions.some((r) => args.has('--all-paths') || corePath(r.name))) {
    console.log(`bench: ${regressions.length} metrics regressed; re-measuring once`);
    const regressed = regressions.map((r) => r.name);
    const second = runSuites(base.metrics, {
      files: new Set(regressed.map((n) => first.fileOf[n]).filter(Boolean)),
      browser: regressed.some((n) => first.browserMetrics.has(n)),
    });
    outputs.push(second.text);
    for (const r of regressions) if (r.name in second.metrics) metrics[r.name] = Math.min(metrics[r.name], second.metrics[r.name]);
    ({ regressions, improvements } = compare(metrics, base.metrics ?? {}));
  }
}

// Product targets the fastest run missed: reported, never failing here (on
// an enforcing environment the suite that checks them already failed).
const targetsMissed = Object.entries(parseTargets(outputs.join('\n')))
  .filter(([, t]) => missed(t))
  .map(([label, t]) => ({ label, value: `${t.value}${t.unit}`, target: `${t.op} ${t.budget}${t.unit}` }));

const report = {
  sha: sha(),
  environment: env,
  date: new Date().toISOString(),
  node: process.version,
  platform: `${os.platform()} ${os.arch()} ${os.cpus()[0]?.model ?? ''}`.trim(),
  loadavg: os.loadavg(),
  ...(quiet.machine ? { machine: quiet.machine } : {}),
  ...(quiet.pin || quiet.nice !== null || quiet.waitQuiet !== null
    ? { quietRun: { pin: quiet.pin, nice: quiet.nice, waitQuiet: quiet.waitQuiet, repeat: quiet.repeat, shortRepeat: quiet.shortRepeat, nodeFlags: quiet.nodeFlags, busyBeforeRuns: quietSamples } }
    : {}),
  fixtureSeed: 'packages/data-grid-core/tests/fixtures.ts, tooling/bench/fixtures/tree-large.ts (deterministic)',
  wallSeconds: Math.round((performance.now() - benchStart) / 1000),
  metrics,
  regressions,
  improvements,
  targetsMissed,
};
mkdirSync(resultsDir, { recursive: true });
const reportFile = join(resultsDir, `${env}-${report.sha.slice(0, 12)}.json`);
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(`bench: ${Object.keys(metrics).length} metrics written to ${reportFile.slice(root.length)}`);

if (args.has('--update-baseline')) {
  baselines.environments ??= {};
  baselines.environments[env] = {
    sha: report.sha,
    node: report.node,
    platform: report.platform,
    ...(report.machine ? { machine: report.machine } : {}),
    ...(report.quietRun ? { quietRun: { pin: quiet.pin, nice: quiet.nice, waitQuiet: quiet.waitQuiet, repeat: quiet.repeat, shortRepeat: quiet.shortRepeat, nodeFlags: quiet.nodeFlags } } : {}),
    date: report.date,
    metrics,
  };
  writeFileSync(baselineFile, `${JSON.stringify(baselines, null, 2)}\n`);
  console.log(`bench: baseline for "${env}" updated in tooling/bench/baseline.json`);
} else if (!base) {
  console.log(`bench: no baseline for environment "${env}" in tooling/bench/baseline.json; relative regression check skipped (record one with --update-baseline on that environment)`);
}
for (const r of improvements) console.log(`bench: improved ${r.name}: ${r.ms}ms vs ${r.baseline}ms (${((1 - r.ratio) * 100).toFixed(1)} % faster); update the baseline in this PR`);
const allPaths = args.has('--all-paths');
const warnings = [];
/** Core-path (or `--all-paths`) findings fail; the rest are warnings. */
const classify = (name, message) => {
  const path = corePath(name);
  if (path || allPaths) problems.push(`${message}${path ? ` [core: ${path}]` : ''}`);
  else warnings.push(`${message} [not a core path]`);
};
for (const r of regressions) classify(r.name, `regressed ${r.name}: ${r.ms}ms vs baseline ${r.baseline}ms (+${((r.ratio - 1) * 100).toFixed(1)} %)`);
const missing = base ? Object.keys(base.metrics ?? {}).filter((k) => !(k in metrics)) : [];
for (const k of missing) classify(k, `baseline metric "${k}" was not measured (renamed or removed scenario; update the baseline)`);
if (targetsMissed.length) {
  console.warn(`bench: targets missed: ${targetsMissed.length} metrics above their product target (warning, not failing):`);
  for (const t of targetsMissed) console.warn(`  target missed: ${t.label}: ${t.value} (target ${t.target})`);
}
for (const w of warnings) console.warn(`warning: ${w}`);
if (warnings.length) console.warn(`bench: ${warnings.length} warnings on metrics outside the core paths (reported, not failing)`);

if (problems.length) {
  for (const p of problems) console.error(`error: ${p}`);
  console.error(`bench: FAILED (${problems.length})`);
  process.exit(1);
}
console.log(`bench: OK${warnings.length ? ` with ${warnings.length} non-core warnings` : ''}${targetsMissed.length ? `, ${targetsMissed.length} targets missed` : ''} (${report.wallSeconds}s)`);
