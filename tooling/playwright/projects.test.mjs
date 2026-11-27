import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { test } from 'node:test';
import { PERF_GREP, functionalWorkers, splitProjects } from './projects.mjs';

test('PW_WORKERS: default 50%, numbers, percentages, auto; rejects anything else', () => {
  assert.equal(functionalWorkers({}), '50%');
  assert.equal(functionalWorkers({ PW_WORKERS: '16' }), 16);
  assert.equal(functionalWorkers({ PW_WORKERS: '75%' }), '75%');
  assert.equal(functionalWorkers({ PW_WORKERS: 'auto' }), Math.max(1, availableParallelism() - 2));
  for (const bad of ['0', '-2', '1.5', 'many']) assert.throws(() => functionalWorkers({ PW_WORKERS: bad }));
});

test('timing tests: *-perf.spec.ts files and perf tags; the timing project runs after functional on one worker', () => {
  assert.ok(PERF_GREP.test('timing scroll-perf.spec.ts scrolling 100k rows'));
  assert.ok(PERF_GREP.test('functional tabs.spec.ts selection a change commits within 16 ms @perf'));
  assert.ok(!PERF_GREP.test('functional tabs.spec.ts selection arrow keys @performance-ish'));
  assert.ok(!PERF_GREP.test('functional performance.spec.ts render counts'));
  const [functional, timing] = splitProjects({});
  assert.equal(functional.fullyParallel, true);
  assert.equal(timing.workers, 1);
  assert.deepEqual(timing.dependencies, ['functional']);
});
