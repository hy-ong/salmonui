import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Scheduler browser gates on scheduler.html?set=views (examples/vite-spa/src/scheduler-views.tsx):
// timeline views and header rows, resources and grouping, virtual scrolling
// and lazy loading, auto row height, Year, Timeline Year, Agenda and Month Agenda. All scenarios
// are in UTC on 2026-11-24 (Tuesday) unless the scenario says otherwise.

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}scheduler.html?set=views${query ? `&${query}` : ''}`);
  await page.waitForFunction(() => window.__mountMs !== undefined && document.querySelector('[data-salmon-pending]') === null);
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const event = (s: Locator, id: number | string): Locator => s.locator(`.salmon-scheduler__event[data-event-id="${id}"]`);
const rows = (s: Locator): Locator => s.locator('.salmon-scheduler__tl-body > [role="row"]');
const logs = (page: Page, id: string, type: string) => page.evaluate(([i, t]) => window.__schedEvents.filter((e) => e.id === i && e.type === t), [id, type] as const);
const api = <T,>(page: Page, id: string, fn: string, ...args: unknown[]) => page.evaluate(([i, f, a]) => (window.__schedApi[i as string] as any)[f as string](...(a as unknown[])), [id, fn, args] as const) as Promise<T>;
const utc = (iso: string): string => String(Date.parse(`${iso}Z`));

test.describe('timeline views', () => {
  test('Timeline Day lays slots out horizontally and places events by start and length', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    const s = scope(page, 'tl-day');
    // 08:00-18:00 in 30-minute slots, one row without resources.
    await expect(rows(s)).toHaveCount(1);
    await expect(s.locator('.salmon-scheduler__tl-cell')).toHaveCount(20);
    await expect(s.locator('.salmon-scheduler__tl-label[data-unit="hour"]')).toHaveCount(10);
    await expect(s.locator('.salmon-scheduler__tl-label[data-unit="date"]')).toHaveText(['Tue Nov 24']);
    const start = s.locator(`[data-cell-start="${utc('2026-11-24T09:00')}"]`);
    await expect(start.locator('.salmon-scheduler__event[data-event-id="1"]')).toHaveCount(1);
    const cell = await start.boundingBox();
    const box = await event(s, 1).boundingBox();
    // 90 minutes = 3 slots.
    expect(Math.abs((box?.width ?? 0) - 3 * (cell?.width ?? 0))).toBeLessThan(8);
    await s.getByRole('button', { name: 'Next' }).click();
    await expect(s.locator('.salmon-scheduler__date-range')).toHaveText('Wednesday, November 25, 2026');
    await expect(s.locator('.salmon-scheduler__event')).toHaveCount(1);
    expect(problems).toEqual([]);
  });

  test('Timeline Work Week shows work days only; Timeline Month has one column per day', async ({ page }) => {
    await open(page);
    const s = scope(page, 'tl-day');
    await s.getByRole('button', { name: 'Timeline work week' }).click();
    await expect(s.locator('.salmon-scheduler__tl-label[data-unit="date"]')).toHaveText(['Mon Nov 23', 'Tue Nov 24', 'Wed Nov 25', 'Thu Nov 26', 'Fri Nov 27']);
    await s.getByRole('button', { name: 'Timeline month' }).click();
    await expect(s.locator('.salmon-scheduler__tl-cell')).toHaveCount(30);
    await expect(s.locator('[data-view="timelineMonth"] .salmon-scheduler__event')).toHaveCount(4);
    // The all-day workshop (Nov 25 to 26) starts in the Nov 25 cell and covers two days.
    const ws = s.locator(`.salmon-scheduler__tl-cell[data-cell-start="${utc('2026-11-25T00:00')}"] .salmon-scheduler__event[data-event-id="3"]`);
    await expect(ws).toHaveCount(1);
    const w = (await ws.boundingBox())?.width ?? 0;
    const c = (await s.locator('.salmon-scheduler__tl-cell').first().boundingBox())?.width ?? 0;
    expect(Math.abs(w - 2 * c)).toBeLessThan(8);
  });

  test('Timeline Week by resource with week, date and hour header rows and a header template', async ({ page }) => {
    await open(page);
    const s = scope(page, 'tl-week');
    await expect(s.locator('.salmon-scheduler__tl-head [role="row"]')).toHaveCount(3);
    await expect(s.locator('.salmon-scheduler__tl-label[data-unit="week"]')).toHaveText(['Week 48']);
    await expect(s.locator('.salmon-scheduler__tl-label[data-unit="date"]')).toHaveCount(7);
    await expect(s.getByTestId('hour')).toHaveCount(168);
    await expect(rows(s)).toHaveCount(2);
    await expect(rows(s).nth(0).locator('[role="rowheader"]')).toHaveText('Room A');
    await expect(event(rows(s).nth(0), 1)).toHaveCount(1);
    await expect(event(rows(s).nth(1), 2)).toHaveCount(1);
    await expect(event(rows(s).nth(1), 3)).toHaveCount(1);
    await expect(event(rows(s).nth(0), 2)).toHaveCount(0);
    // The header row spans: the date cell covers 24 hour columns.
    expect(await s.locator('.salmon-scheduler__tl-label[data-unit="date"]').first().evaluate((el) => (el as HTMLElement).style.gridColumn)).toBe('span 24');
  });

  test('Timeline Year by month (horizontal) and by column (vertical) with month and day header templates', async ({ page }) => {
    await open(page);
    const h = scope(page, 'tl-year');
    await expect(rows(h)).toHaveCount(12);
    await expect(h.getByTestId('day-header')).toHaveCount(31);
    await expect(h.getByTestId('month-header').first()).toHaveText('Jan');
    // March 2 to 4: the holiday sits in the March row from day 2, three days long.
    const march = rows(h).nth(2);
    await expect(event(march, 2)).toHaveCount(1);
    const w = (await event(march, 2).boundingBox())?.width ?? 0;
    const c = (await march.locator('.salmon-scheduler__tl-cell').first().boundingBox())?.width ?? 0;
    expect(Math.abs(w - 3 * c)).toBeLessThan(8);
    // February has 28 days: three disabled cells.
    await expect(rows(h).nth(1).locator('[data-outside]')).toHaveCount(3);
    const v = scope(page, 'tl-year-v');
    await expect(v.locator('[data-orientation="vertical"] .salmon-scheduler__tl-label')).toHaveText(['November', 'December', 'January']);
    await expect(rows(v)).toHaveCount(31);
    const nov24 = v.locator(`[data-cell-start="${utc('2026-11-24T00:00')}"]`);
    await expect(nov24.locator('.salmon-scheduler__event')).toHaveCount(2);
  });
});

test.describe('resources and grouping', () => {
  test('resource colors, class names, per-resource work hours and the editor resource fields', async ({ page }) => {
    await open(page);
    const s = scope(page, 'grp-editor');
    const planning = event(s, 1);
    await expect(planning).toHaveAttribute('data-color', '');
    expect(await planning.evaluate((el) => getComputedStyle(el).borderInlineStartColor)).toBe('rgb(217, 72, 15)');
    // Room A works 08:00-12:00, Room B the default 09:00-18:00.
    const a = (t: string) => s.locator(`.salmon-scheduler__work-cell[data-resource="1"][data-cell-start="${utc(`2026-11-24T${t}`)}"]`);
    const b = (t: string) => s.locator(`.salmon-scheduler__work-cell[data-resource="2"][data-cell-start="${utc(`2026-11-24T${t}`)}"]`);
    await expect(a('08:00')).toHaveAttribute('data-work', '');
    await expect(a('13:00')).not.toHaveAttribute('data-work', '');
    await expect(b('08:00')).not.toHaveAttribute('data-work', '');
    await expect(b('13:00')).toHaveAttribute('data-work', '');
    await expect(b('13:00')).toHaveClass(/room-b/);
    // A new event from a Room B cell is created in Room B.
    await b('14:00').dblclick();
    const dlg = page.getByRole('dialog', { name: 'New event' });
    await expect(dlg.locator('[data-resource-field="roomId"]')).toContainText('Room B');
    await dlg.getByRole('textbox', { name: 'Title' }).fill('Room B talk');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg).toHaveCount(0);
    const added = s.locator('.salmon-scheduler__event', { hasText: 'Room B talk' });
    await expect(added).toHaveAttribute('data-resource', '2');
    // Editing shows the event's resources: the multiple owners field lists both.
    await planning.dblclick();
    const edit = page.getByRole('dialog', { name: 'Edit event' });
    await expect(edit.locator('[data-resource-field="ownerIds"]')).toContainText('Ann');
    await expect(edit.locator('[data-resource-field="ownerIds"]')).toContainText('Cid');
    await edit.getByRole('button', { name: 'Cancel' }).click();
  });

  test('nested resource headers in vertical views; a shared event selects in every resource', async ({ page }) => {
    await open(page);
    const s = scope(page, 'grp-week');
    const heads = s.locator('.salmon-scheduler__resource-header');
    await expect(heads).toHaveText(['Room A', 'Room B', 'Ann', 'Cid', 'Bob']);
    expect(await heads.first().evaluate((el) => (el as HTMLElement).style.gridColumn)).toBe('span 14');
    await expect(s.locator('.salmon-scheduler__all-day-cell')).toHaveCount(21);
    // Planning (owners Ann and Cid) renders in both owner columns; with sharedEvents one click selects both copies.
    await expect(event(s, 1)).toHaveCount(2);
    await event(s, 1).first().click();
    await page.keyboard.press('Escape');
    await expect(s.locator('.salmon-scheduler__event[data-event-id="1"][data-selected]')).toHaveCount(2);
    await s.getByRole('button', { name: 'Month' }).click();
    await expect(s.locator('.salmon-scheduler__week-row').first().locator('.salmon-scheduler__month-cell')).toHaveCount(21);
    await expect(event(s, 3)).toHaveCount(1);
    // Timeline copies without sharedEvents select one at a time.
    const t = scope(page, 'tl-month');
    await event(t, 1).first().click();
    await page.keyboard.press('Escape');
    await expect(t.locator('.salmon-scheduler__event[data-event-id="1"][data-selected]')).toHaveCount(1);
  });

  test('byDate puts dates above resources; hideNonWorkingDays keeps each resource to its work days', async ({ page }) => {
    await open(page);
    const s = scope(page, 'grp-bydate');
    const head = s.locator('.salmon-scheduler__header [role="row"]');
    await expect(head.nth(0).locator('.salmon-scheduler__date-header')).toHaveCount(7);
    await expect(head.nth(1).locator('.salmon-scheduler__resource-header')).toHaveCount(14);
    expect(await head.nth(0).locator('.salmon-scheduler__date-header').first().evaluate((el) => (el as HTMLElement).style.gridColumn)).toBe('span 2');
    await expect(s.locator(`.salmon-scheduler__all-day-cell[data-resource="2"][data-cell-start="${utc('2026-11-25T00:00')}"] .salmon-scheduler__event[data-event-id="3"]`)).toHaveCount(1);
    // byDate splits the two-day workshop into one part per day column.
    await expect(event(s, 3)).toHaveCount(2);
    const h = scope(page, 'grp-hide');
    // Room A works Mon-Wed, Room B every work day: 3 + 5 columns.
    await expect(h.locator('.salmon-scheduler__all-day-cell[data-resource="1"]')).toHaveCount(3);
    await expect(h.locator('.salmon-scheduler__all-day-cell[data-resource="2"]')).toHaveCount(5);
  });

  test('byParent=false puts every child under every parent', async ({ page }) => {
    await open(page);
    const s = scope(page, 'grp-flat');
    await expect(rows(s).locator('[role="rowheader"]')).toHaveText(['Room A', 'Ann', 'Bob', 'Cid', 'Room B', 'Ann', 'Bob', 'Cid']);
    await expect(rows(s).nth(1).locator('.salmon-scheduler__event[data-event-id="1"]')).toHaveCount(1);
    // Room B > Ann matches no event (Ann's events are in Room A); Room B > Bob has the review.
    await expect(rows(s).nth(5).locator('.salmon-scheduler__event')).toHaveCount(0);
    await expect(rows(s).nth(6).locator('.salmon-scheduler__event[data-event-id="2"]')).toHaveCount(1);
  });

  test('resource header template and tooltip; parent rows expand and collapse', async ({ page }) => {
    await open(page);
    const s = scope(page, 'tl-month');
    await expect(s.getByTestId('res-header')).toHaveText(['Room A +', 'Ann', 'Cid', 'Room B +', 'Bob']);
    const ann = s.locator('.salmon-scheduler__resource-text').nth(1);
    await ann.hover();
    await expect(ann.getByRole('tooltip')).toHaveText('Tip Ann');
    await expect(ann.getByRole('tooltip')).toBeVisible();
    await s.getByRole('button', { name: 'Room A', expanded: true }).click();
    await expect(s.getByTestId('res-header')).toHaveText(['Room A +', 'Room B +', 'Bob']);
    expect((await logs(page, 'tl-month', 'expanded')).at(-1)?.value).toEqual([2]);
    await api(page, 'tl-month', 'expandResource', 1);
    await expect(s.getByTestId('res-header')).toHaveCount(5);
    await api(page, 'tl-month', 'collapseResource', 2);
    await expect(s.getByTestId('res-header')).toHaveText(['Room A +', 'Ann', 'Cid', 'Room B +']);
  });

  test('resources are reactive; getResources and getResource', async ({ page }) => {
    await open(page);
    const s = scope(page, 'tl-week');
    expect((await api<unknown[]>(page, 'tl-week', 'getResources')).length).toBe(5);
    expect((await api<{ text: string }>(page, 'tl-week', 'getResource', 2, 'rooms')).text).toBe('Room B');
    await s.getByTestId('add-room').click();
    await expect(rows(s)).toHaveCount(3);
    await expect(rows(s).nth(2).locator('[role="rowheader"]')).toHaveText('Room C');
    expect((await api<unknown[]>(page, 'tl-week', 'getResources')).length).toBe(6);
  });

  test('1,000 resource rows render a window; getRenderedRange and scrollToResource', async ({ page }) => {
    await open(page);
    const s = scope(page, 'tl-virtual');
    await expect(rows(s).first()).toBeVisible();
    const count = await rows(s).count();
    expect(count).toBeGreaterThan(3);
    expect(count).toBeLessThan(15);
    const first = await api<{ start: number; end: number; resourceIds: number[] }>(page, 'tl-virtual', 'getRenderedRange');
    expect(first.start).toBe(0);
    expect(first.resourceIds[0]).toBe(1);
    await api(page, 'tl-virtual', 'scrollToResource', 700);
    await expect(s.locator('.salmon-scheduler__tl-row[data-resource="700"]')).toBeVisible();
    const r = await api<{ start: number; end: number; resourceIds: number[] }>(page, 'tl-virtual', 'getRenderedRange');
    expect(r.start).toBeGreaterThan(690);
    expect(r.resourceIds).toContain(700);
    // Scrolling to the end renders the last row.
    await s.locator('.salmon-scheduler__tl').evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(s.locator('.salmon-scheduler__tl-row[data-resource="1000"]')).toBeVisible();
    expect(await rows(s).count()).toBeLessThan(15);
  });

  test('lazy loading reads the events of the rendered resources only', async ({ page }) => {
    await open(page);
    const s = scope(page, 'tl-lazy');
    await expect(s.locator('.salmon-scheduler__event').first()).toBeVisible();
    const reads = () => page.evaluate(() => window.__lazyReads);
    const r0 = (await reads()).at(-1);
    expect(r0?.first).toBe(1);
    expect(r0?.ids).toBeLessThan(15);
    await s.locator('.salmon-scheduler__tl').evaluate((el) => (el.scrollTop = 40_000));
    await expect.poll(async () => (await reads()).at(-1)?.first ?? 0).toBeGreaterThan(400);
    await expect(s.locator('.salmon-scheduler__event').first()).toBeVisible();
  });

  test('autoRowHeight grows timeline and month rows to every event instead of +N more', async ({ page }) => {
    await open(page);
    const auto = scope(page, 'tl-auto');
    await expect(auto.locator('.salmon-scheduler__event')).toHaveCount(5);
    await expect(auto.locator('.salmon-scheduler__more')).toHaveCount(0);
    const more = scope(page, 'tl-more');
    await expect(more.locator('.salmon-scheduler__event')).toHaveCount(2);
    await expect(more.locator('.salmon-scheduler__more').first()).toHaveText('+3 more');
    const hAuto = (await rows(auto).first().boundingBox())?.height ?? 0;
    const hMore = (await rows(more).first().boundingBox())?.height ?? 0;
    expect(hAuto).toBeGreaterThan(hMore + 40);
    const month = scope(page, 'month-auto');
    await expect(month.locator('.salmon-scheduler__event')).toHaveCount(5);
    await expect(month.locator('.salmon-scheduler__more')).toHaveCount(0);
  });
});

test.describe('year and agenda views', () => {
  test('Year marks event days; a day opens its events; the date goes to the day view', async ({ page }) => {
    await open(page);
    const s = scope(page, 'year');
    await expect(s.locator('.salmon-scheduler__mini')).toHaveCount(12);
    await expect(s.getByTestId('year-month').first()).toHaveText('M:January');
    await expect(s.locator('[data-day="2026-11-24"]')).toHaveAttribute('data-has-events', '');
    await expect(s.locator('[data-day="2026-11-25"]')).not.toHaveAttribute('data-has-events', '');
    await s.locator('[data-day="2026-11-24"] button').click();
    const pop = page.getByRole('dialog', { name: /Events on/ });
    await expect(pop.locator('.salmon-scheduler__more-item')).toHaveCount(2);
    await pop.getByRole('button', { name: /Events on/ }).click();
    await expect(s.locator('.salmon-scheduler__day-view')).toBeVisible();
    await expect(s.locator('.salmon-scheduler__date-range')).toHaveText('Tuesday, November 24, 2026');
    const f = scope(page, 'year-fiscal');
    await expect(f.locator('.salmon-scheduler__mini')).toHaveCount(6);
    await expect(f.locator('.salmon-scheduler__mini').first()).toHaveAttribute('data-month', '2026-04');
    await expect(f.locator('.salmon-scheduler__mini').first().getByTestId('wd')).toHaveText(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });

  test('Agenda lists the days with events; hideEmptyAgendaDays=false lists every day', async ({ page }) => {
    await open(page);
    const s = scope(page, 'agenda');
    await expect(s.locator('.salmon-scheduler__agenda-day')).toHaveCount(4);
    await expect(s.locator('.salmon-scheduler__agenda-day').first()).toContainText('Standup');
    await expect(s.locator('.salmon-scheduler__agenda-day[data-day="2026-11-27"]')).toContainText('Trip');
    const all = scope(page, 'agenda-all');
    await expect(all.locator('.salmon-scheduler__agenda-day')).toHaveCount(3);
    await expect(all.locator('.salmon-scheduler__agenda-day[data-day="2026-11-24"]')).toContainText('No events');
    await all.locator('.salmon-scheduler__agenda-day[data-day="2026-11-25"] .salmon-scheduler__event').click();
    await expect(page.getByRole('dialog', { name: 'Standup' })).toBeVisible();
  });

  test('Agenda virtual scrolling appends days as the list scrolls', async ({ page }) => {
    await open(page);
    const s = scope(page, 'agenda-virtual');
    const list = s.locator('.salmon-scheduler__agenda');
    const before = Number(await list.getAttribute('data-days'));
    expect(before).toBeGreaterThanOrEqual(7);
    for (let i = 0; i < 40 && !(await s.getByText('Far away').count()); i++) await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(s.getByText('Far away')).toBeVisible();
    expect(Number(await list.getAttribute('data-days'))).toBeGreaterThan(before);
  });

  test('Month Agenda shows the selected day of the month grid', async ({ page }) => {
    await open(page);
    const s = scope(page, 'month-agenda');
    const day = (d: string) => s.locator(`.salmon-scheduler__mini [data-day="${d}"]`);
    await expect(day('2026-11-23')).toHaveAttribute('aria-selected', 'true');
    await expect(s.locator('.salmon-scheduler__agenda-list')).toContainText('Standup');
    await expect(day('2026-11-26')).toHaveAttribute('data-has-events', '');
    await day('2026-11-26').locator('button').click();
    await expect(day('2026-11-26')).toHaveAttribute('aria-selected', 'true');
    await expect(s.locator('.salmon-scheduler__agenda-list')).toContainText('Trip');
  });
});

test.describe('server rendering, theming and accessibility', () => {
  test('timeline, grouped, virtualized, year and agenda server HTML hydrates without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'ssr=1');
    await page.waitForFunction(() => window.__hydrated === true);
    const html = await page.evaluate(() => (window as any).__serverHtml as string);
    expect(html).not.toContain('data-salmon-pending');
    expect(html).not.toContain('data-today');
    expect(html).toContain('data-view="timelineWeek"');
    expect(html).toContain('salmon-scheduler__mini');
    expect(html).toContain('salmon-scheduler__agenda-day');
    // Rows with aria-rowindex: 5 resource rows, the virtualized timeline's initialRange (12 of 1,000 rows) and 12 months.
    expect((html.match(/aria-rowindex=/g) ?? []).length).toBe(5 + 12 + 12);
    await expect(page.locator('.salmon-scheduler__event').first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('RTL mirrors the timeline: the resource column is on the right', async ({ page }) => {
    await open(page, 'ssr=1');
    await page.waitForFunction(() => window.__hydrated === true);
    const rtl = page.locator('.salmon-scheduler[dir="rtl"]');
    const head = await rtl.locator('.salmon-scheduler__tl-resource').first().boundingBox();
    const cell = await rtl.locator('.salmon-scheduler__tl-cell').first().boundingBox();
    expect((head?.x ?? 0) > (cell?.x ?? 0)).toBe(true);
  });

  test('resource colors mix against the seeds; forced colors keep event borders; state is in data attributes', async ({ page }) => {
    await open(page);
    const s = scope(page, 'grp-editor');
    const planning = event(s, 1);
    const bg = await planning.evaluate((el) => getComputedStyle(el).backgroundColor);
    // 22 % of the resource color over the surface: neither the raw color nor the default primary tint.
    expect(bg).not.toBe('rgb(217, 72, 15)');
    expect(bg).toMatch(/^(rgb|color)\(/);
    await planning.click();
    await page.keyboard.press('Escape');
    await expect(planning).toHaveAttribute('data-selected', '');
    await page.emulateMedia({ forcedColors: 'active' });
    const border = await event(s, 2).evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.borderTopStyle, cs.borderTopWidth, cs.borderInlineStartWidth];
    });
    expect(border).toEqual(['solid', '1px', '1px']);
  });

  test('axe-core: timeline, grouped, year and agenda views', async ({ page }) => {
    await open(page);
    await expectClean(page, 'scheduler views', ['aria-allowed-attr']);
  });
});
