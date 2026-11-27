// TreeView store budgets in Node: the work half of each timing row. The browser half (to painted)
// is tests/browser/tree-view-perf.spec.ts. Medians of several runs.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTreeStore } from '../dist/internal/tree-store.js';
import { typeahead, createTypeahead } from '../dist/internal/roving.js';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

interface Node {
  id: string;
  name: string;
  children?: Node[];
}

const gc = (globalThis as { gc?: () => void }).gc;
const WORDS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett'];

/** 10 roots × 100 children × 99 grandchildren + 1 = 100,010 nodes. */
function hundredK(): Node[] {
  const roots: Node[] = [];
  for (let r = 0; r < 10; r++) {
    const children: Node[] = [];
    for (let c = 0; c < 100; c++) {
      const leaves: Node[] = [];
      for (let l = 0; l < 99; l++) leaves.push({ id: `${r}.${c}.${l}`, name: `${WORDS[l % 10]} ${l}` });
      children.push({ id: `${r}.${c}`, name: `${WORDS[c % 10]} ${r}.${c}`, children: leaves });
    }
    roots.push({ id: `${r}`, name: `${WORDS[r]} root`, children });
  }
  return roots;
}

const opts = { getItemId: (n: Node) => n.id, getItemLabel: (n: Node) => n.name, getChildren: (n: Node) => n.children };

function median(runs: number[]): number {
  const s = runs.slice().sort((a, b) => a - b);
  return s[s.length >> 1] as number;
}

function measure(runs: number, setup: () => () => void): number {
  const times: number[] = [];
  for (let r = 0; r < runs; r++) {
    const run = setup();
    gc?.();
    const t0 = performance.now();
    run();
    times.push(performance.now() - t0);
  }
  return median(times);
}

describe('tree store performance (100,000 nodes)', () => {
  const data = hundredK();

  it('builds the model with 10 roots expanded (1,010 visible) in <= 30 ms (mount work)', () => {
    const ms = measure(7, () => () => {
      const s = createTreeStore<Node>({ data, ...opts });
      s.setExpandedIds(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
      assert.equal(s.visibleCount, 1010);
    });
    assertBudget(ms, 30, 'tree store build 10 roots expanded');
  });

  it('expands a node with 10,000 children in <= 16 ms work', () => {
    const wide: Node[] = [{ id: 'w', name: 'Wide', children: Array.from({ length: 10_000 }, (_, i) => ({ id: `w${i}`, name: `Child ${i}` })) }, ...data];
    const s = createTreeStore<Node>({ data: wide, ...opts });
    s.setExpandedIds(['0', '1', '2']);
    const ms = measure(9, () => {
      s.setExpanded(0, false);
      return () => s.setExpanded(0, true);
    });
    assert.equal(s.positionOf(s.nodeOf('w9999')), 10_000);
    assertBudget(ms, 16, 'tree store expand 10,000 children');
  });

  it('expandAll over 100,000 nodes in <= 50 ms work (100 ms painted budget)', () => {
    const s = createTreeStore<Node>({ data, ...opts });
    const ms = measure(7, () => {
      s.collapseAll();
      return () => s.expandAll();
    });
    assert.equal(s.visibleCount, 100_010);
    assertBudget(ms, 50, 'tree store expandAll 100,000 nodes');
  });

  it('cascade-checks a parent of 100,000 descendants in <= 16 ms work', () => {
    const one: Node[] = [{ id: 'top', name: 'Top', children: data }];
    const s = createTreeStore<Node>({ data: one, ...opts });
    s.expandAll();
    const ms = measure(9, () => {
      s.uncheckAll();
      return () => {
        s.setChecked(0, true);
        // Reading every rendered row's state (a window of 40) is part of the work.
        for (let p = 0; p < 40; p++) s.bits(s.model.ids[s.order[p] as number] as string);
      };
    });
    assert.equal(s.checkState(s.nodeOf('9.99.98')), 1);
    assertBudget(ms, 16, 'tree store cascade check 100,000 descendants');
    // Toggling one leaf deep inside the checked subtree stays O(depth).
    const leaf = measure(9, () => () => s.setChecked(s.nodeOf('5.50.50'), false));
    assertBudget(leaf, 1, 'tree store leaf toggle in checked subtree');
    assert.equal(s.checkState(0), 2);
  });

  it('a typeahead keystroke over 100,000 visible nodes takes <= 8 ms', () => {
    const s = createTreeStore<Node>({ data, ...opts });
    s.expandAll();
    const state = createTypeahead();
    const label = (p: number) => s.label(s.order[p] as number);
    for (let p = 0; p < s.visibleCount; p++) label(p); // labels are cached after first use
    let t = 0;
    const ms = measure(9, () => {
      t += 1000;
      return () => {
        const at = typeahead(state, 'j', t, s.visibleCount, 50_000, label, () => true);
        assert.ok(at > 50_000);
      };
    });
    assertBudget(ms, 8, 'tree store typeahead keystroke');
  });
});
