import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Kanban timing budgets (5 columns x 2,000 cards (virtualized), mount <= 100 ms; drag frame <= 16.7
// ms p95), production build, examples/vite-spa/kanban.html?fixture=virtual.
// Mount: from createRoot().render() to the end of the first frame that paints
// cards (a forced style and layout, then a MessageChannel task), the method of
// tree-view-perf.spec.ts; the 10,000 cards are generated before the clock.
// Drag frame: a real pointer press on a card, then one synthetic `pointermove`
// per frame dispatched at the start of the frame on the captured board
// (column-drag-perf.spec.ts "framed" method); the number is handler work plus
// that frame's style, layout and paint, across the five virtual columns.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)] as number;

async function openVirtual(page: Page): Promise<void> {
  await page.goto(`${PROD_URL}kanban.html?fixture=virtual&mode=plain`);
  await page.waitForFunction(() => (window as unknown as { __mountMs?: number }).__mountMs !== undefined);
}

test('mount, 5 columns x 2,000 cards virtualized: median <= 100 ms to first painted window', async ({ page }) => {
  const samples: number[] = [];
  for (let r = 0; r < 7; r++) {
    await openVirtual(page);
    samples.push(await page.evaluate(() => (window as unknown as { __mountMs: number }).__mountMs));
    await expect(page.locator('#virtual .salmon-kanban-cell')).toHaveCount(5);
  }
  const rendered = await page.locator('#virtual [data-card]').count();
  expect(rendered).toBeLessThan(200);
  const runs = samples.slice(2);
  console.log(`kanban mount 5x2000: median ${round(median(runs))} ms, p95 ${round(p95(runs))} ms (${rendered} cards rendered)`);
  expectBudget(median(runs), 100, 'kanban mount 5x2000 median');
});

test('card drag frame across 5 virtual columns: p95 <= 16.7 ms', async ({ page }) => {
  await openVirtual(page);
  const card = page.locator('#virtual [data-card="sv0-2"]');
  const box = (await card.boundingBox())!;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + 10, y0 + 10, { steps: 2 });
  await expect(page.locator('#virtual .salmon-kanban-ghost')).toHaveCount(1);
  const board = (await page.locator('#virtual .salmon-kanban-board').boundingBox())!;
  const frames = await page.evaluate(
    ([left, top, width, height]) =>
      new Promise<number[]>((resolve) => {
        const root = document.getElementById('virtual') as HTMLElement;
        const out: number[] = [];
        const n = 160;
        let i = 0;
        const step = (): void => {
          requestAnimationFrame(() => {
            i++;
            // A zigzag over every column, staying clear of the auto-scroll edges.
            const x = left + 40 + ((i * 9) % (width - 80));
            const y = top + 80 + ((i * 23) % (height - 160));
            const t0 = performance.now();
            root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, buttons: 1 }));
            const ch = new MessageChannel();
            ch.port1.onmessage = () => {
              void document.body.offsetHeight;
              out.push(performance.now() - t0);
              if (out.length >= n) resolve(out);
              else step();
            };
            ch.port2.postMessage(0);
          });
        };
        step();
      }),
    [board.x, board.y, board.width, board.height] as const,
  );
  await expect(page.locator('#virtual [data-drop]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const work = frames.slice(10);
  console.log(`kanban card drag frame: median ${round(median(work))} ms, p95 ${round(p95(work))} ms, max ${round(Math.max(...work))} ms`);
  expectBudget(p95(work), 16.7, 'kanban card drag frame p95');
});
