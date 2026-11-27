// Quiet-run mode for `npm run bench` on a shared Linux machine: pin the
// measured processes to a CPU set (`taskset`), raise their priority (`nice`,
// negative values through passwordless sudo), and optionally wait until the
// pinned CPUs are idle before each suite run. See tooling/bench/run.mjs.
import { readFileSync } from 'node:fs';
import os from 'node:os';

/**
 * Per-environment defaults. Command-line flags override them. `pin` lists
 * whole physical cores (both hyper-threads) so no other task shares a core
 * with the measured one; `waitQuiet` is the busy percentage of the pinned
 * CPUs below which a run may start.
 */
export const ENVIRONMENTS = {
  local: { machine: 'Apple M5 Max (development Mac)' },
  'linux-2080ti': {
    machine: 'Linux test box, Intel Core i9-13900K (4 pinned P-cores)',
    // P-cores are CPUs 0-15 (8 cores x 2 threads). Cores 0-1 take most
    // interrupts and system daemons, cores 4-5 boost higher and less
    // predictably, so the bench uses the remaining four cores.
    pin: '4-7,12-15',
    nice: -10,
    waitQuiet: 10,
    netns: true,
    // Node processes run with a single-threaded garbage collector. The
    // suites force a full GC before every timed run; with the default
    // parallel and concurrent collector, its sweeper threads were still
    // working through the 100k x 100 fixture heap during the timed body,
    // and parallel scavenges and compaction gave the fixture a different
    // memory layout in every process, so short cold metrics landed in a
    // 2-3x slower mode in some processes. Single-threaded, the GC work stays
    // inside the forced collection and the layout no longer depends on
    // thread timing.
    nodeFlags: ['--single-threaded-gc'],
    // Each node suite file in 2 processes, fastest median per metric (see
    // run.mjs). Measured on this box (12 processes per file, baseline, run
    // and re-measure drawn from disjoint processes, 20,000 simulated
    // bench runs): no false failure on any core metric; a 15 % slowdown of
    // a core metric of 1 ms or more is caught in 77-100 % of runs, 20 % in
    // 94-100 %.
    repeat: 2,
  },
};

/** Parses `0-3,8,10-11` into CPU ids. Throws on malformed input. */
export function parseCpuList(list) {
  const cpus = new Set();
  for (const part of String(list).split(',')) {
    const m = /^\s*(\d+)(?:-(\d+))?\s*$/.exec(part);
    if (!m) throw new Error(`bench: invalid CPU list "${list}"`);
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (to < from) throw new Error(`bench: invalid CPU range "${part}"`);
    for (let c = from; c <= to; c++) cpus.add(c);
  }
  return [...cpus].sort((a, b) => a - b);
}

/**
 * Resolves the quiet-run options from the environment preset, `SALMON_BENCH_*`
 * variables and `--pin=`, `--nice=`, `--wait-quiet[=percent]`, `--no-wait-quiet`,
 * `--repeat=`, `--netns` / `--no-netns` flags (later sources win).
 */
export function resolveQuietOptions(env, argv, vars = process.env) {
  const preset = ENVIRONMENTS[env] ?? {};
  const opts = { machine: preset.machine ?? null, pin: preset.pin ?? null, nice: preset.nice ?? null, waitQuiet: preset.waitQuiet ?? null, netns: preset.netns ?? false, repeat: preset.repeat ?? 1, shortRepeat: preset.shortRepeat ?? null, nodeFlags: [...(preset.nodeFlags ?? [])] };
  if (vars.SALMON_BENCH_PIN) opts.pin = vars.SALMON_BENCH_PIN;
  if (vars.SALMON_BENCH_NICE) opts.nice = Number(vars.SALMON_BENCH_NICE);
  if (vars.SALMON_BENCH_WAIT_QUIET) opts.waitQuiet = Number(vars.SALMON_BENCH_WAIT_QUIET);
  if (vars.SALMON_BENCH_REPEAT) opts.repeat = Number(vars.SALMON_BENCH_REPEAT);
  if (vars.SALMON_BENCH_SHORT_REPEAT) opts.shortRepeat = Number(vars.SALMON_BENCH_SHORT_REPEAT);
  for (const arg of argv) {
    let m;
    if ((m = /^--pin=(.+)$/.exec(arg))) opts.pin = m[1];
    else if ((m = /^--nice=(-?\d+)$/.exec(arg))) opts.nice = Number(m[1]);
    else if (arg === '--wait-quiet') opts.waitQuiet ??= 10;
    else if ((m = /^--wait-quiet=(\d+(?:\.\d+)?)$/.exec(arg))) opts.waitQuiet = Number(m[1]);
    else if (arg === '--no-wait-quiet') opts.waitQuiet = null;
    else if ((m = /^--repeat=(\d+)$/.exec(arg))) opts.repeat = Number(m[1]);
    else if ((m = /^--short-repeat=(\d+)$/.exec(arg))) opts.shortRepeat = Number(m[1]);
    else if (arg === '--netns') opts.netns = true;
    else if (arg === '--no-netns') opts.netns = false;
  }
  if (opts.pin) parseCpuList(opts.pin);
  if (!Number.isInteger(opts.repeat) || opts.repeat < 1) throw new Error(`bench: invalid repeat count ${opts.repeat}`);
  // Never fewer runs for a short metric than for any other.
  opts.shortRepeat = Math.max(opts.repeat, opts.shortRepeat ?? opts.repeat);
  if (!Number.isInteger(opts.shortRepeat)) throw new Error(`bench: invalid short-metric repeat count ${opts.shortRepeat}`);
  if (opts.nice !== null && !Number.isInteger(opts.nice)) throw new Error(`bench: invalid niceness ${opts.nice}`);
  if ((opts.pin || opts.netns) && process.platform !== 'linux') throw new Error('bench: --pin and --netns need Linux (taskset, network namespaces)');
  return opts;
}

/**
 * The command line that runs `command args` pinned and at the requested
 * absolute niceness. `nice -n` is relative, so the step is computed from the
 * current priority; a step below zero needs root and goes through `sudo -n`,
 * then drops back to the calling user with the calling environment.
 */
export function wrapCommand(command, args, opts, { root, user = os.userInfo().username, current = os.getPriority(), path = process.env.PATH ?? '' } = {}) {
  let line = [command, ...args];
  if (opts.pin) line = ['taskset', '-c', opts.pin, ...line];
  if (opts.nice !== null && opts.nice !== undefined && opts.nice !== current) {
    const step = String(opts.nice - current);
    line = opts.nice < current
      ? ['sudo', '-n', '-E', 'nice', '-n', step, 'sudo', '-n', '-E', '-u', user, 'env', `PATH=${path}`, ...line]
      : ['nice', '-n', step, ...line];
  }
  if (opts.netns) line = [`${root}tooling/playwright/netns.sh`, ...line];
  return { command: line[0], args: line.slice(1) };
}

/** Busy and total jiffies per CPU from /proc/stat. */
function cpuTimes() {
  const times = new Map();
  for (const line of readFileSync('/proc/stat', 'utf8').split('\n')) {
    const m = /^cpu(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const v = m[2].trim().split(/\s+/).map(Number);
    const idle = (v[3] ?? 0) + (v[4] ?? 0);
    const total = v.slice(0, 8).reduce((a, b) => a + b, 0);
    times.set(Number(m[1]), { busy: total - idle, total });
  }
  return times;
}

/** Busy percentage of `cpus` over `ms` (Linux /proc/stat; elsewhere the 1-minute load per CPU). */
export function sampleBusy(cpus, ms = 2000) {
  if (process.platform !== 'linux') return (os.loadavg()[0] / os.cpus().length) * 100;
  const a = cpuTimes();
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  const b = cpuTimes();
  let busy = 0;
  let total = 0;
  for (const c of cpus) {
    const x = a.get(c);
    const y = b.get(c);
    if (!x || !y) continue;
    busy += y.busy - x.busy;
    total += y.total - x.total;
  }
  return total > 0 ? (busy / total) * 100 : 0;
}

/**
 * Waits until the pinned CPUs (all CPUs when not pinned) are below
 * `threshold` percent busy for `samples` consecutive samples of `sampleMs`
 * (default two), at most `timeoutMs`. Returns the last sample and whether it
 * was quiet.
 */
export function waitQuiet(opts, { timeoutMs = 15 * 60_000, sampleMs = 2000, samples = 2, log = console.log } = {}) {
  const cpus = opts.pin ? parseCpuList(opts.pin) : os.cpus().map((_, i) => i);
  const end = Date.now() + timeoutMs;
  let streak = 0;
  let busy = 100;
  let waited = false;
  while (Date.now() < end) {
    busy = sampleBusy(cpus, sampleMs);
    if (busy < opts.waitQuiet) {
      if (++streak >= samples) return { busy, quiet: true };
      continue;
    }
    streak = 0;
    if (!waited) log(`bench: waiting for CPUs ${opts.pin ?? 'all'} to be below ${opts.waitQuiet} % busy (now ${busy.toFixed(1)} %)`);
    waited = true;
  }
  log(`bench: CPUs still ${busy.toFixed(1)} % busy after ${Math.round(timeoutMs / 60_000)} min; measuring anyway`);
  return { busy, quiet: false };
}
