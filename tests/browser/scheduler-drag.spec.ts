import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Scheduler drag gates on scheduler.html?set=drag (examples/vite-spa/src/scheduler-drag.tsx):
// drag and drop, resize, multi-drag, external drops and drag
// out, resources and drag groups, swipe navigation, RTL
// and the drag frame budget (<= 8 ms script, 0 React commits per pointer move).

async function open(page: Page, base = DEV_URL): Promise<void> {
  await page.goto(`${base}scheduler.html?set=drag`);
  await page.waitForFunction(() => window.__mountMs !== undefined);
  await expect(page.locator('[data-scenario="drag-perf"] .salmon-scheduler__event').first()).toBeVisible();
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
type Logged = { value: any; details?: any };
const logs = (page: Page, id: string, type: string) => page.evaluate(([i, t]) => window.__schedEvents.filter((e) => e.id === i && e.type === t), [id, type] as const) as Promise<Logged[]>;
// Week view, UTC, 30-minute cells: row r is r * 30 minutes after midnight, column c is Sun 2026-11-22 + c.
const cell = (s: Locator, r: number, c: number): Locator => s.locator('.salmon-scheduler__work-cell').nth(r * 7 + c);
const event = (s: Locator, id: number): Locator => s.locator(`.salmon-scheduler__event[data-event-id="${id}"]`).first();
async function box(l: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}
async function center(l: Locator): Promise<{ x: number; y: number }> {
  const b = await box(l);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}
/** The drag chunk loads on the first pointer down; a focus loads it before the gesture. */
async function warm(page: Page, s: Locator): Promise<void> {
  await s.locator('.salmon-scheduler').first().dispatchEvent('pointerdown', { pointerId: 99, button: 2 });
  await page.waitForTimeout(100);
}

test.describe('drag and drop', () => {
  test('a timed event moves to another day and time, snapped; events fire; no quick info after the drop', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const s = scope(page, 'drag-week');
    await warm(page, s);
    await drag(page, await center(cell(s, 18, 2)), await center(cell(s, 21, 3)));
    expect((await logs(page, 'drag-week', 'dragStart')).map((e) => e.value)).toEqual([1]);
    const moves = await logs(page, 'drag-week', 'drag');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(10);
    expect(moves.at(-1)?.value).toBe('2026-11-25T10:30:00.000Z');
    expect((await logs(page, 'drag-week', 'beforeDrop'))[0]?.value).toEqual({ start: '2026-11-25T10:30:00.000Z', end: '2026-11-25T11:30:00.000Z' });
    expect((await logs(page, 'drag-week', 'save'))[0]?.value).toEqual([{ id: 1, start: '2026-11-25T10:30:00', end: '2026-11-25T11:30:00' }]);
    expect((await logs(page, 'drag-week', 'drop'))[0]?.value).toMatchObject({ id: 1, start: '2026-11-25T10:30:00.000Z', status: 'applied', rows: 1 });
    await expect(cell(s, 21, 3).locator('[data-event-id="1"]')).toHaveCount(1);
    await expect(page.locator('[data-drag-ghost]')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('onEventDragStart and onBeforeEventDrop cancel; read-only events and Escape do not move', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-week');
    await warm(page, s);
    await page.evaluate(() => (window.__dragFlags.cancelStart = true));
    await drag(page, await center(cell(s, 18, 2)), await center(cell(s, 21, 3)));
    expect(await logs(page, 'drag-week', 'dragStart')).toHaveLength(1);
    expect(await logs(page, 'drag-week', 'drag')).toHaveLength(0);
    await page.evaluate(() => {
      window.__dragFlags.cancelStart = false;
      window.__dragFlags.cancelDrop = true;
    });
    await drag(page, await center(cell(s, 18, 2)), await center(cell(s, 21, 3)));
    expect(await logs(page, 'drag-week', 'beforeDrop')).toHaveLength(1);
    expect(await logs(page, 'drag-week', 'save')).toHaveLength(0);
    await page.evaluate(() => (window.__dragFlags.cancelDrop = false));
    // Escape during the drag cancels.
    const from = await center(cell(s, 18, 2));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 80, { steps: 4 });
    await expect(page.locator('[data-drag-ghost]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-drag-ghost]')).toHaveCount(0);
    await page.mouse.up();
    // The read-only event on Friday does not drag.
    await drag(page, await center(cell(s, 18, 5)), await center(cell(s, 24, 5)));
    expect(await logs(page, 'drag-week', 'save')).toHaveLength(0);
    await expect(cell(s, 18, 2).locator('[data-event-id="1"]')).toHaveCount(1);
  });

  test('all-day row and month cells move whole days; overlap={false} rejects; an occurrence asks for the scope', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-week');
    await warm(page, s);
    const allDay = s.locator('.salmon-scheduler__all-day-cell');
    await drag(page, await center(event(s, 2)), await center(allDay.nth(5)));
    expect((await logs(page, 'drag-week', 'save'))[0]?.value).toEqual([{ id: 2, start: '2026-11-27', end: '2026-11-28' }]);
    await expect(allDay.nth(5).locator('[data-event-id="2"]')).toHaveCount(1);
    // Onto the "Lunch" block (Thursday 12:00): the blocked alert, nothing saved.
    await drag(page, await center(cell(s, 18, 2)), await center(cell(s, 24, 4)));
    await expect(page.getByRole('alertdialog', { name: 'Time slot not available' })).toContainText('This time is blocked.');
    await page.getByRole('button', { name: 'OK' }).click();
    expect(await logs(page, 'drag-week', 'save')).toHaveLength(1);
    // The Thursday occurrence of "Daily" (14:00) to 16:00: "This event" saves an edited occurrence.
    await drag(page, await center(cell(s, 28, 4)), await center(cell(s, 32, 4)));
    const alert = page.getByRole('alertdialog', { name: 'Edit recurring event' });
    await expect(alert).toBeVisible();
    await alert.getByRole('button', { name: 'This event' }).click();
    const save = (await logs(page, 'drag-week', 'save'))[1];
    expect(save?.details).toBe('occurrence');
    expect(save?.value).toEqual(expect.arrayContaining([expect.objectContaining({ start: '2026-11-26T16:00:00', end: '2026-11-26T17:00:00', recurrenceId: 3 })]));
    expect((await logs(page, 'drag-week', 'drop')).at(-1)?.value).toMatchObject({ id: 3, start: '2026-11-26T16:00:00.000Z', status: 'applied' });

    const m = scope(page, 'drag-month');
    await warm(page, m);
    const day = (d: number) => m.locator('.salmon-scheduler__month-cell').nth(d);
    // Month grid starts Sun 2026-11-01: index 23 is Tue 24, 25 is Thu 26.
    await drag(page, await center(event(m, 1)), await center(day(25)));
    expect((await logs(page, 'drag-month', 'save'))[0]?.value).toEqual([{ id: 1, start: '2026-11-26T09:00:00', end: '2026-11-26T10:00:00' }]);
  });

  test('navigateOnEdge moves to the next week after a dwell at the edge; the drop lands there', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-edge');
    await warm(page, s);
    const from = await center(cell(s, 18, 2));
    const root = await box(s.locator('.salmon-scheduler'));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y, { steps: 2 });
    await page.mouse.move(root.x + root.width - 4, from.y, { steps: 6 });
    await expect.poll(async () => (await logs(page, 'drag-edge', 'date')).map((e) => e.value)).toEqual(['2026-11-30']);
    const to = await center(cell(s, 21, 3));
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    expect((await logs(page, 'drag-edge', 'drop'))[0]?.value).toMatchObject({ id: 1, start: '2026-12-02T10:30:00.000Z', end: '2026-12-02T11:30:00.000Z' });
  });

  test('autoScroll scrolls the time grid while the pointer is at its edge', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-week');
    await warm(page, s);
    const grid = s.locator('.salmon-scheduler__time-scroll');
    const top0 = await grid.evaluate((el) => el.scrollTop);
    const g = await box(grid);
    const from = await center(cell(s, 18, 2));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 10, { steps: 2 });
    await page.mouse.move(from.x, g.y + g.height - 4, { steps: 4 });
    await expect.poll(() => grid.evaluate((el) => el.scrollTop)).toBeGreaterThan(top0 + 40);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  });
});

test.describe('resize', () => {
  test('the end and start edges resize in snapped steps; events fire', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-week');
    await warm(page, s);
    const b = await box(event(s, 1));
    const row = (await box(cell(s, 18, 2))).height;
    await drag(page, { x: b.x + b.width / 2, y: b.y + b.height - 2 }, { x: b.x + b.width / 2, y: b.y + b.height - 2 + 2 * row });
    expect((await logs(page, 'drag-week', 'resizeStart'))[0]).toMatchObject({ value: 1, details: 'end' });
    expect((await logs(page, 'drag-week', 'resize')).at(-1)?.value).toEqual({ start: '2026-11-24T09:00:00.000Z', end: '2026-11-24T11:00:00.000Z' });
    expect((await logs(page, 'drag-week', 'resizeEnd'))[0]?.value).toEqual({ id: 1, start: '2026-11-24T09:00:00.000Z', end: '2026-11-24T11:00:00.000Z', status: 'applied' });
    const b2 = await box(event(s, 1));
    expect(b2.height).toBeGreaterThan(b.height * 1.8);
    await drag(page, { x: b2.x + b2.width / 2, y: b2.y + 2 }, { x: b2.x + b2.width / 2, y: b2.y + 2 - row });
    expect((await logs(page, 'drag-week', 'resizeEnd'))[1]?.value).toEqual({ id: 1, start: '2026-11-24T08:30:00.000Z', end: '2026-11-24T11:00:00.000Z', status: 'applied' });
    expect(await logs(page, 'drag-week', 'dragStart')).toHaveLength(0);
  });

  test('the resize edge boxes (cursor only) exist on the hovered event alone', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-week');
    const edges = (l: Locator) => l.evaluate((el) => [getComputedStyle(el, '::before').content, getComputedStyle(el, '::after').content, getComputedStyle(el, '::after').cursor]);
    // No hover: no edge boxes on any event (1,000 events in drag-perf would otherwise lay out 2,000 boxes).
    const perf = scope(page, 'drag-perf').locator('.salmon-scheduler__event--timed');
    expect(await perf.evaluateAll((els) => els.filter((el) => getComputedStyle(el, '::after').content !== 'none').length)).toBe(0);
    const b = await box(event(s, 1));
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 2);
    expect(await edges(event(s, 1))).toEqual(['""', '""', 'ns-resize']);
    // Read-only events never get them.
    const f = await box(event(s, 5));
    await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2);
    expect((await edges(event(s, 5))).slice(0, 2)).toEqual(['none', 'none']);
  });

  test('a month bar resizes by whole days from its edges; a block in the way rejects', async ({ page }) => {
    await open(page);
    const m = scope(page, 'drag-month');
    await warm(page, m);
    const day = (d: number) => m.locator('.salmon-scheduler__month-cell').nth(d);
    // "Trip" (Wednesday 25) start edge to Monday 23.
    const bar = await box(event(m, 2));
    await drag(page, { x: bar.x + 2, y: bar.y + bar.height / 2 }, await center(day(22)));
    expect((await logs(page, 'drag-month', 'resizeStart'))[0]).toMatchObject({ value: 2, details: 'start' });
    expect((await logs(page, 'drag-month', 'resizeEnd'))[0]?.value).toEqual({ id: 2, start: '2026-11-23T00:00:00.000Z', end: '2026-11-26T00:00:00.000Z', status: 'applied' });
    // The end edge over Thursday 26 runs into the "Lunch" block: rejected with the alert.
    const bar2 = await box(event(m, 2));
    await drag(page, { x: bar2.x + bar2.width - 2, y: bar2.y + bar2.height / 2 }, await center(day(27)));
    expect((await logs(page, 'drag-month', 'resizeEnd'))[1]?.value).toMatchObject({ end: '2026-11-29T00:00:00.000Z', status: 'rejected' });
    await expect(page.getByRole('alertdialog', { name: 'Time slot not available' })).toBeVisible();
  });
});

test.describe('multi-drag, external drag, resources and groups', () => {
  test('the selected events move together and keep their offsets', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-multi');
    await warm(page, s);
    await expect(event(s, 1)).toHaveAttribute('data-selected', '');
    await drag(page, await center(cell(s, 18, 2)), await center(cell(s, 20, 3)));
    const saves = (await logs(page, 'drag-multi', 'save')).map((e) => e.value[0]);
    expect(saves).toEqual([
      { id: 1, start: '2026-11-25T10:00:00', end: '2026-11-25T11:00:00' },
      { id: 4, start: '2026-11-27T10:00:00', end: '2026-11-27T11:00:00' },
    ]);
    expect((await logs(page, 'drag-multi', 'drop'))[0]?.value).toMatchObject({ rows: 2, status: 'applied' });
  });

  test('HTML drag data dropped on a slot creates an event; a drop on dragOutArea fires onEventDragOut', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-external');
    await warm(page, s);
    await cell(s, 20, 1).scrollIntoViewIfNeeded();
    await page.getByTestId('external-item').dragTo(cell(s, 20, 1));
    expect((await logs(page, 'drag-external', 'externalDrop'))[0]?.value).toEqual({ text: 'External task', start: '2026-11-23T10:00:00.000Z', end: '2026-11-23T10:30:00.000Z', allDay: false });
    expect((await logs(page, 'drag-external', 'add'))[0]?.value).toEqual(['External task']);
    await expect(cell(s, 20, 1).locator('.salmon-scheduler__event', { hasText: 'External task' })).toHaveCount(1);
    await page.getByTestId('drag-out-area').scrollIntoViewIfNeeded();
    await drag(page, await center(cell(s, 18, 2)), await center(page.getByTestId('drag-out-area')));
    expect((await logs(page, 'drag-external', 'dragOut'))[0]).toMatchObject({ value: 1, details: 'drag-out-area' });
    await expect(cell(s, 18, 2).locator('[data-event-id="1"]')).toHaveCount(1);
  });

  test('a timeline drop on another resource row changes the resource id', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-timeline');
    await warm(page, s);
    // 30-minute columns from 08:00: column 2 is 09:00, column 6 is 11:00.
    const tl = (res: number, col: number) => s.locator(`.salmon-scheduler__tl-cell[data-resource="${res}"]`).nth(col);
    const bar = await box(event(s, 1));
    await drag(page, { x: bar.x + bar.width / 4, y: bar.y + bar.height / 2 }, await center(tl(2, 6)));
    expect((await logs(page, 'drag-timeline', 'save'))[0]?.value).toEqual([{ id: 1, start: '2026-11-24T11:00:00', end: '2026-11-24T12:00:00', roomId: 2 }]);
    expect((await logs(page, 'drag-timeline', 'drop'))[0]?.value).toMatchObject({ resourceIds: { roomId: [2] } });
    await expect(tl(2, 6).locator('[data-event-id="1"]')).toHaveCount(1);
  });

  test('a drop on another Scheduler of the drag group moves the event there', async ({ page }) => {
    await open(page);
    const a = scope(page, 'drag-group').locator('#drag-group-a');
    const b = scope(page, 'drag-group').locator('#drag-group-b');
    await warm(page, scope(page, 'drag-group'));
    await drag(page, await center(cell(a, 18, 2)), await center(cell(b, 22, 3)));
    expect((await logs(page, 'drag-group-b', 'add'))[0]?.value).toEqual([{ title: 'Hand over', start: '2026-11-25T11:00:00.000Z' }]);
    expect((await logs(page, 'drag-group-a', 'delete'))[0]?.value).toEqual([1]);
    await expect(b.locator('.salmon-scheduler__event', { hasText: 'Hand over' })).toHaveCount(1);
    await expect(a.locator('.salmon-scheduler__event', { hasText: 'Hand over' })).toHaveCount(0);
  });
});

test('a Data Grid row dragged onto a Scheduler (rowDrag.targetId) adds an event at the slot', async ({ page }) => {
  await open(page);
  const s = scope(page, 'drag-dg');
  const handle = s.locator('#drag-dg [data-row-id="t1"] .salmon-data-grid-row-drag-handle');
  const from = await center(handle);
  const to = await center(cell(s.locator('#drag-dg-target'), 22, 3));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.mouse.up();
  expect((await logs(page, 'drag-dg', 'add'))[0]?.value).toEqual([{ title: 'Grid task', start: '2026-11-25T11:00:00.000Z' }]);
  await expect(cell(s.locator('#drag-dg-target'), 22, 3).locator('.salmon-scheduler__event', { hasText: 'Grid task' })).toHaveCount(1);
});

test.describe('touch and RTL', () => {
  /** A synthetic touch swipe (pointerType 'touch') from a cell, `dx` px along x. */
  async function swipe(page: Page, target: Locator, dx: number): Promise<void> {
    const c = await center(target);
    await target.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: c.x, clientY: c.y, bubbles: true });
    await page.waitForTimeout(150);
    await page.evaluate(([x, y, d]) => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientX: x + d / 2, clientY: y, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientX: x + d, clientY: y + 4, bubbles: true }));
    }, [c.x, c.y, dx] as const);
  }

  test('a horizontal swipe navigates (mirrored in RTL); a swipe from an event does not', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-swipe');
    await swipe(page, cell(s, 20, 3), -160);
    await expect.poll(async () => (await logs(page, 'drag-swipe', 'date')).map((e) => [e.value, e.details])).toEqual([['2026-11-30', 'touch']]);
    await swipe(page, cell(s, 20, 3), 160);
    await expect.poll(async () => (await logs(page, 'drag-swipe', 'date')).length).toBe(2);
    expect((await logs(page, 'drag-swipe', 'date'))[1]?.value).toBe('2026-11-23');
    // A short vertical move is not a swipe; a swipe that starts on an event is a drag gesture.
    await swipe(page, event(s, 1), -160);
    await page.waitForTimeout(100);
    expect(await logs(page, 'drag-swipe', 'date')).toHaveLength(2);
    const r = scope(page, 'drag-swipe-rtl');
    await swipe(page, cell(r, 20, 3), -160);
    await expect.poll(async () => (await logs(page, 'drag-swipe-rtl', 'date')).map((e) => e.value)).toEqual(['2026-11-16']);
  });

  test('RTL timeline drag maps the pointer x mirrored; the end edge is on the left', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-timeline-rtl');
    await warm(page, s);
    const tl = (res: number, col: number) => s.locator(`.salmon-scheduler__tl-cell[data-resource="${res}"]`).nth(col);
    const a = await center(tl(1, 2));
    const b = await center(tl(1, 3));
    expect(b.x).toBeLessThan(a.x);
    // The bar starts on the right: 09:15 is a quarter in from its right edge.
    const bar0 = await box(event(s, 1));
    await drag(page, { x: bar0.x + (bar0.width * 3) / 4, y: bar0.y + bar0.height / 2 }, await center(tl(2, 6)));
    expect((await logs(page, 'drag-timeline-rtl', 'save'))[0]?.value).toEqual([{ id: 1, start: '2026-11-24T11:00:00', end: '2026-11-24T12:00:00', roomId: 2 }]);
    // Resize the end edge (inline end = left in RTL) by two columns.
    const bar = await box(event(s, 1));
    const col = (await box(tl(2, 6))).width;
    await drag(page, { x: bar.x + 2, y: bar.y + bar.height / 2 }, { x: bar.x + 2 - 2 * col, y: bar.y + bar.height / 2 });
    expect((await logs(page, 'drag-timeline-rtl', 'resizeEnd'))[0]?.value).toEqual({ id: 1, start: '2026-11-24T11:00:00.000Z', end: '2026-11-24T13:00:00.000Z', status: 'applied' });
  });
});

test.describe('drag frame budget (event drag or resize frame)', { tag: '@perf' }, () => {
  test('Week with 1,000 events: 0 React commits per pointer move', async ({ page }) => {
    await open(page);
    const s = scope(page, 'drag-perf');
    await warm(page, s);
    const from = await center(event(s, 1));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y + 8, { steps: 2 });
    await page.waitForTimeout(50);
    const before = await page.evaluate(() => window.__dragCommits);
    expect(before).toBeGreaterThan(0);
    const g = await box(s.locator('.salmon-scheduler__time-scroll'));
    for (let i = 0; i < 40; i++) await page.mouse.move(g.x + 80 + ((i * 37) % (g.width - 160)), g.y + 60 + ((i * 23) % (g.height - 120)));
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.__dragCommits)).toBe(before);
    await page.keyboard.press('Escape');
    await page.mouse.up();
  });

  test('Week with 1,000 events (production): drag frame script time p95 <= 2.7 ms (design budget 8 ms)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __frameMs: number[] };
      w.__frameMs = [];
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) =>
        raf((t) => {
          const t0 = performance.now();
          cb(t);
          w.__frameMs.push(performance.now() - t0);
        });
      // The pointermove listeners (the drag chunk records the pointer and schedules a frame).
      const add = window.addEventListener.bind(window);
      window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: AddEventListenerOptions | boolean) => {
        if (type !== 'pointermove' || typeof fn !== 'function') return add(type, fn, o);
        const timed = (e: Event) => {
          const t0 = performance.now();
          fn(e);
          w.__frameMs.push(performance.now() - t0);
        };
        (fn as unknown as { __timed: EventListener }).__timed = timed;
        return add(type, timed, o);
      }) as typeof window.addEventListener;
      const remove = window.removeEventListener.bind(window);
      window.removeEventListener = ((type: string, fn: EventListenerOrEventListenerObject, o?: EventListenerOptions | boolean) =>
        remove(type, (fn as unknown as { __timed?: EventListener }).__timed ?? fn, o)) as typeof window.removeEventListener;
    });
    await open(page, PROD_URL);
    const s = scope(page, 'drag-perf');
    await warm(page, s);
    const from = await center(event(s, 1));
    const g = await box(s.locator('.salmon-scheduler__time-scroll'));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y + 8, { steps: 2 });
    await page.evaluate(() => ((window as unknown as { __frameMs: number[] }).__frameMs = []));
    for (let i = 0; i < 60; i++) await page.mouse.move(g.x + 80 + ((i * 37) % (g.width - 160)), g.y + 60 + ((i * 23) % (g.height - 120)));
    const samples = await page.evaluate(() => (window as unknown as { __frameMs: number[] }).__frameMs.slice());
    await page.keyboard.press('Escape');
    await page.mouse.up();
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
    const max = samples.at(-1) ?? 0;
    console.log(`[perf] scheduler drag frame (1,000 events, Week): ${samples.length} samples, p50 ${(samples[Math.floor(samples.length / 2)] ?? 0).toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${max.toFixed(2)} ms`);
    expectBudget(samples.length, 20, 'scheduler drag frames', { atLeast: true, strict: true, unit: 'frames' });
    // Calibrated 2026-11-24 (measured plus about 5 %): p95 2.3 to 2.5 ms over the calibration runs.
    expectBudget(p95, 2.7, 'scheduler drag frame (1,000 events, Week) p95');
  });
});
