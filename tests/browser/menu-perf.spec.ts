import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Interaction budgets for the Menu family, on the
// production build, examples/vite-spa/menu.html.
//
// Method (as chrome-perf.spec.ts `framedClick`): the input is dispatched at
// the start of a frame; the end marker is a MessageChannel task posted once
// the result is in the DOM plus a forced style and layout, so a sample is
// handler + commit + layout of that frame. Warm-up samples are discarded;
// the median is gated, p95 reported.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)] as number;

/** Opens #perf with Enter (a keyboard click) at the start of a frame; ms until the first item is focused and laid out. */
function framedOpen(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        requestAnimationFrame(() => {
          const trigger = document.getElementById('perf');
          if (!trigger) return reject(new Error('no #perf'));
          trigger.focus();
          const t0 = performance.now();
          // Enter on a <button> dispatches a click with detail 0.
          trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
          const check = () => {
            const menu = document.querySelector('[role="menu"][aria-labelledby="perf"][data-placed]');
            if (menu && document.activeElement?.getAttribute('data-item-id') === 'p0') {
              void document.body.offsetHeight;
              const ch = new MessageChannel();
              ch.port1.onmessage = () => resolve(performance.now() - t0);
              ch.port2.postMessage(0);
            } else setTimeout(check, 0);
          };
          queueMicrotask(check);
        });
      }),
  );
}

/** Dispatches `key` on the focused item at the start of a frame; ms until focus moved and was laid out. */
function framedKey(page: Page, key: string): Promise<number> {
  return page.evaluate(
    (k) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const from = document.activeElement as HTMLElement;
          const t0 = performance.now();
          from.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
          void document.body.offsetHeight;
          const ch = new MessageChannel();
          ch.port1.onmessage = () => resolve(performance.now() - t0);
          ch.port2.postMessage(0);
        });
      }),
    key,
  );
}

async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="menu"][aria-labelledby="perf"]')).toHaveCount(0);
}

for (const [count, budget] of [
  [100, 50],
  [1000, 100],
] as const) {
  test(`MenuButton Enter to menu painted with the first item focused, ${count} items: median <= ${budget} ms`, async ({ page }) => {
    await page.goto(`${PROD_URL}menu.html?n=${count}&mode=plain`);
    await expect(page.locator('#perf')).toBeVisible();
    const samples: number[] = [];
    for (let i = 0; i < 13; i++) {
      const ms = await framedOpen(page);
      if (i >= 3) samples.push(ms);
      await closeMenu(page);
    }
    console.log(`[perf] menu open ${count} items: median ${round(median(samples))} ms, p95 ${round(p95(samples))} ms`);
    expectBudget(median(samples), budget, `menu open ${count} items median`);
  });
}

test('open menu with 1,000 items: ArrowDown and typeahead keystroke to focus moved <= 8 ms', async ({ page }) => {
  await page.goto(`${PROD_URL}menu.html?n=1000&mode=plain`);
  await page.focus('#perf');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-item-id="p0"]')).toBeFocused();
  const arrows: number[] = [];
  for (let i = 0; i < 25; i++) {
    const ms = await framedKey(page, 'ArrowDown');
    if (i >= 5) arrows.push(ms);
  }
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-item-id'))).toBe('p25');
  const keys: number[] = [];
  const letters = 'abcde';
  for (let i = 0; i < 25; i++) {
    // Waits out the 500 ms buffer so every sample is a fresh single-letter search over 1,000 labels.
    await page.waitForTimeout(520);
    const ms = await framedKey(page, letters[i % letters.length] as string);
    if (i >= 5) keys.push(ms);
  }
  console.log(`[perf] menu 1000 items: arrow median ${round(median(arrows))} ms p95 ${round(p95(arrows))}; typeahead median ${round(median(keys))} ms p95 ${round(p95(keys))}`);
  expectBudget(median(arrows), 8, 'menu 1000 items arrow median');
  expectBudget(median(keys), 8, 'menu 1000 items typeahead median');
});
