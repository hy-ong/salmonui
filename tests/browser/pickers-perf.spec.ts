import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Calendar picker budgets on the production build of
// examples/vite-spa/pickers.html. Methodology as in interaction-perf.spec.ts:
// the input is dispatched at the start of a frame (inside
// requestAnimationFrame) and the end marker is a MessageChannel task posted
// from the same callback, which runs after that frame's style, layout and
// paint.

const URL = `${PROD_URL}pickers.html`;
const round = (v: number) => Math.round(v * 100) / 100;
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(0.95 * values.length) - 1)] as number;
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

const POPUP_CONTENT = (c: string) => `section[data-case="${c}"] .salmon-picker__popup [role="option"], section[data-case="${c}"] .salmon-picker__popup [data-salmon-focus]`;

/**
 * Warm-up open: the popup is a lazy chunk preloaded when idle after mount, so on
 * a loaded machine the first open can land before the chunk resolves. Waits
 * for the popup content (not timed), then closes it.
 */
async function warmOpen(page: Page, id: string, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.locator(`section[data-case="${id}"] .salmon-picker__trigger`).click();
    await expect(page.locator(POPUP_CONTENT(id)).first()).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(page.locator(`section[data-case="${id}"] .salmon-picker__popup`)).toHaveCount(0);
    await settle(page);
  }
}

/** Trigger click to popup painted, `count` times (closed with Escape between runs). */
async function openTimes(page: Page, id: string, count: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(
      await page.evaluate(
        ([c, sel]) =>
          new Promise<number>((resolve, reject) => {
            // Bounded: a frame that never comes (hidden / throttled page) fails fast
            // instead of running into the test timeout.
            const timer = setTimeout(() => reject(new Error(`${c}: no frame within 5 s (page hidden or throttled?)`)), 5_000);
            requestAnimationFrame(() => {
              const t0 = performance.now();
              (document.querySelector(`section[data-case="${c}"] .salmon-picker__trigger`) as HTMLElement).click();
              const ch = new MessageChannel();
              ch.port1.onmessage = () => {
                clearTimeout(timer);
                // Reject (a throw inside the message handler would leave the promise pending).
                if (!document.querySelector(sel)) reject(new Error(`${c}: popup not painted in the trigger frame`));
                else resolve(performance.now() - t0);
              };
              ch.port2.postMessage(0);
            });
          }),
        [id, POPUP_CONTENT(id)] as const,
      ),
    );
    await page.keyboard.press('Escape');
    await expect(page.locator(`section[data-case="${id}"] .salmon-picker__popup`)).toHaveCount(0);
    await settle(page);
  }
  return out;
}

async function framedKeys(page: Page, key: string, count: number): Promise<number[]> {
  return page.evaluate(
    ([k, n]) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        const step = () => {
          requestAnimationFrame(() => {
            const t0 = performance.now();
            (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
            const ch = new MessageChannel();
            ch.port1.onmessage = () => {
              out.push(performance.now() - t0);
              if (out.length >= n) resolve(out);
              else setTimeout(step, 20);
            };
            ch.port2.postMessage(0);
          });
        };
        step();
      }),
    [key, count] as const,
  );
}

test.describe('calendar picker timing (production build)', () => {
  test('trigger to popup painted <= 50 ms (DatePicker, two-month DateRangePicker, 1,440-option TimePicker)', async ({ page }) => {
    await page.goto(URL);
    await page.waitForSelector('section[data-case]');
    // Warm-up: the popup chunks are preloaded after mount; the first opens also compile the popup code.
    for (const id of ['dp-basic', 'dtp', 'drp', 'tp-1440']) await warmOpen(page, id, 2);
    const report: Record<string, { p95: number; max: number }> = {};
    for (const id of ['dp-basic', 'dtp', 'drp', 'tp-1440']) {
      const t = await openTimes(page, id, 12);
      report[id] = { p95: round(p95(t)), max: round(Math.max(...t)) };
    }
    console.log(`[perf] picker open ${JSON.stringify(report)}`);
    for (const [id, r] of Object.entries(report)) expectBudget(r.p95, 50, `picker open ${id} p95`);
  });

  test('arrow key in the popup calendar to painted <= 8 ms', async ({ page }) => {
    await page.goto(URL);
    await page.locator('section[data-case="dp-basic"] .salmon-picker__trigger').click();
    await page.waitForFunction(() => (document.activeElement as HTMLElement | null)?.dataset['day'] !== undefined);
    await framedKeys(page, 'ArrowRight', 5);
    const right = await framedKeys(page, 'ArrowRight', 30);
    const left = await framedKeys(page, 'ArrowLeft', 30);
    const report = { right: round(p95(right)), left: round(p95(left)) };
    console.log(`[perf] calendar arrow p95 ${JSON.stringify(report)}`);
    expectBudget(report.right, 8, 'calendar ArrowRight p95');
    expectBudget(report.left, 8, 'calendar ArrowLeft p95');
  });

  test('held ArrowDown through a 1,440-option time list drops no frames', async ({ page }) => {
    await page.goto(`${URL}?only=tp-1440`);
    const s = page.locator('section[data-case="tp-1440"]');
    await s.locator('[role="spinbutton"]').first().focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(s.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Home');
    const result = await page.evaluate(
      (duration) =>
        new Promise<{ presses: number; frames: number; dropped: number; p95: number; missing: number; active: string }>((resolve) => {
          const list = document.querySelector('section[data-case="tp-1440"] [role="listbox"]') as HTMLElement;
          const stamps: number[] = [];
          let missing = 0;
          let presses = 0;
          let running = true;
          const frame = (ts: number) => {
            stamps.push(ts);
            // The active option is always mounted and the viewport is covered by options.
            if (!list.querySelector('[data-active]')) missing++;
            if (running) requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
          const timer = setInterval(() => {
            presses++;
            (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, repeat: presses > 1 }));
          }, 33);
          setTimeout(() => {
            clearInterval(timer);
            running = false;
            const d: number[] = [];
            for (let i = 1; i < stamps.length; i++) d.push((stamps[i] as number) - (stamps[i - 1] as number));
            const sorted = [...d].sort((x, y) => x - y);
            resolve({
              presses,
              frames: d.length,
              dropped: d.filter((x) => x > 25).length,
              p95: Math.round((sorted[Math.ceil(0.95 * sorted.length) - 1] as number) * 100) / 100,
              missing,
              active: list.querySelector('[data-active]')?.textContent ?? '',
            });
          }, duration);
        }),
      4000,
    );
    console.log(`[perf] hold ArrowDown in 1,440 options ${JSON.stringify(result)}`);
    expectBudget(result.presses, 100, 'hold ArrowDown in 1,440 options presses', { atLeast: true, strict: true, unit: 'events' });
    expect(result.missing).toBe(0);
    expectBudget(result.dropped, 0, 'hold ArrowDown in 1,440 options dropped frames', { unit: 'frames' });
  });
});
