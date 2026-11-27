import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// TreeView timing budgets, production build, examples/vite-spa/tree-view.html?perf=1 (100,010
// nodes: 10 roots x 100 x 99). Method as menu-perf.spec.ts: the input is
// dispatched at the start of a frame; "work" is the synchronous dispatch
// plus React's discrete render and commit (flushed in a microtask),
// "painted" ends in the next task after a forced style and layout. Medians are gated, p95 reported.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)] as number;

type Action = 'twisty' | 'expandAll' | 'collapseAll' | 'check' | 'typeahead';

/** Runs `action` at the start of a frame; returns { work, painted } in ms once `done` holds. */
function framed(page: Page, action: Action, arg: string): Promise<{ work: number; painted: number }> {
  return page.evaluate(
    ([a, x]) =>
      new Promise<{ work: number; painted: number }>((resolve) => {
        requestAnimationFrame(() => {
          const api = (window as unknown as { __perf: { expandAll(): void; collapseAll(): void } }).__perf;
          const row = (label: string) => [...document.querySelectorAll('#perf [role="treeitem"]')].find((el) => el.querySelector('.salmon-tree-view-label')?.textContent === label) as HTMLElement;
          const t0 = performance.now();
          if (a === 'twisty') row(x).querySelector<HTMLElement>('.salmon-tree-view-twisty')!.click();
          else if (a === 'check') row(x).querySelector<HTMLElement>('.salmon-tree-view-checkbox')!.click();
          else if (a === 'expandAll') api.expandAll();
          else if (a === 'collapseAll') api.collapseAll();
          else (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: x, bubbles: true, cancelable: true }));
          // React flushes a discrete update in a microtask: it is part of the work.
          queueMicrotask(() => {
            work = performance.now() - t0;
          });
          let work = performance.now() - t0;
          const ch = new MessageChannel();
          ch.port1.onmessage = () => {
            void document.body.offsetHeight; // style and layout of the committed rows
            resolve({ work, painted: performance.now() - t0 });
          };
          ch.port2.postMessage(0);
        });
      }),
    [action, arg] as const,
  );
}

async function openPerf(page: Page, query: string): Promise<void> {
  await page.goto(`${PROD_URL}tree-view.html?perf=1&mode=plain&${query}`);
  await page.waitForFunction(() => (window as unknown as { __mountMs?: number }).__mountMs !== undefined);
}

test('mount, 100,000 nodes with 10 roots expanded: median <= 50 ms to first painted window', async ({ page }) => {
  const samples: number[] = [];
  for (let r = 0; r < 7; r++) {
    await openPerf(page, '');
    samples.push(await page.evaluate(() => (window as unknown as { __mountMs: number }).__mountMs));
    await expect(page.locator('#perf [role="treeitem"]').first()).toHaveAttribute('aria-setsize', '10');
  }
  const runs = samples.slice(2);
  console.log(`tree-view mount 100k: median ${round(median(runs))} ms, p95 ${round(p95(runs))} ms`);
  expectBudget(median(runs), 50, 'tree-view mount 100k median');
});

test('expand a node with 10,000 children: median <= 16 ms work, <= 50 ms painted', async ({ page }) => {
  await openPerf(page, 'wide=10000');
  const work: number[] = [];
  const painted: number[] = [];
  for (let r = 0; r < 12; r++) {
    const open = await framed(page, 'twisty', 'Wide');
    await expect(page.locator('#perf [role="treeitem"]').first()).toHaveAttribute('aria-expanded', 'true');
    if (r >= 2) {
      work.push(open.work);
      painted.push(open.painted);
    }
    await framed(page, 'twisty', 'Wide');
    await expect(page.locator('#perf [role="treeitem"]').first()).toHaveAttribute('aria-expanded', 'false');
  }
  console.log(`tree-view expand 10k: work median ${round(median(work))} ms (p95 ${round(p95(work))}), painted median ${round(median(painted))} ms (p95 ${round(p95(painted))})`);
  expectBudget(median(work), 16, 'tree-view expand 10k work median');
  expectBudget(median(painted), 50, 'tree-view expand 10k painted median');
});

test('expandAll over 100,000 nodes: median <= 100 ms to painted', async ({ page }) => {
  await openPerf(page, 'collapsed=1');
  const painted: number[] = [];
  for (let r = 0; r < 7; r++) {
    const t = await framed(page, 'expandAll', '');
    if (r >= 2) painted.push(t.painted);
    await framed(page, 'collapseAll', '');
  }
  console.log(`tree-view expandAll 100k: painted median ${round(median(painted))} ms (p95 ${round(p95(painted))})`);
  expectBudget(median(painted), 100, 'tree-view expandAll 100k painted median');
});

test('cascade-check a parent of 100,000 descendants: median <= 16 ms work', async ({ page }) => {
  await openPerf(page, 'top=1');
  const work: number[] = [];
  for (let r = 0; r < 12; r++) {
    const t = await framed(page, 'check', 'Everything');
    if (r >= 2) work.push(t.work);
  }
  await expect(page.locator('#perf [role="treeitem"]').nth(1)).toHaveAttribute('aria-checked', /true|false/);
  console.log(`tree-view cascade check 100k: work median ${round(median(work))} ms (p95 ${round(p95(work))})`);
  expectBudget(median(work), 16, 'tree-view cascade check 100k work median');
});

test('typeahead keystroke over 100,000 visible nodes: median <= 8 ms', async ({ page }) => {
  await openPerf(page, 'collapsed=1');
  await framed(page, 'expandAll', '');
  await page.locator('#perf [role="treeitem"]').first().focus();
  const work: number[] = [];
  const letters = 'abcdefghij';
  for (let r = 0; r < 14; r++) {
    await page.waitForTimeout(550); // a fresh typeahead buffer each time
    const t = await framed(page, 'typeahead', letters[r % letters.length] as string);
    if (r >= 2) work.push(t.painted);
  }
  console.log(`tree-view typeahead 100k: median ${round(median(work))} ms (p95 ${round(p95(work))})`);
  expectBudget(median(work), 8, 'tree-view typeahead 100k median');
});
