import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Interaction budgets for the Button family, on the
// production build, examples/vite-spa/buttons.html?perf. The
// Menu family budgets are in menu-perf.spec.ts. Method as menu-perf.spec.ts:
// the input is dispatched at the start of a frame; the end marker is a
// MessageChannel task posted once the result is in the DOM plus a forced
// style and layout. Warm-up samples are discarded; the median is gated.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;
const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/** Clicks `#id` at the start of a frame; ms until `aria-pressed` flipped and was laid out. */
function framedToggle(page: Page, id: string): Promise<number> {
  return page.evaluate(
    (target) =>
      new Promise<number>((resolve, reject) => {
        requestAnimationFrame(() => {
          const el = document.getElementById(target);
          if (!el) return reject(new Error(`no #${target}`));
          const before = el.getAttribute('aria-pressed');
          const t0 = performance.now();
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
          const check = () => {
            if (el.getAttribute('aria-pressed') !== before) {
              void document.body.offsetHeight;
              const ch = new MessageChannel();
              ch.port1.onmessage = () => resolve(performance.now() - t0);
              ch.port2.postMessage(0);
            } else setTimeout(check, 0);
          };
          queueMicrotask(check);
        });
      }),
    id,
  );
}

/** Dispatches `key` on the focused element at the start of a frame; ms until focus moved, selection committed and laid out. */
function framedKey(page: Page, key: string): Promise<number> {
  return page.evaluate(
    (k) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const from = document.activeElement as HTMLElement;
          const t0 = performance.now();
          from.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
          const check = () => {
            const to = document.activeElement as HTMLElement;
            if (to !== from && to.getAttribute('aria-checked') === 'true') {
              void document.body.offsetHeight;
              const ch = new MessageChannel();
              ch.port1.onmessage = () => resolve(performance.now() - t0);
              ch.port2.postMessage(0);
            } else setTimeout(check, 0);
          };
          queueMicrotask(check);
        });
      }),
    key,
  );
}

test('ToggleButton click to aria-pressed painted: median <= 16 ms', async ({ page }) => {
  await page.goto(`${PROD_URL}buttons.html?perf`);
  await expect(page.locator('#perf-toggle')).toBeVisible();
  const samples: number[] = [];
  for (let i = 0; i < 23; i++) {
    const ms = await framedToggle(page, 'perf-toggle');
    if (i >= 3) samples.push(ms);
  }
  console.log(`[perf] toggle: median ${round(median(samples))} ms`);
  expectBudget(median(samples), 16, 'toggle median');
});

test('ToggleButtonGroup (50 items) arrow key to focus moved and selection painted: median <= 8 ms', async ({ page }) => {
  await page.goto(`${PROD_URL}buttons.html?perf`);
  await page.focus('#perf-group [data-value="o0"]');
  const samples: number[] = [];
  for (let i = 0; i < 30; i++) {
    const ms = await framedKey(page, 'ArrowRight');
    if (i >= 5) samples.push(ms);
  }
  expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset['value'])).toBe('o30');
  console.log(`[perf] toggle group 50 items arrow: median ${round(median(samples))} ms`);
  expectBudget(median(samples), 8, 'toggle group 50 items arrow median');
});
