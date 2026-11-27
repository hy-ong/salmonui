import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Dropdown budgets in the browser, production build, a Listbox over 100,000 local
// items (examples/vite-spa/listbox.html?case=big):
//
// - Scroll at 2,000 px/s for 3 s (Data Grid scroll budgets):
//   scroll handler ≤ 1 ms p95, frame interval ≤ 16.7 ms p95 (+0.5 ms vsync
//   quantization), dropped frames (> 25 ms) ≤ 2 %, 0 blank frames (a sample
//   point of the list that hits no option in the frame after a scroll step).
// - Active option move: Arrow Down handled (keydown dispatch to
//   committed DOM, React flushes discrete events synchronously) ≤ 2 ms p95;
//   the option render count is gated in listbox.spec.ts.
// - Options in DOM ≤ visible + 2 × overscan + the active option.
// - One filter keystroke over the built index is gated at the
//   index in packages/dropdowns/tests/collection-performance.test.ts (≤ 8 ms
//   p95); the keystroke-to-commit time of the whole component is reported
//   here for information.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;
const p95 = (xs: number[]) => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] ?? 0;
};

async function instrumentScroll(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __scrollMs: number[] };
    w.__scrollMs = [];
    const add = EventTarget.prototype.addEventListener;
    let last: Event | null = null;
    EventTarget.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      if (type !== 'scroll' || !listener) return add.call(this, type, listener, options);
      const fn = function (this: unknown, event: Event) {
        const t = performance.now();
        if (typeof listener === 'function') listener.call(this, event);
        else listener.handleEvent(event);
        if (event === last) w.__scrollMs[w.__scrollMs.length - 1]! += performance.now() - t;
        else w.__scrollMs.push(performance.now() - t);
        last = event;
      };
      return add.call(this, type, fn, options);
    };
  });
}

test('Listbox over 100,000 items: scroll at 2,000 px/s meets the Data Grid scroll budgets', async ({ page }) => {
  await instrumentScroll(page);
  await page.goto(`${PROD_URL}listbox.html?case=big`);
  const list = page.getByRole('listbox');
  await expect(list.locator('[role="option"]').first()).toBeVisible();
  const result = await list.evaluate(async (el) => {
    const w = window as unknown as { __scrollMs: number[] };
    w.__scrollMs.length = 0;
    const rect = el.getBoundingClientRect();
    const points = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height * f }));
    const intervals: number[] = [];
    let blank = 0;
    let frames = 0;
    let maxOptions = 0;
    const speed = 2000 / 1000;
    await new Promise<void>((resolve) => {
      let start = 0;
      let prev = 0;
      const tick = (now: number) => {
        if (!start) {
          start = now;
          prev = now;
        } else {
          intervals.push(now - prev);
          prev = now;
          // Sample the frame painted after the previous step.
          frames++;
          for (const p of points) {
            const hit = document.elementFromPoint(p.x, p.y);
            if (!hit?.closest('[role="option"]')) {
              blank++;
              break;
            }
          }
          maxOptions = Math.max(maxOptions, el.querySelectorAll('[role="option"]').length);
        }
        if (now - start >= 3000) return resolve();
        el.scrollTop = (now - start) * speed;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { intervals, blank, frames, maxOptions, handler: w.__scrollMs.slice() };
  });
  const frameP95 = p95(result.intervals);
  const dropped = result.intervals.filter((x) => x > 25).length / result.intervals.length;
  const handlerP95 = p95(result.handler);
  console.log(`listbox scroll: frames ${result.frames}, frame p95 ${round(frameP95)} ms, dropped ${round(dropped * 100)} %, blank ${result.blank}, handler p95 ${round(handlerP95)} ms (${result.handler.length} events), max options ${result.maxOptions}`);
  expectBudget(result.handler.length, 20, 'listbox scroll handler events', { atLeast: true, strict: true, unit: 'events' });
  expectBudget(handlerP95, 1, 'listbox scroll handler p95');
  expectBudget(frameP95, 16.7 + 0.5, 'listbox scroll frame p95');
  expectBudget(dropped, 0.02, 'listbox scroll dropped frame ratio', { unit: 'x' });
  expect(result.blank).toBe(0);
  expect(result.maxOptions).toBeLessThanOrEqual(8 + 2 * 6 + 1);
});

test('Listbox over 100,000 items: an active move is handled in ≤ 2 ms p95', async ({ page }) => {
  await page.goto(`${PROD_URL}listbox.html?case=big`);
  const list = page.getByRole('listbox');
  await expect(list.locator('[role="option"]').first()).toBeVisible();
  await list.focus();
  const samples = await list.evaluate(async (el) => {
    const out: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t = performance.now();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, cancelable: true }));
      out.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return out;
  });
  const value = p95(samples.slice(5));
  console.log(`listbox active move: p95 ${round(value)} ms`);
  expect(await list.getAttribute('aria-activedescendant')).toMatch(/-opt-60$/);
  expectBudget(value, 2, 'listbox active move p95');
});

test('Listbox over 100,000 items: filter keystroke to commit (information)', async ({ page }) => {
  await page.goto(`${PROD_URL}listbox.html?case=big`);
  const search = page.getByRole('searchbox');
  await expect(search).toBeVisible();
  // The index chunk loads and builds after the first paint.
  await page.waitForTimeout(500);
  const samples = await search.evaluate(async (input: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const out: number[] = [];
    for (const text of ['c', 'ca', 'caf', 'cafe', 'caf', 'ca', 'c', '', 'z', 'zu', 'zur', '']) {
      const t = performance.now();
      setter.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      out.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return out;
  });
  console.log(`listbox filter keystroke to commit: p95 ${round(p95(samples))} ms, samples ${samples.map(round).join(', ')}`);
  expect(samples.length).toBe(12);
});
