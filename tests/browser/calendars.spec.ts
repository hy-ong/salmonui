import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, PROD_URL } from './helpers.ts';
import { expectBudget } from './budget.ts';

// Calendars browser gates (examples/vite-spa/calendars.html): Calendar and
// RangeCalendar selection, views, keyboard (APG date grid), day hooks, today
// after hydration, DateField and TimeField segments (APG spinbutton), strict
// mode, locale digits and hour cycles, axe-core, and the segment / arrow-key
// timing budgets on the production build.

declare global {
  interface Window {
    __calEvents: { id: string; type: string; value: unknown; details?: any }[];
    __mountMs?: number;
    __hydrated?: boolean;
    __serverHtml?: string;
  }
}

async function open(page: Page, query = '', base = DEV_URL): Promise<void> {
  await page.goto(`${base}calendars.html${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => window.__mountMs !== undefined);
}

const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const day = (page: Page, id: string, iso: string): Locator => scope(page, id).locator(`[data-day="${iso}"]`);
const events = (page: Page, id: string, type = 'value') => page.evaluate(([i, t]) => window.__calEvents.filter((e) => e.id === i && e.type === t), [id, type] as const);
const focusedDay = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-day') ?? null);
const heading = (page: Page, id: string) => scope(page, id).locator('.salmon-calendar__heading').first();
const segments = (page: Page, id: string) => scope(page, id).locator('[role="spinbutton"]');
const segmentTexts = (page: Page, id: string) => segments(page, id).allTextContents();
const todayIso = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

test.describe('Calendar selection and state', () => {
  test('click and Enter select one day; onValueChange fires for user changes only; a controlled prop change does not echo', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page);
    await expect(day(page, 'single', '2026-11-23')).toHaveAttribute('aria-selected', 'true');
    await day(page, 'single', '2026-11-10').click();
    await expect(day(page, 'single', '2026-11-10')).toHaveAttribute('aria-selected', 'true');
    await expect(day(page, 'single', '2026-11-23')).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(day(page, 'single', '2026-11-11')).toHaveAttribute('aria-selected', 'true');
    const ev = await events(page, 'single');
    expect(ev.map((e) => e.value)).toEqual(['2026-11-10', '2026-11-11']);
    expect(ev.map((e) => [e.details.source, e.details.reason, e.details.iso])).toEqual([
      ['pointer', 'select', '2026-11-10'],
      ['keyboard', 'select', '2026-11-11'],
    ]);
    // Controlled: a prop change re-renders the selection without calling onValueChange.
    await page.locator('#set-controlled').click();
    await expect(heading(page, 'controlled')).toHaveText('December 2026');
    await expect(day(page, 'controlled', '2026-12-25')).toHaveAttribute('aria-selected', 'true');
    expect(await events(page, 'controlled')).toEqual([]);
    await day(page, 'controlled', '2026-12-02').click();
    expect((await events(page, 'controlled')).map((e) => e.value)).toEqual(['2026-12-02']);
    expect(problems).toEqual([]);
  });

  test('selectionMode="multiple" toggles days with click and Enter', async ({ page }) => {
    await open(page);
    await day(page, 'multiple', '2026-11-05').click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await day(page, 'multiple', '2026-11-03').click();
    const ev = await events(page, 'multiple');
    expect(ev.map((e) => e.value)).toEqual([['2026-11-03', '2026-11-05'], ['2026-11-03', '2026-11-05', '2026-11-06'], ['2026-11-05', '2026-11-06']]);
    expect(ev.at(-1)?.details.iso).toBe('2026-11-05,2026-11-06');
    await expect(scope(page, 'multiple').locator('table')).toHaveAttribute('aria-multiselectable', 'true');
    await expect(scope(page, 'multiple').locator('[aria-selected="true"]')).toHaveCount(2);
  });

  test('min / max disable out-of-range days, stop the previous / next buttons and clamp keyboard focus', async ({ page }) => {
    await open(page);
    await expect(day(page, 'minmax', '2026-11-04')).toHaveAttribute('aria-disabled', 'true');
    await expect(day(page, 'minmax', '2026-11-26')).toHaveAttribute('aria-disabled', 'true');
    await expect(day(page, 'minmax', '2026-11-05')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(scope(page, 'minmax').locator('[data-dir="previous"]')).toBeDisabled();
    await expect(scope(page, 'minmax').locator('[data-dir="next"]')).toBeDisabled();
    await day(page, 'minmax', '2026-11-04').click({ force: true });
    expect(await events(page, 'minmax')).toEqual([]);
    await day(page, 'minmax', '2026-11-15').focus();
    await page.keyboard.press('PageDown');
    expect(await focusedDay(page)).toBe('2026-11-25');
    await page.keyboard.press('PageUp');
    await page.keyboard.press('PageUp');
    expect(await focusedDay(page)).toBe('2026-11-05');
    await page.keyboard.press('ArrowLeft');
    expect(await focusedDay(page)).toBe('2026-11-05');
  });

  test('granularity="month" selects day 1 of a month in the year view', async ({ page }) => {
    await open(page);
    const s = scope(page, 'month-picker');
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'year');
    await s.locator('.salmon-calendar__cell', { hasText: 'Mar' }).click();
    expect((await events(page, 'month-picker')).map((e) => e.value)).toEqual(['2026-03-01']);
    await expect(s.locator('.salmon-calendar__cell', { hasText: 'Mar' })).toHaveAttribute('aria-selected', 'true');
    // The heading goes up to the decade view, never down to days.
    await heading(page, 'month-picker').click();
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'decade');
    await s.locator('.salmon-calendar__cell', { hasText: '2026' }).click();
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'year');
  });
});

test.describe('Calendar views and navigation', () => {
  test('the heading button goes month -> year -> decade; year and decade grids drill down; labelled previous / next buttons', async ({ page }) => {
    await open(page);
    const s = scope(page, 'views');
    await expect(s.locator('[data-dir="previous"]')).toHaveAttribute('aria-label', 'Previous month');
    await expect(s.locator('[data-dir="next"]')).toHaveAttribute('aria-label', 'Next month');
    await heading(page, 'views').click();
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'year');
    await expect(heading(page, 'views')).toHaveText('2026');
    await expect(s.locator('.salmon-calendar__cell')).toHaveCount(12);
    await expect(s.locator('[data-dir="previous"]')).toHaveAttribute('aria-label', 'Previous year');
    await heading(page, 'views').click();
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'decade');
    await expect(heading(page, 'views')).toHaveText('2020 – 2029');
    await expect(s.locator('.salmon-calendar__cell')).toHaveCount(12);
    await expect(s.locator('.salmon-calendar__cell').first()).toHaveAttribute('data-outside', 'true');
    await expect(heading(page, 'views')).toHaveAttribute('aria-disabled', 'true');
    await s.locator('[data-dir="next"]').click();
    await expect(heading(page, 'views')).toHaveText('2030 – 2039');
    await s.locator('.salmon-calendar__cell', { hasText: '2031' }).click();
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'year');
    await s.locator('.salmon-calendar__cell', { hasText: 'Feb' }).click();
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'month');
    await expect(heading(page, 'views')).toHaveText('February 2031');
    // The selection is unchanged by navigation.
    expect(await events(page, 'views')).toEqual([]);
  });

  test('onViewChange and onFocusedValueChange report view and month changes; a controlled view follows its prop', async ({ page }) => {
    await open(page);
    const s = scope(page, 'views');
    await s.locator('[data-dir="next"]').click();
    await expect(heading(page, 'views')).toHaveText('December 2026');
    await heading(page, 'views').click();
    expect((await events(page, 'views', 'view')).map((e) => e.value)).toEqual(['year']);
    expect((await events(page, 'views', 'focus')).map((e) => e.value)).toEqual(['2026-12-23']);
    const c = scope(page, 'controlled-view');
    await expect(c.locator('.salmon-calendar')).toHaveAttribute('data-view', 'year');
    await page.locator('#set-view-decade').click();
    await expect(c.locator('.salmon-calendar')).toHaveAttribute('data-view', 'decade');
    expect(await events(page, 'controlled-view', 'view')).toEqual([]);
    await c.locator('.salmon-calendar__cell', { hasText: '2027' }).click();
    await expect(c.locator('.salmon-calendar')).toHaveAttribute('data-view', 'year');
    expect((await events(page, 'controlled-view', 'view')).map((e) => e.value)).toEqual(['year']);
  });
});

test.describe('Calendar week and locale options', () => {
  test('firstDayOfWeek overrides the locale week start; en-US starts on Sunday, de-DE on Monday', async ({ page }) => {
    await open(page);
    const headers = (id: string) => scope(page, id).locator('thead th').allTextContents();
    expect((await headers('single'))[0]).toBe('Sun');
    expect((await headers('first-day'))[0]).toBe('Mon');
    const de = await scope(page, 'locale-de').locator('thead th').nth(1).getAttribute('abbr');
    expect(de).toBe('Montag');
  });

  test('showWeekNumbers adds labelled row headers (ISO weeks for de-DE, US weeks for en-US)', async ({ page }) => {
    await open(page);
    const de = scope(page, 'locale-de').locator('tbody th[scope="row"]');
    expect(await de.allTextContents()).toEqual(['44', '45', '46', '47', '48', '49']);
    await expect(de.first()).toHaveAttribute('aria-label', 'Week 44');
    const us = scope(page, 'week-us').locator('tbody th[scope="row"]');
    expect((await us.allTextContents())[0]).toBe('45');
    // November 2026 (Sunday first) fills five rows: the sixth, all hidden outside days, shows no week number.
    await expect(us.nth(4)).toBeVisible();
    await expect(us.nth(5)).toBeHidden();
    // ...and the week numbers sit on the day numbers' line.
    const [wk, first] = await Promise.all([us.first().boundingBox(), day(page, 'week-us', '2026-11-01').boundingBox()]);
    expect(Math.abs(wk!.y + wk!.height / 2 - (first!.y + first!.height / 2))).toBeLessThan(2);
  });

  test('weekdayFormat narrow, short and long; abbr carries the long name', async ({ page }) => {
    await open(page);
    expect(await scope(page, 'narrow').locator('thead th').allTextContents()).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    expect(await scope(page, 'single').locator('thead th').allTextContents()).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect((await scope(page, 'long').locator('thead th').allTextContents())[0]).toBe('Sunday');
    await expect(scope(page, 'narrow').locator('thead th').first()).toHaveAttribute('abbr', 'Sunday');
  });

  test('calendar="islamic-umalqura" lays out Islamic months while values stay ISO', async ({ page }) => {
    await open(page);
    const s = scope(page, 'islamic');
    await expect(heading(page, 'islamic')).toContainText('1448');
    // Jumada II 1448 starts on 2026-11-11 (Gregorian months start on the 1st).
    const days = await s.locator('[data-day]').evaluateAll((els) => els.map((e) => e.getAttribute('data-day')));
    expect(days[0]).toBe('2026-11-11');
    await expect(day(page, 'islamic', '2026-11-11')).toHaveText('1');
    await day(page, 'islamic', '2026-11-12').click();
    expect((await events(page, 'islamic')).map((e) => e.value)).toEqual(['2026-11-12']);
    await s.locator('[data-dir="next"]').click();
    await expect(heading(page, 'islamic')).toContainText('1448');
    const next = await s.locator('[data-day]').evaluateAll((els) => els.map((e) => e.getAttribute('data-day')));
    expect(next[0]).toBe('2026-12-10');
  });
});

test.describe('Calendar today, day hooks and outside days', () => {
  test('today is marked after mount; the today button selects and focuses it', async ({ page }) => {
    await open(page);
    const today = await todayIso(page);
    const s = scope(page, 'today');
    await expect(s.locator(`[data-day="${today}"]`)).toHaveAttribute('aria-current', 'date');
    await expect(s.locator(`[data-day="${today}"]`)).toHaveAttribute('data-today', 'true');
    await s.locator('.salmon-calendar__today').click();
    expect((await events(page, 'today')).map((e) => [e.value, e.details.reason])).toEqual([[today, 'today']]);
    await expect(s.locator(`[data-day="${today}"]`)).toHaveAttribute('aria-selected', 'true');
    expect(await focusedDay(page)).toBe(today);
  });

  test('server HTML has no today and a calendar without a date is a busy frame; hydration adds both without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'ssr=1');
    const html = (await page.evaluate(() => window.__serverHtml)) as string;
    expect(html).not.toContain('aria-current');
    expect(html).not.toContain('data-today');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-salmon-deferred');
    await page.waitForFunction(() => window.__hydrated);
    const today = await todayIso(page);
    await expect(scope(page, 'ssr-value').locator('[aria-current="date"]')).toHaveCount(today.startsWith('2026-11') ? 1 : 0);
    await expect(scope(page, 'ssr-empty').locator('.salmon-calendar')).not.toHaveAttribute('aria-busy', 'true');
    await expect(scope(page, 'ssr-empty').locator(`[data-day="${today}"]`)).toHaveAttribute('aria-current', 'date');
    await expect(scope(page, 'ssr-field').locator('[data-salmon-deferred]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('isDateDisabled days are aria-disabled, focusable by keyboard and not selectable', async ({ page }) => {
    await open(page);
    await expect(day(page, 'weekends', '2026-11-22')).toHaveAttribute('aria-disabled', 'true');
    await expect(day(page, 'weekends', '2026-11-23')).not.toHaveAttribute('aria-disabled', 'true');
    await day(page, 'weekends', '2026-11-23').focus();
    await page.keyboard.press('ArrowLeft');
    expect(await focusedDay(page)).toBe('2026-11-22');
    await page.keyboard.press('Enter');
    await day(page, 'weekends', '2026-11-21').click({ force: true });
    expect(await events(page, 'weekends')).toEqual([]);
  });

  test('renderDay sets cell content and getDayProps adds className, title and data-*', async ({ page }) => {
    await open(page);
    await expect(day(page, 'render-day', '2026-11-11').locator('b.mark')).toHaveText('11*');
    const holiday = day(page, 'render-day', '2026-11-25');
    await expect(holiday).toHaveClass(/salmon-calendar__day/);
    await expect(holiday).toHaveClass(/holiday/);
    await expect(holiday).toHaveAttribute('title', 'Holiday');
    await expect(holiday).toHaveAttribute('data-kind', 'holiday');
  });

  test('outside days are hidden by default and shown, marked and selectable with showOutsideDays', async ({ page }) => {
    await open(page);
    await expect(scope(page, 'single').locator('[data-empty]').first()).toBeAttached();
    // November 2026 starts on a Sunday, so the trailing cells are December days.
    await expect(day(page, 'single', '2026-12-01')).toHaveCount(0);
    const out = day(page, 'outside', '2026-12-01');
    await expect(out).toHaveAttribute('data-outside', 'true');
    await out.click();
    expect((await events(page, 'outside')).map((e) => e.value)).toEqual(['2026-12-01']);
    await expect(heading(page, 'outside')).toHaveText('December 2026');
  });
});

test.describe('Calendar accessibility and keyboard', () => {
  test('role="grid" labelled by the heading, column headers, aria-selected, full-date names, one tab stop', async ({ page }) => {
    await open(page);
    const s = scope(page, 'single');
    const grid = s.getByRole('grid');
    const id = await heading(page, 'single').getAttribute('id');
    await expect(grid).toHaveAttribute('aria-labelledby', id as string);
    await expect(grid.getByRole('columnheader')).toHaveCount(7);
    await expect(s.getByRole('gridcell', { name: 'Monday, November 23, 2026' })).toHaveAttribute('aria-selected', 'true');
    await expect(s.locator('[tabindex="0"]')).toHaveCount(1);
    await expect(s.locator('[tabindex="0"]')).toHaveAttribute('data-day', '2026-11-23');
    await expect(heading(page, 'single')).toHaveAttribute('aria-live', 'polite');
  });

  test('arrows, Home / End, Ctrl+Home / End, PageUp / PageDown, Shift+PageUp / PageDown, Ctrl+Up / Down, Enter and Space', async ({ page }) => {
    await open(page);
    const s = scope(page, 'views');
    await day(page, 'views', '2026-11-23').focus();
    const press = async (key: string, expected: string) => {
      await page.keyboard.press(key);
      expect(await focusedDay(page), key).toBe(expected);
    };
    await press('ArrowRight', '2026-11-24');
    await press('ArrowLeft', '2026-11-23');
    await press('ArrowDown', '2026-11-30');
    await press('ArrowUp', '2026-11-23');
    await press('Home', '2026-11-22');
    await press('End', '2026-11-28');
    await press('Control+Home', '2026-11-01');
    await press('Control+End', '2026-11-30');
    await press('PageDown', '2026-12-30');
    await press('PageUp', '2026-11-30');
    await press('Shift+PageDown', '2027-11-30');
    await press('Shift+PageUp', '2026-11-30');
    await page.keyboard.press('Control+ArrowUp');
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'year');
    await expect(s.locator('.salmon-calendar__cell[tabindex="0"]')).toBeFocused();
    await expect(s.locator('.salmon-calendar__cell[tabindex="0"]')).toHaveText('Nov');
    await page.keyboard.press('ArrowRight');
    await expect(s.locator('.salmon-calendar__cell[tabindex="0"]')).toHaveText('Dec');
    await page.keyboard.press('ArrowUp');
    await expect(s.locator('.salmon-calendar__cell[tabindex="0"]')).toHaveText('Aug');
    await page.keyboard.press('Home');
    await expect(s.locator('.salmon-calendar__cell[tabindex="0"]')).toHaveText('May');
    await page.keyboard.press('Control+End');
    await expect(s.locator('.salmon-calendar__cell[tabindex="0"]')).toHaveText('Dec');
    await page.keyboard.press('Control+ArrowDown');
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'month');
    expect(await focusedDay(page)).toBe('2026-12-30');
    await page.keyboard.press('Control+ArrowUp');
    await page.keyboard.press('Enter');
    await expect(s.locator('.salmon-calendar')).toHaveAttribute('data-view', 'month');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press(' ');
    await expect(day(page, 'views', '2026-12-29')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    expect((await events(page, 'views')).map((e) => e.value)).toEqual(['2026-12-29', '2026-12-29']);
  });

  test('Left / Right are mirrored in RTL for days and for DateField segments', async ({ page }) => {
    await open(page);
    const s = scope(page, 'rtl');
    await s.locator('[data-day="2026-11-23"]').focus();
    await page.keyboard.press('ArrowLeft');
    expect(await focusedDay(page)).toBe('2026-11-24');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await focusedDay(page)).toBe('2026-11-22');
    const segs = s.locator('[role="spinbutton"]');
    await segs.nth(1).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(segs.nth(2)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(segs.nth(0)).toBeFocused();
  });
});

test.describe('RangeCalendar', () => {
  test('range selection with hover and focus preview; minDays / maxDays; rangeOverDisabled block; live announcements', async ({ page }) => {
    await open(page);
    const s = scope(page, 'range');
    await expect(s.locator('.salmon-calendar__month')).toHaveCount(2);
    await day(page, 'range', '2026-11-03').click();
    await expect(s.locator('.salmon-calendar__live')).toHaveText('Tuesday, November 3, 2026 selected as the start date');
    await day(page, 'range', '2026-11-06').hover();
    await expect(s.locator('[data-in-range]')).toHaveCount(4);
    await expect(day(page, 'range', '2026-11-06')).toHaveAttribute('data-range-end', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(day(page, 'range', '2026-11-04')).toHaveAttribute('data-range-end', 'true');
    await day(page, 'range', '2026-12-02').click();
    await expect(page.locator('#range-out')).toHaveText('2026-11-03/2026-12-02');
    await expect(s.locator('.salmon-calendar__live')).toHaveText('Tuesday, November 3, 2026 to Wednesday, December 2, 2026, 30 days');
    const ev = await events(page, 'range');
    expect(ev.map((e) => [e.value, e.details.iso])).toEqual([[{ start: '2026-11-03', end: '2026-12-02' }, '2026-11-03/2026-12-02']]);
    await expect(day(page, 'range', '2026-11-03')).toHaveAttribute('data-range-start', 'true');
    await expect(day(page, 'range', '2026-11-20')).toHaveAttribute('aria-selected', 'true');

    // minDays 3, maxDays 7 around a start of 2026-11-10.
    await day(page, 'range-span', '2026-11-10').click();
    await expect(day(page, 'range-span', '2026-11-11')).toHaveAttribute('aria-disabled', 'true');
    await expect(day(page, 'range-span', '2026-11-12')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day(page, 'range-span', '2026-11-16')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day(page, 'range-span', '2026-11-17')).toHaveAttribute('aria-disabled', 'true');
    await expect(day(page, 'range-span', '2026-11-04')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day(page, 'range-span', '2026-11-03')).toHaveAttribute('aria-disabled', 'true');
    await day(page, 'range-span', '2026-11-17').click({ force: true });
    expect(await events(page, 'range-span')).toEqual([]);
    await day(page, 'range-span', '2026-11-12').click();
    expect((await events(page, 'range-span')).map((e) => e.value)).toEqual([{ start: '2026-11-10', end: '2026-11-12' }]);

    // 'block': the 15th is disabled, so a range from the 10th cannot reach past it.
    await day(page, 'range-block', '2026-11-10').click();
    await expect(day(page, 'range-block', '2026-11-14')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day(page, 'range-block', '2026-11-16')).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('Theming', () => {
  test('state data attributes on .salmon-calendar__day parts', async ({ page }) => {
    await open(page);
    await expect(day(page, 'single', '2026-11-23')).toHaveAttribute('data-selected', 'true');
    await expect(day(page, 'minmax', '2026-11-04')).toHaveAttribute('data-disabled', 'true');
    await expect(day(page, 'outside', '2026-12-01')).toHaveAttribute('data-outside', 'true');
    const bg = await day(page, 'single', '2026-11-23').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('the dark color scheme changes the calendar and field colors', async ({ page }) => {
    const colors = async () =>
      page.evaluate(() => {
        const cal = document.querySelector('[data-scenario="single"] .salmon-calendar') as HTMLElement;
        const field = document.querySelector('[data-scenario="field"] .salmon-date-field__group') as HTMLElement;
        return [getComputedStyle(cal).backgroundColor, getComputedStyle(cal).color, getComputedStyle(field).backgroundColor];
      });
    await open(page, 'scheme=light');
    const light = await colors();
    await open(page, 'scheme=dark');
    const dark = await colors();
    expect(dark[0]).not.toBe(light[0]);
    expect(dark[1]).not.toBe(light[1]);
    expect(dark[2]).not.toBe(light[2]);
  });
});

test.describe('DateField and TimeField', () => {
  test('one spinbutton per segment in a labelled group; literals are hidden', async ({ page }) => {
    await open(page);
    const s = scope(page, 'field');
    const group = s.getByRole('group', { name: 'Start' });
    await expect(group).toBeVisible();
    await expect(group).toHaveAttribute('aria-describedby', /.+/);
    const segs = group.getByRole('spinbutton');
    await expect(segs).toHaveCount(3);
    await expect(segs.nth(0)).toHaveAttribute('aria-label', 'month');
    await expect(segs.nth(0)).toHaveAttribute('aria-valuenow', '11');
    await expect(segs.nth(0)).toHaveAttribute('aria-valuemin', '1');
    await expect(segs.nth(0)).toHaveAttribute('aria-valuemax', '12');
    await expect(segs.nth(1)).toHaveAttribute('aria-valuemax', '30');
    await expect(segs.nth(2)).toHaveAttribute('aria-valuetext', '2026');
    await expect(segs.nth(0)).toHaveAttribute('inputmode', 'numeric');
    await expect(s.locator('.salmon-date-field__literal').first()).toHaveAttribute('aria-hidden', 'true');
    const empty = segments(page, 'field-empty').first();
    await expect(empty).toHaveAttribute('aria-valuetext', 'Empty');
    await expect(empty).toHaveText('mm');
  });

  test('digits type with auto-advance; Up / Down wrap; PageUp / PageDown; Home / End; Backspace clears; separators move; value is null while partial', async ({ page }) => {
    await open(page);
    const segs = segments(page, 'field-empty');
    await segs.first().focus();
    await page.keyboard.type('3');
    await expect(segs.nth(1)).toBeFocused();
    await page.keyboard.type('1');
    await expect(segs.nth(1)).toBeFocused();
    await page.keyboard.type('5');
    await expect(segs.nth(2)).toBeFocused();
    await page.keyboard.type('2026');
    expect(await segmentTexts(page, 'field-empty')).toEqual(['03', '15', '2026']);
    // Each digit of the year completes the value; the last one is the typed year.
    expect((await events(page, 'field-empty')).at(-1)?.value).toBe('2026-03-15');
    await page.keyboard.press('Backspace');
    expect((await events(page, 'field-empty')).at(-1)?.value).toBe(null);
    await expect(segs.nth(2)).toHaveAttribute('aria-valuetext', 'Empty');
    // Up on an empty segment seeds from placeholderValue (2030-06-15).
    await page.keyboard.press('ArrowUp');
    await expect(segs.nth(2)).toHaveText('2030');
    await segs.first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(segs.first()).toHaveText('12');
    await page.keyboard.press('ArrowUp');
    await expect(segs.first()).toHaveText('01');
    await page.keyboard.press('PageUp');
    await expect(segs.first()).toHaveText('04');
    await page.keyboard.press('End');
    await expect(segs.first()).toHaveText('12');
    await page.keyboard.press('Home');
    await expect(segs.first()).toHaveText('01');
    await page.keyboard.press('/');
    await expect(segs.nth(1)).toBeFocused();
    await page.keyboard.press('PageDown');
    await expect(segs.nth(1)).toHaveText('08');
  });

  test('month names and the day period type by letter; paste parses ISO, the locale order and inputFormats', async ({ page }) => {
    await open(page);
    const named = segments(page, 'field-names');
    expect(await segmentTexts(page, 'field-names')).toEqual(['23', 'Nov', '2026']);
    await named.nth(1).focus();
    await page.keyboard.type('ma');
    await expect(named.nth(1)).toHaveText('Mar');
    await page.keyboard.type('y');
    await expect(named.nth(1)).toHaveText('May');
    const time = segments(page, 'time');
    expect(await segmentTexts(page, 'time')).toEqual(['02', '30', 'PM']);
    await time.nth(2).focus();
    await page.keyboard.type('a');
    await expect(time.nth(2)).toHaveText('AM');
    expect((await events(page, 'time')).at(-1)?.value).toBe('02:30:00');
    const paste = async (id: string, text: string) => {
      await segments(page, id).first().focus();
      await page.evaluate(
        ([i, t]) => {
          const dt = new DataTransfer();
          dt.setData('text', t);
          document.querySelector(`[data-scenario="${i}"] [role="spinbutton"]`)?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        },
        [id, text] as const,
      );
    };
    await paste('field-empty', '2027-01-09');
    expect(await segmentTexts(page, 'field-empty')).toEqual(['01', '09', '2027']);
    await paste('field-empty', '12/31/2028');
    expect(await segmentTexts(page, 'field-empty')).toEqual(['12', '31', '2028']);
    // 31.05.2029 is not a valid month-first date, so the inputFormats pattern dd.MM.yyyy reads it.
    await paste('field-empty', '31.05.2029');
    expect(await segmentTexts(page, 'field-empty')).toEqual(['05', '31', '2029']);
    expect((await events(page, 'field-empty')).map((e) => [e.value, e.details.reason])).toEqual([
      ['2027-01-09', 'paste'],
      ['2028-12-31', 'paste'],
      ['2029-05-31', 'paste'],
    ]);
    await paste('time', '9:05 pm');
    expect(await segmentTexts(page, 'time')).toEqual(['09', '05', 'PM']);
  });

  test('strict reverts incomplete input and clamps out-of-range values on blur; without strict the value is kept and aria-invalid', async ({ page }) => {
    await open(page);
    const strict = segments(page, 'strict');
    await strict.nth(1).focus();
    await page.keyboard.type('30');
    await expect(scope(page, 'strict').getByRole('group')).toHaveAttribute('aria-invalid', 'true');
    await page.locator('#after').focus();
    expect(await segmentTexts(page, 'strict')).toEqual(['11', '25', '2026']);
    await strict.nth(1).focus();
    await page.keyboard.press('Backspace');
    await page.locator('#after').focus();
    expect(await segmentTexts(page, 'strict')).toEqual(['11', '25', '2026']);
    expect((await events(page, 'strict')).map((e) => e.value)).toEqual(['2026-11-03', '2026-11-30', '2026-11-25', null, '2026-11-25']);

    const loose = segments(page, 'loose');
    await loose.nth(1).focus();
    await page.keyboard.type('30');
    await page.locator('#after').focus();
    expect(await segmentTexts(page, 'loose')).toEqual(['11', '30', '2026']);
    await expect(scope(page, 'loose').getByRole('group')).toHaveAttribute('aria-invalid', 'true');
    await expect(scope(page, 'loose').locator('.salmon-date-field__error')).toHaveText('Out of range');
    expect((await events(page, 'loose')).map((e) => e.value)).toEqual(['2026-11-03', '2026-11-30']);
  });

  test('ar-EG shows Arabic-Indic digits and accepts them when typing', async ({ page }) => {
    await open(page);
    expect(await segmentTexts(page, 'field-ar')).toEqual(['٢٣', '١١', '٢٠٢٦']);
    await expect(day(page, 'rtl', '2026-11-23')).toHaveText('٢٣');
    await segments(page, 'field-ar').first().focus();
    // Playwright types non-layout characters as text input; send the keydowns an Arabic keyboard produces.
    for (const key of ['٠', '٥']) {
      await page.evaluate((k) => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })), key);
    }
    expect((await segmentTexts(page, 'field-ar'))[0]).toBe('٠٥');
    expect((await events(page, 'field-ar')).at(-1)?.value).toBe('2026-11-05');
  });

  test('12-hour fields have a day period segment typed by prefix; hourCycle="h23" overrides the locale', async ({ page }) => {
    await open(page);
    const time = segments(page, 'time');
    await expect(time.nth(0)).toHaveAttribute('aria-valuemax', '12');
    await time.nth(2).focus();
    await page.keyboard.type('p');
    await expect(time.nth(2)).toHaveText('PM');
    expect(await segmentTexts(page, 'time-24')).toEqual(['14', '30', '05']);
    await expect(segments(page, 'time-24').nth(0)).toHaveAttribute('aria-valuemax', '23');
    await segments(page, 'time-24').nth(0).focus();
    await page.keyboard.type('23');
    expect((await events(page, 'time-24')).at(-1)?.value).toBe('23:30:05');
    expect((await events(page, 'time-24')).at(-1)?.details.iso).toBe('23:30:05');
  });
});

test.describe('Calendars axe-core', () => {
  test('axe-core: zero violations on every calendar and field scenario', async ({ page }) => {
    await open(page);
    await day(page, 'range', '2026-11-03').click();
    const require = createRequire(import.meta.url);
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const violations = await page.evaluate(async () => {
      const r = await (window as any).axe.run({ include: [['#root']] }, { resultTypes: ['violations'], rules: { region: { enabled: false }, 'page-has-heading-one': { enabled: false } } });
      return r.violations.map((v: any) => `${v.id}: ${v.nodes.slice(0, 3).map((n: any) => n.target.join(' ')).join(', ')}`);
    });
    expect(violations).toEqual([]);
  });
});

/** Dispatches `key` on the focused element at the start of `count` frames; returns work-until-painted per press (ms). */
async function framedKeys(page: Page, key: string, count: number, shift = false): Promise<number[]> {
  return page.evaluate(
    ([k, n, sh]) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        const step = () => {
          requestAnimationFrame(() => {
            const t0 = performance.now();
            (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: sh, bubbles: true, cancelable: true }));
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
    [key, count, shift] as const,
  );
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] as number;

test.describe('Calendars timing (production build)', { tag: '@perf' }, () => {
  test('segment keystroke to painted <= 8 ms; calendar arrow key to focus painted <= 8 ms', async ({ page }) => {
    await open(page, '', PROD_URL);
    await segments(page, 'field').first().focus();
    await framedKeys(page, 'ArrowUp', 5);
    const segment = await framedKeys(page, 'ArrowUp', 20);
    await day(page, 'views', '2026-11-23').focus();
    await framedKeys(page, 'ArrowRight', 5);
    const arrow = await framedKeys(page, 'ArrowRight', 20);
    const report = { segment: { p50: median(segment), max: Math.max(...segment) }, arrow: { p50: median(arrow), max: Math.max(...arrow) } };
    console.log(`[perf] calendars ${JSON.stringify(report)}`);
    expectBudget(report.segment.p50, 8, 'calendars segment keystroke p50');
    expectBudget(report.arrow.p50, 8, 'calendars arrow key focus p50');
  });

  test('PageDown (next month) and Shift+PageDown (next year) to painted <= 16 ms', async ({ page }) => {
    await open(page, '', PROD_URL);
    await day(page, 'views', '2026-11-23').focus();
    await framedKeys(page, 'PageDown', 3);
    const months = await framedKeys(page, 'PageDown', 20);
    // Shift+PageDown: a new year renders the same 42-cell grid.
    const years = await framedKeys(page, 'PageDown', 20, true);
    // The focused day moved 3 + 20 months and 20 years from 2026-11-23.
    expect(await focusedDay(page)).toBe('2048-10-23');
    const report = { month: { p50: median(months), max: Math.max(...months) }, year: { p50: median(years), max: Math.max(...years) } };
    console.log(`[perf] calendars page keys ${JSON.stringify(report)}`);
    expectBudget(report.month.p50, 16, 'calendars PageDown next month p50');
    expectBudget(report.year.p50, 16, 'calendars Shift+PageDown next year p50');
  });
});
