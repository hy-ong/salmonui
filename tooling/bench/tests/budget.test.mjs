// tooling/bench/budget.mjs: product targets assert on `local`, report on `linux-2080ti`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { benchEnv, checkBudget, enforcesTargets, missed, parseTargets, targetLine } from '../budget.mjs';

const quiet = { log: () => {}, warn: () => {} };

test('the default environment is linux-2080ti on Linux and local elsewhere', () => {
  assert.equal(benchEnv({}, 'linux'), 'linux-2080ti');
  assert.equal(benchEnv({}, 'darwin'), 'local');
  assert.equal(benchEnv({ SALMON_BENCH_ENV: 'local' }, 'linux'), 'local');
  assert.equal(enforcesTargets('local'), true);
  assert.equal(enforcesTargets('linux-2080ti'), false);
});

test('a missed target fails on local and is only reported on linux-2080ti', () => {
  const origWarn = console.warn;
  console.warn = () => {};
  try {
    assert.throws(() => checkBudget(5, 4, 'resize frame', { ...quiet, env: 'local' }), /resize frame: 5ms \(target <= 4ms\)/);
    let warned = '';
    assert.equal(checkBudget(5, 4, 'resize frame', { log: () => {}, warn: (m) => (warned = m), env: 'linux-2080ti' }), false);
    assert.match(warned, /not failing on linux-2080ti/);
    assert.equal(checkBudget(4, 4, 'resize frame', { ...quiet, env: 'local' }), true);
    assert.throws(() => checkBudget(4, 4, 'strict', { ...quiet, env: 'local', strict: true }));
    assert.throws(() => checkBudget(150, 200, 'frames', { ...quiet, env: 'local', atLeast: true, strict: true, unit: 'frames' }));
    assert.equal(checkBudget(201, 200, 'frames', { ...quiet, env: 'local', atLeast: true, strict: true, unit: 'frames' }), true);
    assert.throws(() => checkBudget(Number.NaN, 1, 'nan', { ...quiet, env: 'linux-2080ti' }), TypeError);
  } finally {
    console.warn = origWarn;
  }
});

test('target lines parse back, keeping the best value per label', () => {
  const out = [
    targetLine('resize frame', 5.12345, 4),
    targetLine('resize frame', 3.9, 4),
    targetLine('scroll: frames', 180, 200, { atLeast: true, strict: true, unit: 'frames' }),
    targetLine('scroll: frames', 150, 200, { atLeast: true, strict: true, unit: 'frames' }),
    targetLine('mount', 600, 500, { strict: true }),
  ].join('\n');
  const t = parseTargets(out);
  assert.deepEqual(t['resize frame'], { value: 3.9, budget: 4, op: '<=', unit: 'ms' });
  assert.deepEqual(t['scroll: frames'], { value: 180, budget: 200, op: '>', unit: 'frames' });
  assert.equal(missed(t['resize frame']), false);
  assert.equal(missed(t['scroll: frames']), true);
  assert.equal(missed(t['mount']), true);
});
