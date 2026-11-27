import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// Input that arrives before a lazily imported interaction chunk has loaded is
// held and handed to the chunk once it is attached (core/internal/held-input.ts),
// so a fast press, drag or key sequence is not lost. Each test holds the
// chunk's request back with route interception, acts at once, then lets the
// chunk through and checks the outcome.

/** Holds back the requests matching `pattern` until the returned function runs. */
async function holdChunk(page: Page, pattern: RegExp): Promise<() => Promise<void>> {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  let requested!: () => void;
  const seen = new Promise<void>((resolve) => (requested = resolve));
  await page.route(pattern, async (route) => {
    requested();
    await opened;
    await route.continue();
  });
  return async () => {
    open();
    await seen;
  };
}

type Point = { x: number; y: number };
async function center(target: Locator, fy = 0.5, fx = 0.5): Promise<Point> {
  const box = await target.boundingBox();
  if (!box) throw new Error('no box');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}
async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test.describe('input before the interaction chunk loads', () => {
  test('Scheduler: arrow keys pressed before the interaction chunk move focus once each', async ({ page }) => {
    const release = await holdChunk(page, /\/scheduler\/interact\.js(\?|$)/);
    await page.goto(`${DEV_URL}scheduler.html?set=keys`);
    const s = page.locator('[data-scenario="sched-keys"]');
    const cells = s.locator('.salmon-scheduler__work-cell');
    await expect(cells.first()).toBeVisible();
    // The time area scrolls to the 09:00 work start after mount; the keys start there.
    await expect.poll(() => s.locator('.salmon-scheduler__time-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    // Week view, 30-minute rows: cell r * 7 + c is Sun 2026-11-22 + c at r * 30 minutes.
    await cells.nth(18 * 7).focus();
    // Right to Monday 09:00, right to the Standup event in that cell, down to Monday 09:30, left to Sunday 09:30.
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft']) await page.keyboard.press(key);
    await release();
    await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['cellStart'])).toBe(String(Date.UTC(2026, 10, 22, 9, 30)));
  });

  test('Scheduler: an event dragged before the drag chunk loads is dropped where it was released', async ({ page }) => {
    const release = await holdChunk(page, /\/scheduler\/(interact|drag)\.js(\?|$)/);
    await page.goto(`${DEV_URL}scheduler.html?set=drag`);
    await page.waitForFunction(() => window.__mountMs !== undefined);
    const s = page.locator('[data-scenario="drag-week"]');
    const cell = (r: number, c: number) => s.locator('.salmon-scheduler__work-cell').nth(r * 7 + c);
    await cell(18, 2).scrollIntoViewIfNeeded();
    await drag(page, await center(cell(18, 2)), await center(cell(21, 3)));
    await release();
    await expect(cell(21, 3).locator('[data-event-id="1"]')).toHaveCount(1);
    expect(await page.evaluate(() => window.__schedEvents.filter((e) => e.id === 'drag-week' && e.type === 'save').map((e) => e.value))).toEqual([[{ id: 1, start: '2026-11-25T10:30:00', end: '2026-11-25T11:30:00' }]]);
    await expect(page.locator('[data-drag-ghost]')).toHaveCount(0);
  });

  test('Kanban: a card dragged before the drag chunk loads moves', async ({ page }) => {
    const problems = collectProblems(page);
    const release = await holdChunk(page, /\/kanban\/drag\.js(\?|$)/);
    await page.goto(`${DEV_URL}kanban.html`);
    const card = (id: string) => page.locator(`#main [data-card="s${id}"]`);
    await expect(card('d2')).toBeVisible();
    await drag(page, await center(card('d2')), await center(card('x1'), 0.2));
    await release();
    const titles = () => page.evaluate(() => [...document.querySelectorAll('#main .salmon-kanban-cell[data-li="0"][data-column="done"] > [data-card]')].map((el) => el.querySelector('.salmon-kanban-card-header')?.textContent ?? ''));
    await expect.poll(titles).toEqual(['Fix login', 'Kickoff']);
    await expect(page.locator('#main .salmon-kanban-ghost')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('TreeView: an item dragged before the drag chunk loads moves', async ({ page }) => {
    const release = await holdChunk(page, /\/tree-view\/dnd\.js(\?|$)/);
    await page.goto(`${DEV_URL}tree-view.html`);
    const item = (label: string) => page.locator('#main [role="treeitem"]', { has: page.locator('.salmon-tree-view-label', { hasText: new RegExp(`^${label}$`) }) });
    await expect(item('Notes')).toBeVisible();
    await drag(page, await center(item('Notes')), await center(item('Pictures'), 0.1));
    await release();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __events: unknown[][] }).__events.filter((e) => e[0] === 'move'))).toEqual([['move', ['notes'], 'pics', 'before', 'pointer', null]]);
    await expect(page.locator('#main [data-drop]')).toHaveCount(0);
  });

  test('TagGroup: a tag dragged before the drag chunk loads reorders', async ({ page }) => {
    const release = await holdChunk(page, /\/tag-group\/drag\.js(\?|$)/);
    await page.goto(`${DEV_URL}tag-group.html`);
    const tag = (value: string) => page.locator(`#list-a [data-value="${value}"]`);
    await expect(tag('One')).toBeVisible();
    await drag(page, await center(tag('One')), await center(tag('Four'), 0.5, 0.2));
    await release();
    const values = () => page.locator('#list-a [data-salmon-tag]').evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset['value']));
    await expect.poll(values).toEqual(['Two', 'Three', 'One', 'Four']);
    await expect(page.locator('.salmon-tag-group-ghost')).toHaveCount(0);
  });

  test('SidebarLayout: a press outside before the outside-press chunk loads closes the panel', async ({ page }) => {
    const release = await holdChunk(page, /\/sidebar-layout\/adaptive\.js(\?|$)/);
    await page.goto(`${DEV_URL}sidebar-layout.html`);
    const panel = page.locator('#push .salmon-sidebar-panel');
    await expect(panel).toHaveAttribute('data-state', 'open');
    await page.click('#push-outside');
    await release();
    await expect(panel).toHaveAttribute('data-state', 'closed');
    expect((await page.evaluate(() => (window as unknown as { __events: unknown[][] }).__events)).filter((e) => e[0] === 'open')).toEqual([['open', false, 'outside', 'pointer']]);
  });

  test('Listbox: a search typed before the search chunk loads announces the filtered count', async ({ page }) => {
    const release = await holdChunk(page, /\/internal\/collection\/search\.js(\?|$)/);
    await page.goto(`${DEV_URL}listbox.html?case=big`);
    const list = page.getByRole('listbox').first();
    await expect(list).toBeAttached();
    await page.getByRole('searchbox', { name: 'Search' }).fill('zur');
    await page.waitForTimeout(100);
    await release();
    const count = Math.ceil(100_000 / 12);
    await expect(list.locator('[role="option"]').first()).toHaveAttribute('aria-setsize', String(count));
    await expect(page.getByRole('status')).toHaveText(`${count} results`);
  });
});

test.describe('Data Grid input before its chunks load', () => {
  test('tree mode: tree keys pressed before the tree key chunk loads collapse and expand', async ({ page }) => {
    const release = await holdChunk(page, /\/tree-client-chunk\.js(\?|$)/);
    await page.goto(`${DEV_URL}tree.html?mode=nested`);
    const row = (id: string) => page.locator(`[role="treegrid"] [role="row"][data-row-id="${id}"]`);
    await expect(row('p1')).toHaveAttribute('aria-expanded', 'true');
    await row('p1').locator('[data-column-id="name"]').click();
    // Ctrl+ArrowUp collapses every parent; ArrowRight on the focused tree cell expands it again.
    await page.keyboard.press('Control+ArrowUp');
    await page.keyboard.press('ArrowRight');
    await release();
    await expect(row('p1')).toHaveAttribute('aria-expanded', 'true');
    await expect(row('p1a')).toHaveAttribute('aria-expanded', 'false');
    const focused = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-row-id]')?.dataset['rowId'] ?? null);
    expect(await focused()).toBe('p1');
  });

  test.describe('adaptive', () => {
    test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    test('a long-press that starts before the adaptive chunk loads opens the context menu', async ({ page }) => {
      const release = await holdChunk(page, /\/adaptive-chunk\.js(\?|$)/);
      await openGrid(page, `${DEV_URL}?rows=200&cols=6&adaptive=horizontal&chrome`);
      const box = (await page.locator('.salmon-data-grid-row[data-row-id="r1"] .salmon-data-grid-cell[data-column-id="s1"]').first().boundingBox())!;
      const x = box.x + Math.min(box.width / 2, 60);
      const y = box.y + Math.min(box.height / 2, 18);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(100);
      await release();
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await expect(page.locator('[data-salmon-popover][data-sheet="menu"].salmon-data-grid-context-menu')).toHaveCount(1);
    });
  });
});
