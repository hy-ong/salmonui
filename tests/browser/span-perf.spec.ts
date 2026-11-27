import { expect, test, type Page } from '@playwright/test';
import { openGrid, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Span-aware focus, selection and editing timing (interaction budgets),
// production build of the 100k x 100 fixture with column
// spans (`?span`: s3 spans 3 columns on every 5th row), row spans
// (`?rowSpan`: s2 spans 3 rows on every 6th row), cell selection and cell
// editing; and grid-wide merged spans (`?merge=rows`) for the data-change
// recompute. Same method as interaction-perf.spec.ts: the key or call runs at
// the start of a frame and the end marker is a MessageChannel task posted
// from that callback, so the number is handler + commit + rendering of the
// frame that shows the result, without the vsync wait. Budgets: arrow key
// focus move <= 8 ms, Shift+Arrow range extension <= 8 ms, inline edit start
// (F2) <= 16 ms, and a single-cell write (`updateCell`) with merged spans
// recomputed and painted <= 16 ms (one frame; the core share of a commit is
// the 4 ms "Inline edit commit" budget). There is no recorded reference
// median for spans.

test.describe.configure({ retries: 1 });

const round = (v: number) => Math.round(v * 100) / 100;
const pct = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1))] as number;

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

/** Dispatches `key` on the active element at the start of a frame; ms until that frame rendered. */
async function framedKey(page: Page, key: string, init: KeyboardEventInit = {}): Promise<number> {
  return page.evaluate(
    ([k, extra]) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => {
          const t0 = performance.now();
          (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
          const ch = new MessageChannel();
          ch.port1.onmessage = () => resolve(performance.now() - t0);
          ch.port2.postMessage(0);
        });
      }),
    [key, init] as const,
  );
}

const focusCell = async (page: Page, rowId: string, field: string) => {
  await page.evaluate(([r, f]) => window.__gridApi.focusCell(r, f), [rowId, field] as const);
  await settle(page);
};
const focused = (page: Page) => page.evaluate(() => window.__gridApi.getFocusedCell());

test.describe('span-aware interaction timing (production build)', () => {
  test('arrow keys through row and column spans <= 8 ms; Shift+Arrow over spans <= 8 ms; F2 on a span <= 16 ms', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?span&rowSpan&sel=cell&cellMode=box&edit=cell`);
    await page.evaluate(() => window.__gridApi.scrollToRow('r1200', { align: 'start' }));
    await settle(page);
    // Right along r1201 crosses the r1200 row span (s2) and a column span start; down s2/s3 crosses both kinds.
    const right: number[] = [];
    const down: number[] = [];
    for (let round = 0; round < 3; round++) {
      await focusCell(page, 'r1201', 's0');
      for (let i = 0; i < 8; i++) right.push(await framedKey(page, 'ArrowRight'));
      await focusCell(page, 'r1200', 's3');
      for (let i = 0; i < 10; i++) down.push(await framedKey(page, 'ArrowDown'));
    }
    // ArrowRight from r1201:s1 lands on the r1200 row span anchor (s2).
    await focusCell(page, 'r1201', 's1');
    await framedKey(page, 'ArrowRight');
    expect(await focused(page)).toEqual({ rowId: 'r1200', field: 's2', region: 'body' });
    // Shift+Arrow from a column span: the box grows over whole spans.
    const shift: number[] = [];
    for (let round = 0; round < 4; round++) {
      await focusCell(page, 'r1205', 'n4');
      for (let i = 0; i < 6; i++) shift.push(await framedKey(page, 'ArrowDown', { shiftKey: true }));
    }
    const range = await page.evaluate(() => window.__gridApi.getSelection().cellRanges[0]);
    expect(range).toBeTruthy();
    // F2 on a column span anchor opens its editor; Escape closes it.
    const f2: number[] = [];
    for (let i = 0; i < 6; i++) {
      await focusCell(page, i % 2 ? 'r1205' : 'r1210', 's3');
      f2.push(await framedKey(page, 'F2'));
      await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.locator('.salmon-data-grid .salmon-data-grid-editor')).toHaveCount(0);
    }
    const r = { arrowP95: round(pct([...right.slice(8), ...down.slice(10)], 0.95)), shiftP95: round(pct(shift.slice(6), 0.95)), f2Median: round(pct(f2.slice(2), 0.5)), f2P95: round(pct(f2.slice(2), 0.95)) };
    console.log(`[perf] span interaction: arrowP95=${r.arrowP95}ms shiftArrowP95=${r.shiftP95}ms f2Median=${r.f2Median}ms f2P95=${r.f2P95}ms`);
    expectBudget(r.arrowP95, 8, 'span interaction arrowP95');
    expectBudget(r.shiftP95, 8, 'span interaction shiftArrowP95');
    expectBudget(r.f2P95, 16, 'span interaction f2P95');
  });

  test('updateCell with merged row spans: write, recompute and paint <= 16 ms', async ({ page }) => {
    await openGrid(page, `${PROD_URL}?merge=rows&edit=cell`);
    const write = (rowId: string, value: string) =>
      page.evaluate(
        ([r, v]) =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              const t0 = performance.now();
              window.__gridApi.updateCell(r, 's0', v);
              const check = (): void => {
                // Joined: r2 is covered by the r1 span (2 rows); split: r2 renders its own value.
                const cell = document.querySelector(`.salmon-data-grid-rows [data-row-id="${r}"] .salmon-data-grid-cell[data-column-id="s0"]`);
                const above = document.querySelector('.salmon-data-grid-rows [data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s0"]');
                const done = v.startsWith('merged') ? above?.getAttribute('aria-rowspan') === '2' : !!cell?.textContent?.includes(v) && !above?.hasAttribute('aria-rowspan');
                if (done) {
                  void document.body.offsetHeight;
                  const ch = new MessageChannel();
                  ch.port1.onmessage = () => resolve(performance.now() - t0);
                  ch.port2.postMessage(0);
                } else setTimeout(check, 0);
              };
              queueMicrotask(check);
            });
          }),
        [rowId, value] as const,
      );
    const samples: number[] = [];
    for (let i = 0; i < 14; i++) {
      // Alternately join r2 to r1 (equal values merge into one span) and split it again.
      const joined = i % 2 === 0;
      const value = joined ? `merged-${i}` : `split-${i}`;
      if (joined) await page.evaluate((v) => window.__gridApi.updateCell('r1', 's0', v), value);
      await settle(page);
      samples.push(await write('r2', value));
      await settle(page);
      if (joined) expect(await page.locator('.salmon-data-grid-rows [data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s0"]').getAttribute('aria-rowspan')).toBe('2');
    }
    const r = { median: round(pct(samples.slice(2), 0.5)), p95: round(pct(samples.slice(2), 0.95)) };
    console.log(`[perf] updateCell with merged spans to painted: median=${r.median}ms p95=${r.p95}ms`);
    expectBudget(r.p95, 16, 'updateCell with merged spans to painted p95');
  });
});
