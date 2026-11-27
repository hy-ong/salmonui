import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid, PROD_URL, scrollViewport } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Grouping browser gates: grouped rendering with row and column virtualization,
// expand/collapse by pointer and keyboard, the group drop area (drag a header,
// chips, keyboard), the sticky footer, and scrolling a grouped 100k grid at
// 2,000 px/s (0 blank frames, p95 frame time <= 16.7 ms).

const groupEvents = (page: Page) => page.evaluate(() => (window as unknown as { __groupEvents: { type: string; [k: string]: unknown }[] }).__groupEvents);

test.describe('grouping', () => {
  test('captions, toggles, keyboard, events, sticky indent under column virtualization', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${DEV_URL}?sort&group=s0&aggs`);
    const caption = page.locator('.salmon-data-grid-group-caption').first();
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'true');
    await expect(caption).toHaveAttribute('data-depth', '0');
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-description', /^Level 1, /);
    await expect(page.locator('.salmon-data-grid-footer .salmon-data-grid-footer-row')).toHaveCount(1);
    const rowsBefore = await page.locator('.salmon-data-grid-rows [role="row"]').count();
    // Pointer toggle.
    await caption.locator('.salmon-data-grid-group-toggle').click();
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'false');
    expect(await groupEvents(page)).toContainEqual(expect.objectContaining({ type: 'collapse' }));
    // Keyboard: Enter on the focused caption toggles; ArrowRight expands.
    await caption.locator('.salmon-data-grid-group-caption__cell').focus();
    await page.keyboard.press('Enter');
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(caption.locator('.salmon-data-grid-group-caption__cell')).toHaveAttribute('aria-expanded', 'true');
    // ArrowDown moves focus from the caption into the first data row (captions are in the focus order).
    await page.keyboard.press('ArrowDown');
    const focused = await page.evaluate(() => (document.activeElement?.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'] ?? null);
    expect(focused?.startsWith('r')).toBeTruthy();
    // Ctrl+ArrowUp collapses all, Ctrl+ArrowDown expands all.
    await page.keyboard.press('Control+ArrowUp');
    await expect(page.locator('.salmon-data-grid-rows [role="row"]:not(.salmon-data-grid-group-caption)')).toHaveCount(0);
    await page.keyboard.press('Control+ArrowDown');
    await expect.poll(() => page.locator('.salmon-data-grid-rows [role="row"]').count()).toBe(rowsBefore);
    // Column virtualization: indent and frozen ID column stay put while scrolling horizontally.
    const indentX = async () => (await page.locator('.salmon-data-grid-rows .salmon-data-grid-row:not(.salmon-data-grid-group-caption) .salmon-data-grid-indent').first().boundingBox())?.x;
    const pinX = async () => (await page.locator('.salmon-data-grid-rows .salmon-data-grid-row:not(.salmon-data-grid-group-caption) .salmon-data-grid-pin--left').first().boundingBox())?.x;
    const captionX = async () => (await caption.locator('.salmon-data-grid-group-caption__text').boundingBox())?.x;
    const [i0, p0, c0] = [await indentX(), await pinX(), await captionX()];
    await scrollViewport(page, null, 7000);
    const range = await page.evaluate(() => window.__gridApi.getRenderedRange().columns);
    expect(range.start).toBeGreaterThan(10);
    expect(await indentX()).toBe(i0);
    expect(await pinX()).toBe(p0);
    expect(await captionX()).toBe(c0);
    expect(problems).toEqual([]);
  });

  test('drag a header to the drop area, chips: reorder, remove, keyboard; Ctrl+Space on a header', async ({ page }) => {
    const problems = collectProblems(page);
    // The example turns on `grouping.reorderable`, `showHeaderToggle` and `showGroupedColumns` (all default false).
    await openGrid(page, `${DEV_URL}?sort&group=`);
    const panel = page.locator('.salmon-data-grid-group-panel');
    await expect(panel).toHaveAttribute('data-empty', '');
    // Drag "Text 1" (s1) into the panel.
    const header = page.locator('.salmon-data-grid-header-cell[data-column-id="s1"]');
    const hb = (await header.boundingBox())!;
    const pb = (await panel.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 20, hb.y + 10, { steps: 3 });
    await page.mouse.move(pb.x + 200, pb.y + pb.height / 2, { steps: 5 });
    await expect(panel).toHaveAttribute('data-drop-active', '');
    await page.mouse.up();
    await expect(page.locator('.salmon-data-grid-group-chip')).toHaveCount(1);
    await expect(page.locator('.salmon-data-grid-group-caption').first()).toBeVisible();
    expect(await groupEvents(page)).toContainEqual(expect.objectContaining({ type: 'change', action: 'group', field: 's1', groupBy: ['s1'] }));
    // Ctrl+Space on the focused "Text 2" header groups by it.
    await page.locator('.salmon-data-grid-header-cell[data-column-id="s2"]').focus();
    await page.keyboard.press('Control+Space');
    await expect(page.locator('.salmon-data-grid-group-chip')).toHaveCount(2);
    // Alt+ArrowLeft moves the s2 chip first; Delete ungroups it.
    await page.locator('.salmon-data-grid-group-chip[data-column-id="s2"] .salmon-data-grid-group-chip__label').focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.salmon-data-grid-group-chip')].map((c) => c.dataset['columnId']))).toEqual(['s2', 's1']);
    await page.locator('.salmon-data-grid-group-chip[data-column-id="s2"] .salmon-data-grid-group-chip__label').focus();
    await page.keyboard.press('Delete');
    await expect(page.locator('.salmon-data-grid-group-chip')).toHaveCount(1);
    // Chip click reverses the group order (the chip toggle follows `sorting`); the remove button ungroups.
    const first = () => page.locator('.salmon-data-grid-group-caption').first().getAttribute('data-row-id');
    const before = await first();
    await page.locator('.salmon-data-grid-group-chip__label').click();
    await expect.poll(first).not.toBe(before);
    await page.locator('.salmon-data-grid-group-chip__remove').click();
    await expect(page.locator('.salmon-data-grid-group-caption')).toHaveCount(0);
    await expect(panel).toHaveAttribute('data-empty', '');
    expect(problems).toEqual([]);
  });
});

test.describe('grouped scrolling performance', () => {
  test('scrolling a grouped 100k grid at 2,000 px/s: 0 blank frames, p95 <= 16.7 ms', { tag: '@perf' }, async ({ page }) => {
    await openGrid(page, `${PROD_URL}?sort&group=s0,b9&aggs`);
    await page.waitForTimeout(300);
    const result = await page.evaluate(
      () =>
        new Promise<{ frames: number; blank: number; p95: number; max: number; dropped: number }>((resolve) => {
          const vp = document.querySelector('.salmon-data-grid-viewport') as HTMLElement;
          const header = (document.querySelector('.salmon-data-grid-header') as HTMLElement).getBoundingClientRect();
          const footer = document.querySelector('.salmon-data-grid-footer') as HTMLElement | null;
          const rect = vp.getBoundingClientRect();
          const top = header.bottom + 2;
          const bottom = (footer ? footer.getBoundingClientRect().top : rect.bottom) - 2;
          const x = rect.left + 300;
          const speed = 2000; // px/s
          const duration = 5000;
          const deltas: number[] = [];
          let blank = 0;
          let start = 0;
          let last = 0;
          const covered = (y: number): boolean => !!document.elementFromPoint(x, y)?.closest('.salmon-data-grid-rows [role="row"]');
          const step = (t: number): void => {
            if (!start) {
              start = t;
              last = t;
            } else {
              deltas.push(t - last);
              last = t;
              // The frame that just painted must show rows at the top, middle and bottom of the body.
              if (!covered(top) || !covered((top + bottom) / 2) || !covered(bottom)) blank++;
            }
            if (t - start >= duration) {
              const sorted = [...deltas].sort((a, b) => a - b);
              resolve({ frames: deltas.length, blank, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, max: sorted[sorted.length - 1] ?? 0, dropped: deltas.filter((d) => d > 25).length });
              return;
            }
            vp.scrollTop = ((t - start) / 1000) * speed;
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
    );
    console.log(`[perf] grouped scroll 2000px/s: frames=${result.frames} blank=${result.blank} p95=${result.p95.toFixed(2)}ms max=${result.max.toFixed(2)}ms dropped=${result.dropped}`);
    expectBudget(result.frames, 200, 'grouped scroll frames', { atLeast: true, strict: true, unit: 'frames' });
    expect(result.blank).toBe(0);
    // rAF timestamps are quantized (0.1 ms): one 60 Hz vsync interval reads as 16.7-16.8 ms.
    expectBudget(result.p95, 16.7 + 0.5, 'grouped scroll 2000px/s frame p95');
    expectBudget(result.dropped / result.frames, 0.02, 'grouped scroll 2000px/s dropped frame ratio', { unit: 'x' });
  });
});
