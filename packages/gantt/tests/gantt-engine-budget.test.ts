import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeCritical } from '../dist/internal/timeline/project/critical.js';
import { createProjectEngine } from '../dist/internal/timeline/project/engine.js';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

// Gantt project engine budgets:
// 10,000 tasks (1,000 parents of 9 leaves each),
// 15,000 links (one 8,999-link FS chain over all leaves and 6,001 SS fan-out
// links). Medians of 5 runs after warm-up.

const at = (iso: string): number => Date.parse(`${iso}Z`);
const START = at('2026-01-05T08:00');

function data() {
  const tasks: { id: string; parentId: string | null; start?: number; duration?: number; predecessors?: { id: string; type: 'fs' | 'ss'; lag: number; lagUnit: 'day' }[] }[] = [];
  const leaves: string[] = [];
  let links = 0;
  for (let p = 0; p < 1000; p++) {
    tasks.push({ id: `p${p}`, parentId: null });
    for (let c = 0; c < 9; c++) {
      const id = `t${leaves.length}`;
      const k = leaves.length;
      const predecessors: { id: string; type: 'fs' | 'ss'; lag: number; lagUnit: 'day' }[] = [];
      if (k > 0) predecessors.push({ id: `t${k - 1}`, type: 'fs', lag: 0, lagUnit: 'day' });
      if (k >= 5 && k < 5 + 6_001) predecessors.push({ id: `t${k - 5}`, type: 'ss', lag: 0, lagUnit: 'day' });
      links += predecessors.length;
      leaves.push(id);
      tasks.push({ id, parentId: `p${p}`, start: START, duration: 1, predecessors });
    }
  }
  return { tasks, leaves, links };
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;

function measure(fn: (run: number) => void, runs = 5, warm = 3): number {
  for (let k = 0; k < warm; k++) fn(k);
  (globalThis as { gc?: () => void }).gc?.();
  const times: number[] = [];
  for (let k = 0; k < runs; k++) {
    const t0 = performance.now();
    fn(warm + k);
    times.push(performance.now() - t0);
  }
  return median(times);
}

describe('project engine budgets @perf', () => {
  const { tasks, leaves, links } = data();
  it('builds the fixture', () => {
    assert.equal(tasks.length, 10_000);
    assert.equal(links, 15_000);
  });
  const engine = createProjectEngine();
  it('full schedule (load) is reported', () => {
    const ms = measure(() => engine.load(tasks));
    console.log(`gantt engine: load 10,000 tasks / 15,000 links: ${ms.toFixed(2)} ms`);
    assert.ok(Number.isFinite(engine.getSchedule(leaves[leaves.length - 1] as string)!.start));
  });
  it('update at the head of a 1,000-task chain <= 16 ms', () => {
    const head = leaves[8000] as string;
    let changed = 0;
    const ms = measure((run) => {
      const s = engine.getSchedule(head)!.start as number;
      changed = engine.update(head, { start: s + (run % 2 ? -1 : 1) * 86_400_000 }).changed.size;
    });
    console.log(`gantt engine: update rescheduling ${changed} tasks: ${ms.toFixed(2)} ms`);
    assert.ok(changed >= 1000);
    assertBudget(ms, 16, 'gantt engine: update at the head of a 1,000-task chain');
  });
  it('update rescheduling >= 9,000 tasks <= 50 ms', () => {
    const head = leaves[0] as string;
    let changed = 0;
    const ms = measure((run) => {
      changed = engine.update(head, { start: START + (run % 2 ? 0 : 1) * 86_400_000 }).changed.size;
    });
    console.log(`gantt engine: update rescheduling ${changed} tasks: ${ms.toFixed(2)} ms`);
    assert.ok(changed >= 9000);
    assertBudget(ms, 50, 'gantt engine: update rescheduling >= 9,000 tasks');
  });
  it('critical path over 10,000 tasks / 15,000 links <= 50 ms', () => {
    let count = 0;
    const ms = measure(() => {
      count = engine.computeCriticalPath(computeCritical).critical.size;
    });
    console.log(`gantt engine: critical path: ${ms.toFixed(2)} ms (${count} critical)`);
    assert.ok(count > 0);
    assertBudget(ms, 50, 'gantt engine: critical path');
  });
});
