// release:verify: the gate runner (there is no hosted CI). Runs every gate
// and must pass before a tag.
// `bench` fails only on core-path regressions (tooling/bench/core-paths.mjs).
//
// Steps run in phases (CONTRIBUTING.md "Parallel test runs"): the build
// steps in order, then the independent checks concurrently, then the
// functional browser suites concurrently (each on its own port base), then
// every timing step alone, one after another. A concurrent step's output is
// buffered and printed whole, in step order.
// Stops after the first phase with a failure; `--keep-going` runs every
// phase and prints a summary. `--skip=<step,...>` skips named steps (local
// use only; a release run must not skip anything). `--serial` runs every
// step one at a time (the order is the same).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { benchEnv, enforcesTargets } from '../bench/budget.mjs';
import { RELEASE_VERSION, verifyReleasePlan } from './release-plan.mjs';

const root = new URL('../../', import.meta.url).pathname;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const keepGoing = process.argv.includes('--keep-going');
const serial = process.argv.includes('--serial');
const skip = new Set((process.argv.find((a) => a.startsWith('--skip='))?.slice(7) ?? '').split(',').filter(Boolean));

// Port bases of the concurrent Playwright suites (CONTRIBUTING.md): the
// browser suite keeps SALMON_UI_PORT_BASE, the SSR and a11y suites sit 100
// and 200 above it, clear of 41760 and the default SITE_PORT 41800.
const base = Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730);

/**
 * A step that runs `npm run <args>`; resolves { ok, log }. With `stream`
 * (a step that runs alone) the output goes straight to the terminal.
 */
const run =
  (args, env = {}) =>
  ({ stream }) =>
    new Promise((resolve) => {
      const child = spawn(npm, ['run', ...args], { cwd: root, env: { ...process.env, ...(stream ? {} : { FORCE_COLOR: '0' }), ...env }, stdio: ['ignore', stream ? 'inherit' : 'pipe', stream ? 'inherit' : 'pipe'] });
      const chunks = [];
      child.stdout?.on('data', (d) => chunks.push(d));
      child.stderr?.on('data', (d) => chunks.push(d));
      child.on('close', (code) => resolve({ ok: code === 0, log: Buffer.concat(chunks).toString('utf8') }));
    });

async function changesetStatus() {
  const lines = [];
  if (!existsSync(join(root, '.changeset/config.json'))) {
    return { ok: false, log: 'changeset status: .changeset/config.json is missing; Changesets is not configured\n' };
  }
  if (!existsSync(join(root, 'node_modules/@changesets/cli'))) return { ok: false, log: 'changeset status: @changesets/cli is not installed\n' };
  // Every published package, and only those, must release as exactly
  // RELEASE_VERSION.
  const errors = verifyReleasePlan(root);
  for (const e of errors) lines.push(`changeset status: ${e}`);
  if (!errors.length) lines.push(`changeset status: every published package releases as ${RELEASE_VERSION}`);
  return { ok: errors.length === 0, log: lines.join('\n') + '\n' };
}

// [phase, [[name, step, aliases?], ...]]. Names are what --skip takes; an
// alias skips the step too (`test` covers test:unit and test:perf).
const PHASES = [
  [
    'build',
    [
      ['build', run(['build'])],
      // The offline index @salmonui/mcp bundles (dist/index.json, read from the
      // built declarations and the site content); pack:check requires it.
      ['mcp:index', run(['mcp:index'])],
      // Builds the three examples (the browser and SSR suites serve them) and checks their artifacts.
      ['test:examples', run(['test:examples:run'])],
      // Not with the checks: tooling tests (test:unit) share its node_modules/.cache build folder.
      ['bundle:check', run(['bundle:check'])],
    ],
    { serial: true },
  ],
  [
    'checks',
    [
      // Component isolation.
      ['isolation:check', run(['isolation:check'])],
      ['typecheck', run(['typecheck'])],
      ['test:unit', run(['test:unit']), ['test']],
      ['test:types', run(['test:types'])],
      ['deps:check', run(['deps:check'])],
      ['server:boundary:check', run(['server:boundary:check'])],
      ['feature:boundary:check', run(['feature:boundary:check'])],
      ['pack:check', run(['pack:check'])],
      ['changeset status', changesetStatus],
    ],
  ],
  [
    'functional browser suites',
    [
      ['test:ssr', run(['test:ssr:run', '--', '--project=functional'], { SALMON_UI_PORT_BASE: String(base + 100) })],
      ['test:browser', run(['test:browser:run', '--', '--project=functional'], { SALMON_UI_PORT_BASE: String(base) })],
      ['test:a11y', run(['test:a11y:run', '--', '--project=functional'], { SALMON_UI_PORT_BASE: String(base + 200) })],
    ],
  ],
  [
    'timing (one step at a time)',
    [
      ['test:perf', run(['test:perf']), ['test']],
      ['test:browser timing', run(['test:browser:run', '--', '--project=timing', '--no-deps']), ['test:browser']],
      // The committed baseline holds the browser timing metrics too; without
      // --browser they would be reported as missing. On Linux the bench
      // environment defaults to `linux-2080ti` (tooling/bench/budget.mjs),
      // whose preset measures in quiet mode (pinned, niced, after waiting
      // for idle CPUs, browser specs in netns.sh); on that environment the
      // timing steps report missed product targets and the bench's
      // regression check against the baseline is the gate.
      ['bench --browser', run(['bench:run', '--', '--browser']), ['bench']],
    ],
    { serial: true },
  ],
];

const isSkipped = (name, aliases = []) => [name, name.split(' ')[0], ...aliases].some((n) => skip.has(n));

async function main() {
  const env = benchEnv();
  console.log(`release:verify: bench environment ${env} (${enforcesTargets(env) ? 'absolute product targets fail the timing steps' : 'product targets reported; the bench regression check gates'})`);
  const results = [];
  let stopped = false;
  for (const [phase, steps, opts = {}] of PHASES) {
    if (stopped) {
      for (const [name] of steps) results.push([name, 'not run']);
      continue;
    }
    console.log(`\n=== release:verify: ${phase} ===`);
    const todo = steps.filter(([name, , aliases]) => {
      if (!isSkipped(name, aliases)) return true;
      results.push([name, 'skipped']);
      return false;
    });
    const alone = serial || opts.serial;
    const outcomes = new Array(todo.length);
    let printed = 0;
    // Prints finished steps in order, as soon as every earlier step is done.
    const flush = () => {
      while (printed < todo.length && outcomes[printed]) {
        const [name] = todo[printed];
        const o = outcomes[printed];
        if (alone) console.log(`--- ${name}: ${o.ok ? 'pass' : 'FAIL'} (${o.seconds}s) ---`);
        else {
          console.log(`\n--- ${name} (${o.ok ? 'pass' : 'FAIL'}, ${o.seconds}s) ---`);
          process.stdout.write(o.log.endsWith('\n') || !o.log ? o.log : `${o.log}\n`);
        }
        printed++;
      }
    };
    const start = async (i) => {
      const t0 = performance.now();
      if (alone) console.log(`\n--- ${todo[i][0]} ---`);
      const o = await todo[i][1]({ stream: alone });
      outcomes[i] = { ...o, seconds: ((performance.now() - t0) / 1000).toFixed(1) };
      flush();
    };
    const t0 = performance.now();
    if (alone) {
      for (let i = 0; i < todo.length; i++) {
        await start(i);
        if (!outcomes[i].ok && !keepGoing) break;
      }
    } else await Promise.all(todo.map((_, i) => start(i)));
    console.log(`\n=== ${phase}: ${((performance.now() - t0) / 1000).toFixed(1)}s ===`);
    todo.forEach(([name], i) => results.push(outcomes[i] ? [name, outcomes[i].ok ? 'pass' : 'FAIL', outcomes[i].seconds] : [name, 'not run']));
    if (outcomes.some((o) => o && !o.ok) && !keepGoing) stopped = true;
  }

  console.log('\nrelease:verify summary');
  for (const [name, status, s] of results) console.log(`  ${status.padEnd(7)} ${name}${s ? ` (${s}s)` : ''}`);
  const failed = results.filter(([, s]) => s === 'FAIL').length;
  const notRun = results.filter(([, s]) => s === 'not run').length;
  if (notRun) console.log(`  ${notRun} steps not run (stopped after the first failing phase; pass --keep-going to run all)`);
  if (failed || skip.size || notRun) {
    console.error(`release:verify: FAILED${failed ? ` (${failed} failing steps)` : ''}${skip.size ? ' (steps were skipped)' : ''}`);
    process.exit(1);
  }
  console.log('release:verify: OK');
}

await main();
