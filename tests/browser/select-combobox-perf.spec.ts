import { expect, test, type Page } from '@playwright/test';
import { PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Select and Combobox budgets on the production build
// (examples/vite-spa/dropdowns.html ?perf=...):
// open with 100,000 local items ≤ 50 ms to painted with the DOM bounded,
// the columns popup ≤ 50 ms, one filter keystroke
// to painted, an active-option move touching at most two
// options and select all over 100,000 items.

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
const p95 = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] as number;

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`${PROD_URL}dropdowns.html?${query}`);
  await page.waitForFunction(() => window.__dd?.ready === true);
  // The popup and search chunks load after mount.
  await page.waitForTimeout(400);
}

/** Click to painted (two animation frames after the first option is in the DOM), in the page. */
function timeOpen(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    (sel) =>
      new Promise<number>((resolve) => {
        const trigger = document.querySelector(sel) as HTMLElement;
        trigger.focus();
        const t0 = performance.now();
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        const wait = (): void => {
          if (!document.querySelector('[role="option"], [role="row"][aria-rowindex="2"]')) return void requestAnimationFrame(wait);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
        };
        wait();
      }),
    selector,
  );
}

test.describe('dropdown budgets', () => {
  test('Select opens over 100,000 local items in ≤ 50 ms with at most visible + 2 × overscan options', async ({ page }) => {
    await open(page, 'perf=select&n=100000');
    const times: number[] = [];
    for (let run = 0; run < 7; run++) {
      times.push(await timeOpen(page, '#perf'));
      expect(await page.getByRole('option').count()).toBeLessThanOrEqual(8 + 2 * 6);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
    }
    expectBudget(median(times), 50, 'Select open over 100,000 items median');
  });

  test('Combobox with 5 columns opens over 100,000 rows in ≤ 50 ms', async ({ page }) => {
    await open(page, 'perf=columns&n=100000');
    // First open loads the grid chunk; the budget is for a warm popup.
    await page.locator('#perf').click();
    await expect(page.getByRole('grid')).toBeVisible();
    await page.keyboard.press('Escape');
    const times: number[] = [];
    for (let run = 0; run < 7; run++) {
      times.push(await timeOpen(page, '#perf'));
      expect(await page.locator('[role="row"][aria-rowindex]').count()).toBeLessThanOrEqual(1 + 8 + 2 * 6);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('grid')).toHaveCount(0);
    }
    expectBudget(median(times), 50, 'Combobox 5 columns open over 100,000 rows median');
  });

  test('one filter keystroke over 100,000 items reaches the painted list', async ({ page }) => {
    await open(page, 'perf=search&n=100000');
    await page.locator('#perf').click();
    await page.waitForTimeout(300);
    const times = await page.evaluate(async () => {
      const input = document.querySelector('.salmon-select-search-input') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set as (v: string) => void;
      const out: number[] = [];
      for (const text of ['1', '12', '123', '1', '9', '99', '999', '9', '5', '55', '555', '5', '7', '77', '777', '7', '3', '33', '333', '']) {
        const t0 = performance.now();
        setter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        out.push(performance.now() - t0);
      }
      return out;
    });
    // Two frames are counted: the budget is the keystroke work, so a frame (16.7 ms) of slack is allowed.
    expectBudget(p95(times), 8 + 33.4, 'Select filter keystroke over 100,000 items p95');
  });

  test('moving the active option touches at most two options', async ({ page }) => {
    await open(page, 'perf=select&n=100000');
    await page.locator('#perf').click();
    await expect(page.getByRole('option').first()).toBeVisible();
    const touched = await page.evaluate(async () => {
      const list = document.querySelector('[role="listbox"]') as HTMLElement;
      const counts: number[] = [];
      for (let i = 0; i < 4; i++) {
        const changed = new Set<Node>();
        const observer = new MutationObserver((records) => {
          for (const r of records) if ((r.target as Element).getAttribute?.('role') === 'option') changed.add(r.target);
        });
        observer.observe(list, { attributes: true, subtree: true, attributeFilter: ['data-active'] });
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        observer.disconnect();
        counts.push(changed.size);
      }
      return counts;
    });
    for (const n of touched) expect(n).toBeLessThanOrEqual(2);
  });

  test('select all over 100,000 items reaches the painted state in ≤ 20 ms of work', async ({ page }) => {
    await open(page, 'perf=multi&n=100000');
    await page.locator('#perf').click();
    await expect(page.getByRole('option', { name: 'Select all' })).toBeVisible();
    const ms = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const all = document.querySelector('[role="option"][aria-checked]') as HTMLElement;
          const t0 = performance.now();
          all.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
        }),
    );
    await expect(page.getByRole('option', { name: 'Deselect all' })).toHaveAttribute('aria-checked', 'true');
    const event = await page.evaluate(() => window.__dd.events.at(-1));
    expect((event?.value as number[]).length).toBe(100_000);
    // Two frames of slack for the paint, as above.
    expectBudget(ms, 20 + 33.4, 'Select all over 100,000 items to painted');
  });

  test('Combobox opens over 100,000 local items in ≤ 50 ms with at most visible + 2 × overscan options', async ({ page }) => {
    await open(page, 'perf=combobox&n=100000');
    const times: number[] = [];
    for (let run = 0; run < 7; run++) {
      times.push(await timeOpen(page, '#perf ~ .salmon-combobox-trigger, .salmon-combobox-trigger'));
      expect(await page.getByRole('option').count()).toBeLessThanOrEqual(8 + 2 * 6);
      await expect(page.getByRole('option').first()).toHaveAttribute('aria-setsize', '100000');
      await page.locator('#perf').press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
    }
    expectBudget(median(times), 50, 'Combobox open over 100,000 items median');
  });

  test('Combobox columns over a remote 100,000-row source reads ranges only while scrolling, at frame budget', async ({ page }) => {
    await open(page, 'perf=columns-remote&n=100000');
    await page.locator('.salmon-combobox-trigger').click();
    const grid = page.getByRole('grid');
    await expect(grid.locator('[role="row"][aria-rowindex="2"]:not([data-pending])').first()).toBeAttached();
    await expect(grid).toHaveAttribute('aria-rowcount', '100001');
    const result = await grid.evaluate(async (el) => {
      const intervals: number[] = [];
      await new Promise<void>((resolve) => {
        let start = 0;
        let prev = 0;
        const tick = (now: number) => {
          if (!start) start = prev = now;
          else {
            intervals.push(now - prev);
            prev = now;
          }
          if (now - start >= 2000) return resolve();
          el.scrollTop = (now - start) * 2;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      // Then a jump to the middle of the table (a scrollbar drag).
      el.scrollTop = el.scrollHeight / 2;
      return { intervals };
    });
    // The rows under the final scroll position load from their range read.
    await expect.poll(() => page.evaluate(() => window.__dd.reads.some((r) => r.start >= 40_000)), { timeout: 5000 }).toBe(true);
    await expect.poll(() => grid.locator('[role="row"][data-pending]').count(), { timeout: 5000 }).toBe(0);
    expect(await grid.locator('[role="row"][aria-rowindex]').evaluateAll((rows) => rows.some((r) => Number(r.getAttribute('aria-rowindex')) > 40_000))).toBe(true);
    const reads = await page.evaluate(() => window.__dd.reads.map((r) => ({ start: r.start, end: r.end })));
    const rowsRead = reads.reduce((sum, r) => sum + (r.end - r.start), 0);
    const frameP95 = p95(result.intervals);
    console.log(`columns remote: ${reads.length} reads, ${rowsRead} rows read of 100000, frame p95 ${frameP95.toFixed(2)} ms`);
    for (const r of reads) expect(r.end - r.start).toBeLessThanOrEqual(100);
    expect(rowsRead).toBeLessThan(100_000 / 10);
    expect(reads.some((r) => r.start >= 40_000 && r.start <= 60_000)).toBe(true);
    expectBudget(frameP95, 16.7 + 0.5, 'Combobox columns remote scroll frame p95');
  });

  test('Select popup over 100,000 items: scroll at 2,000 px/s meets the Data Grid scroll budgets', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __scrollMs: number[] };
      w.__scrollMs = [];
      const add = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
        if (type !== 'scroll' || !listener) return add.call(this, type, listener, options);
        const fn = function (this: unknown, event: Event) {
          const t = performance.now();
          if (typeof listener === 'function') listener.call(this, event);
          else listener.handleEvent(event);
          w.__scrollMs.push(performance.now() - t);
        };
        return add.call(this, type, fn, options);
      };
    });
    await open(page, 'perf=select&n=100000');
    await page.locator('#perf').click();
    const list = page.locator('.salmon-dropdown-list');
    await expect(list.locator('[role="option"]').first()).toBeVisible();
    const result = await list.evaluate(async (el) => {
      const w = window as unknown as { __scrollMs: number[] };
      w.__scrollMs.length = 0;
      const rect = el.getBoundingClientRect();
      const points = [0.1, 0.5, 0.9].map((f) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height * f }));
      const intervals: number[] = [];
      let blank = 0;
      let maxOptions = 0;
      await new Promise<void>((resolve) => {
        let start = 0;
        let prev = 0;
        const tick = (now: number) => {
          if (!start) start = prev = now;
          else {
            intervals.push(now - prev);
            prev = now;
            for (const p of points) {
              if (!document.elementFromPoint(p.x, p.y)?.closest('[role="option"]')) {
                blank++;
                break;
              }
            }
            maxOptions = Math.max(maxOptions, el.querySelectorAll('[role="option"]').length);
          }
          if (now - start >= 3000) return resolve();
          el.scrollTop = (now - start) * 2;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { intervals, blank, maxOptions, handler: w.__scrollMs.slice() };
    });
    const frameP95 = p95(result.intervals);
    const dropped = result.intervals.filter((x) => x > 25).length / result.intervals.length;
    const handlerP95 = p95(result.handler);
    console.log(`select popup scroll: frame p95 ${frameP95.toFixed(2)} ms, dropped ${(dropped * 100).toFixed(2)} %, blank ${result.blank}, handler p95 ${handlerP95.toFixed(3)} ms (${result.handler.length} events), max options ${result.maxOptions}`);
    expectBudget(result.handler.length, 20, 'Select popup scroll handler events', { atLeast: true, strict: true, unit: 'events' });
    expectBudget(handlerP95, 1, 'Select popup scroll handler p95');
    expectBudget(frameP95, 16.7 + 0.5, 'Select popup scroll frame p95');
    expectBudget(dropped, 0.02, 'Select popup scroll dropped share', { unit: 'x' });
    expect(result.blank).toBe(0);
    expect(result.maxOptions).toBeLessThanOrEqual(8 + 2 * 6 + 1);
  });
});
