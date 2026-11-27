import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Scheduler browser gates (examples/vite-spa/scheduler.html): views and
// navigation, layout, time zones, cells and events, quick info, the editor
// dialog, recurrence scopes, overlap and blocks, remote data, render hooks,
// SSR and axe-core.

declare global {
  interface Window {
    __schedEvents: { id: string; type: string; value: unknown; details?: any }[];
    __schedApi: Record<string, any>;
    __remote: { reads: { start: string; end: string }[]; rejectNext: boolean };
    __mountMs?: number;
    __hydrated?: boolean;
  }
}

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}scheduler.html${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => window.__mountMs !== undefined);
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const logs = (page: Page, id: string, type: string) => page.evaluate(([i, t]) => window.__schedEvents.filter((e) => e.id === i && e.type === t), [id, type] as const);
const event = (page: Page, id: string, eventId: number | string) => scope(page, id).locator(`.salmon-scheduler__event[data-event-id="${eventId}"]`);
const range = (page: Page, id: string) => scope(page, id).locator('.salmon-scheduler__date-range');
const api = <T,>(page: Page, id: string, fn: string, ...args: unknown[]) => page.evaluate(([i, f, a]) => (window.__schedApi[i as string] as any)[f as string](...(a as unknown[])), [id, fn, args] as const) as Promise<T>;

test.describe('views and navigation', () => {
  test('week view columns start at the locale week start; the date header link goes to the day view', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-week');
    await expect(s.locator('.salmon-scheduler__date-header')).toHaveCount(7);
    await expect(s.locator('.salmon-scheduler__date-header').first()).toHaveAttribute('data-day', '2026-11-22');
    await expect(range(page, 'sched-week')).toHaveText('Nov 22 – 28, 2026');
    await s.locator('.salmon-scheduler__date-header[data-day="2026-11-24"] .salmon-scheduler__date-link').click();
    await expect(s.locator('.salmon-scheduler')).toHaveAttribute('data-view', 'day');
    await expect(s.locator('.salmon-scheduler__date-header')).toHaveCount(1);
    await expect(s.locator('.salmon-scheduler__all-day-row')).toBeVisible();
    expect((await logs(page, 'sched-week', 'view')).map((e) => e.value)).toEqual(['day']);
  });

  test('work week shows work days; month shows weeks; views buttons switch', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-week');
    await s.getByRole('button', { name: 'Work week' }).click();
    await expect(s.locator('.salmon-scheduler__date-header')).toHaveCount(5);
    await expect(s.getByRole('button', { name: 'Work week' })).toHaveAttribute('aria-pressed', 'true');
    await s.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(s.locator('.salmon-scheduler__week-row')).toHaveCount(5);
    await expect(range(page, 'sched-week')).toHaveText('November 2026');
    // Visual consistency: md control metrics, a joined view switcher and an lg frame.
    const views = s.locator('.salmon-scheduler__views > .salmon-scheduler__button');
    await expect(views.first()).toHaveCSS('height', '32px');
    await expect(views.first()).toHaveCSS('border-start-start-radius', '6px');
    await expect(views.first()).toHaveCSS('border-start-end-radius', '0px');
    await expect(s.getByRole('button', { name: 'Next' })).toHaveCSS('width', '32px');
    await expect(s.locator('.salmon-scheduler')).toHaveCSS('border-radius', '10px');
  });

  test('previous, next and today navigate; onDateChange reports; getDateRangeText', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-week');
    await s.getByRole('button', { name: 'Next' }).click();
    await expect(range(page, 'sched-week')).toHaveText('Nov 29 – Dec 5, 2026');
    await s.getByRole('button', { name: 'Previous' }).click();
    await s.getByRole('button', { name: 'Previous' }).click();
    await expect(range(page, 'sched-week')).toHaveText('Nov 15 – 21, 2026');
    expect((await logs(page, 'sched-week', 'date')).map((e) => e.value)).toEqual(['2026-11-30', '2026-11-23', '2026-11-16']);
    expect(await api<string>(page, 'sched-week', 'getDateRangeText')).toBe('Nov 15 – 21, 2026');
    await api(page, 'sched-week', 'navigate', 'today');
    await expect(s.locator('.salmon-scheduler__date-header[data-today]')).toHaveCount(1);
  });

  test('controlled view and date follow their props; onBeforeNavigate cancels', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-controlled');
    await s.getByTestId('ext-month').click();
    await expect(s.locator('.salmon-scheduler')).toHaveAttribute('data-view', 'month');
    expect(await logs(page, 'sched-controlled', 'view')).toEqual([]);
    await s.getByTestId('ext-date').click();
    await expect(range(page, 'sched-controlled')).toHaveText('December 2026');
    await s.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(range(page, 'sched-controlled')).toHaveText('Dec 27, 2026 – Jan 2, 2027');
    // The anchor is Dec 28: Next proposes Jan 4, which onBeforeNavigate prevents.
    await s.getByRole('button', { name: 'Next' }).click();
    await expect(range(page, 'sched-controlled')).toHaveText('Dec 27, 2026 – Jan 2, 2027');
    expect(await logs(page, 'sched-controlled', 'date')).toEqual([]);
    expect((await logs(page, 'sched-controlled', 'view')).map((e) => e.value)).toEqual(['week']);
  });

  test('a 3-day custom view with label; navigation stops at max; the header calendar picks a date', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-custom');
    await expect(s.getByRole('button', { name: '3 days' })).toHaveAttribute('aria-pressed', 'true');
    await expect(s.locator('.salmon-scheduler__date-header')).toHaveCount(3);
    await expect(s.getByTestId('range')).toHaveText('2026-11-24..2026-11-26');
    await api(page, 'sched-custom', 'setDate', '2026-12-30');
    await expect(s.getByRole('button', { name: 'Next' })).toBeDisabled();
    await s.locator('.salmon-scheduler__date-range').click();
    const dialog = page.getByRole('dialog', { name: 'Choose date' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('gridcell', { name: /December 10, 2026/ }).click();
    await expect(s.getByTestId('range')).toHaveText('2026-12-10..2026-12-12');
  });
});

test.describe('layout and time', () => {
  test('overlapping events share the column; spanning events sit in the all-day row with continuation', async ({ page }) => {
    await open(page);
    const a = await event(page, 'sched-week', 2).boundingBox();
    const b = await event(page, 'sched-week', 3).boundingBox();
    expect(a && b && Math.abs(a.width - b.width) < 2 && b.x > a.x).toBeTruthy();
    const off = event(page, 'sched-week', 4);
    await expect(off).toHaveAttribute('data-all-day', '');
    await expect(off).toHaveAttribute('data-continues-start', '');
    await expect(event(page, 'sched-week', 5)).toHaveCount(1);
    await expect(scope(page, 'sched-week').locator('.salmon-scheduler__all-day-row [data-event-id="5"]')).toHaveCount(1);
  });

  test('occurrences of a series skip exceptions; wall time in the Scheduler zone', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-week');
    await expect(s.locator('[data-event-id="1"]')).toHaveCount(4);
    await expect(s.locator('[data-event-id="1"]').first()).toHaveAttribute('data-recurring', '');
    await expect(s.locator('[data-event-id="1"]').first()).toContainText('9:00 AM – 9:30 AM');
    // An instant (20:00Z) is 3:00 PM in New York and 9:00 PM in Berlin; floating times are wall time in each zone.
    await expect(s.locator('[data-event-id="8"]')).toContainText('3:00 PM');
    const c = scope(page, 'sched-controlled');
    await expect(c.locator('[data-event-id="8"]')).toContainText('9:00 PM');
    await expect(c.locator('[data-event-id="1"]').first()).toContainText('9:00 AM');
  });

  test('time scale slots, visible hours and work hours; setWorkHours overrides one day', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-custom');
    // 08:00-18:00, 30-minute major slots with 3 minor slots each: 60 rows of 10 minutes.
    await expect(s.locator('.salmon-scheduler__time-row')).toHaveCount(60);
    await expect(s.locator('.salmon-scheduler__time-row[data-major]')).toHaveCount(20);
    await expect(s.locator('.salmon-scheduler__time-row').first().locator('.salmon-scheduler__time-label')).toHaveText('8 AM');
    const first = s.locator('.salmon-scheduler__time-row').first().locator('[role="gridcell"]').first();
    await expect(first).not.toHaveAttribute('data-work', '');
    await expect(s.locator('[role="gridcell"][data-work]').first()).toBeVisible();
    await api(page, 'sched-custom', 'setWorkHours', ['2026-11-24'], '08:00', '09:00');
    await expect(first).toHaveAttribute('data-work', '');
    await api(page, 'sched-custom', 'resetWorkHours');
    await expect(first).not.toHaveAttribute('data-work', '');
  });

  test('firstDayOfWeek and week numbers', async ({ page }) => {
    await open(page);
    await scope(page, 'sched-custom').getByRole('button', { name: 'Week', exact: true }).click();
    await expect(scope(page, 'sched-custom').locator('.salmon-scheduler__date-header').first()).toHaveAttribute('data-day', '2026-11-23');
    // en-US weeks: the week of January 1 is week 1, so November 1, 2026 starts week 45.
    await expect(scope(page, 'sched-month').locator('.salmon-scheduler__week-number [aria-hidden]').first()).toHaveText('45');
  });

  test('the current time marker renders after hydration in today', async ({ page }) => {
    await open(page);
    await api(page, 'sched-week', 'navigate', 'today');
    await api(page, 'sched-week', 'setView', 'day');
    await expect(scope(page, 'sched-week').locator('.salmon-scheduler__now')).toHaveCount(1);
  });

  test('month +N more opens the day list and Escape returns focus', async ({ page }) => {
    await open(page);
    const m = scope(page, 'sched-month');
    const more = m.locator('.salmon-scheduler__more').first();
    await expect(more).toHaveText('+3 more');
    await more.click();
    const dlg = page.getByRole('dialog', { name: /Events on Wednesday, November 18, 2026/ });
    await expect(dlg.locator('.salmon-scheduler__more-item')).toHaveCount(6);
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(more).toBeFocused();
  });

  test('"+N more" rows keep the event colors although the popup portals out of the Scheduler', async ({ page }) => {
    await open(page);
    await scope(page, 'sched-month').locator('.salmon-scheduler__more').first().click();
    const item = page.getByRole('dialog', { name: /Events on/ }).locator('.salmon-scheduler__more-item').first();
    const style = await item.evaluate((el) => {
      const c = getComputedStyle(el);
      return { width: c.borderInlineStartWidth, style: c.borderInlineStartStyle, background: c.backgroundColor };
    });
    expect(style).toMatchObject({ width: '3px', style: 'solid' });
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('the hour label at the top of the time grid is never cut by the header', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-week');
    const scroller = s.locator('.salmon-scheduler__time-scroll');
    const firstLabelGap = () =>
      scroller.evaluate((el) => {
        const top = el.getBoundingClientRect().top;
        const visible = [...el.querySelectorAll('.salmon-scheduler__time-label > span:not(.salmon-scheduler__sr)')].map((x) => x.getBoundingClientRect()).find((r) => r.bottom > top);
        return visible ? visible.top - top : -1;
      });
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await firstLabelGap()).toBeGreaterThanOrEqual(0);
    await api(page, 'sched-week', 'scrollToTime', '00:00');
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await firstLabelGap()).toBeGreaterThanOrEqual(0);
  });

  test('initial scroll goes to the work start; scrollToTime moves it', async ({ page }) => {
    await open(page);
    const scroller = scope(page, 'sched-week').locator('.salmon-scheduler__time-scroll');
    const top = await scroller.evaluate((el) => el.scrollTop);
    expect(top).toBeGreaterThan(0);
    await api(page, 'sched-week', 'scrollToTime', '00:00');
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
  });
});

test.describe('cells, events and popups', () => {
  test('a cell click selects and opens the cell quick info; Save creates an event', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-week');
    const cell = s.locator('.salmon-scheduler__work-cell').nth(7 * 2 * 13 + 1);
    await cell.click();
    await expect(cell).toHaveAttribute('aria-selected', 'true');
    const qi = page.getByRole('dialog', { name: 'New event' });
    await expect(qi).toBeVisible();
    await qi.getByRole('textbox', { name: 'Title' }).fill('Coffee');
    await qi.getByRole('button', { name: 'Save' }).click();
    await expect(s.locator('.salmon-scheduler__event', { hasText: 'Coffee' })).toHaveCount(1);
    const adds = await logs(page, 'sched-week', 'add');
    expect(adds[0]?.value[0].title).toBe('Coffee');
    expect(adds[0]?.details.count).toBe(9);
    expect((await logs(page, 'sched-week', 'cellClick')).length).toBe(1);
  });

  test('the event quick info shows details, Edit and Delete; Escape closes it and returns focus', async ({ page }) => {
    await open(page);
    const e = event(page, 'sched-week', 2);
    await e.click();
    const qi = page.getByRole('dialog', { name: 'Design review' });
    await expect(qi).toContainText('10:00 AM – 11:30 AM');
    await expect(qi.getByRole('button', { name: 'Edit' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(qi).toHaveCount(0);
    await expect(e).toBeFocused();
    expect((await logs(page, 'sched-week', 'popupClose')).map((x) => x.value)).toEqual(['quickInfo']);
    expect((await logs(page, 'sched-week', 'eventClick')).map((x) => x.value)).toEqual([2]);
  });

  test('no cell is selected before a click (getSelectedCells)', async ({ page }) => {
    await open(page);
    const cells = await api<{ start: string } | null>(page, 'sched-week', 'getSelectedCells');
    expect(cells).toBe(null);
  });
});

test.describe('editing', () => {
  test('double click opens the editor; editing the title saves and fires onSave', async ({ page }) => {
    await open(page);
    await event(page, 'sched-week', 2).dblclick();
    const dlg = page.getByRole('dialog', { name: 'Edit event' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('textbox', { name: 'Title' })).toHaveValue('Design review');
    await dlg.getByRole('textbox', { name: 'Title' }).fill('Design review v2');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg).toHaveCount(0);
    await expect(event(page, 'sched-week', 2)).toContainText('Design review v2');
    const saves = await logs(page, 'sched-week', 'save');
    expect(saves[0]?.value.changed[0].title).toBe('Design review v2');
    expect(saves[0]?.details.scope).toBe('series');
  });

  test('a recurring edit asks for the scope; "This event" adds an edited occurrence', async ({ page }) => {
    await open(page);
    await event(page, 'sched-week', 1).nth(1).dblclick();
    const alert = page.getByRole('alertdialog', { name: 'Edit recurring event' });
    await expect(alert.getByRole('button')).toHaveText(['This event', 'This and following events', 'All events', 'Cancel']);
    await alert.getByRole('button', { name: 'This event' }).click();
    const dlg = page.getByRole('dialog', { name: 'Edit event' });
    await expect(dlg.locator('.salmon-recurrence-editor')).toHaveCount(0);
    await dlg.getByRole('textbox', { name: 'Title' }).fill('Standup moved');
    await dlg.getByRole('button', { name: 'Save' }).click();
    const saves = await logs(page, 'sched-week', 'save');
    expect(saves[0]?.details.scope).toBe('occurrence');
    expect(saves[0]?.value.added[0].recurrenceId).toBe(1);
    await expect(scope(page, 'sched-week').locator('.salmon-scheduler__event', { hasText: 'Standup moved' })).toHaveCount(1);
    await expect(scope(page, 'sched-week').locator('[data-event-id="1"]')).toHaveCount(3);
  });

  test('"This and following events" splits the series', async ({ page }) => {
    await open(page);
    await event(page, 'sched-week', 1).nth(2).click();
    await page.getByRole('dialog', { name: 'Standup' }).getByRole('button', { name: 'Delete' }).click();
    const alert = page.getByRole('alertdialog', { name: 'Delete recurring event' });
    await alert.getByRole('button', { name: 'This and following events' }).click();
    const del = await logs(page, 'sched-week', 'delete');
    expect(del[0]?.details.scope).toBe('following');
    expect(del[0]?.value.changed[0].recurrenceRule).toMatch(/UNTIL=20261126T/);
    await expect(scope(page, 'sched-week').locator('[data-event-id="1"]')).toHaveCount(2);
  });

  test('field validation blocks the save with a message', async ({ page }) => {
    await open(page);
    await event(page, 'sched-custom', 2).dblclick();
    const dlg = page.getByRole('dialog', { name: 'Edit event' });
    await expect(dlg.getByText('Summary', { exact: true })).toBeVisible();
    await dlg.getByRole('textbox', { name: 'Summary' }).fill('ab');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg.getByRole('alert')).toHaveText('Enter at least 3 characters.');
    await expect(dlg).toBeVisible();
  });

  test('a daily rule on a two-day event is rejected', async ({ page }) => {
    await open(page);
    await api(page, 'sched-week', 'openEditor', { start: new Date('2026-11-24T14:00:00Z'), end: new Date('2026-11-26T15:00:00Z') });
    const dlg = page.getByRole('dialog', { name: 'New event' });
    await dlg.getByRole('textbox', { name: 'Title' }).fill('Long');
    await dlg.getByRole('combobox', { name: 'Repeat' }).click();
    await page.getByRole('option', { name: 'Daily', exact: true }).click();
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg.getByRole('alert')).toHaveText('The event lasts longer than how often it repeats.');
  });

  test('overlap={false} and blocks reject with the overlap alert; onOverlap reports conflicts', async ({ page }) => {
    await open(page);
    const r = await api<{ status: string }>(page, 'sched-overlap', 'addEvents', [{ id: 50, title: 'Clash', start: '2026-11-24T10:15', end: '2026-11-24T10:45' }]);
    expect(r.status).toBe('rejected');
    await expect(page.getByRole('alertdialog', { name: 'Time slot not available' })).toBeVisible();
    expect((await logs(page, 'sched-overlap', 'overlap'))[0]?.value).toEqual([4, 2, 3]);
    await page.getByRole('button', { name: 'OK' }).click();
    const block = await api<{ status: string }>(page, 'sched-week', 'addEvents', [{ id: 51, title: 'In block', start: '2026-11-27T12:15', end: '2026-11-27T12:30' }]);
    expect(block.status).toBe('rejected');
    await expect(page.getByRole('alertdialog')).toContainText('This time is blocked.');
    await page.getByRole('button', { name: 'OK' }).click();
    expect(await api<boolean>(page, 'sched-week', 'isSlotAvailable', new Date('2026-11-27T17:15:00Z'), new Date('2026-11-27T17:30:00Z'))).toBe(false);
    expect((await api<unknown[]>(page, 'sched-week', 'getBlockEvents')).length).toBe(1);
  });

  test('read-only events and a read-only Scheduler show details only', async ({ page }) => {
    await open(page);
    await event(page, 'sched-week', 7).click();
    const qi = page.getByRole('dialog', { name: 'Locked' });
    await expect(qi.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const ro = scope(page, 'sched-readonly');
    await ro.locator('.salmon-scheduler__month-cell').nth(10).dblclick();
    await expect(page.getByRole('dialog', { name: 'New event' })).toHaveCount(0);
    expect(await logs(page, 'sched-readonly', 'add')).toEqual([]);
  });

  test('API CRUD and queries', async ({ page }) => {
    await open(page);
    const add = await api<{ status: string }>(page, 'sched-week', 'addEvents', [{ id: 60, title: 'Api', start: '2026-11-25T13:00', end: '2026-11-25T14:00' }]);
    expect(add.status).toBe('applied');
    await expect(event(page, 'sched-week', 60)).toHaveCount(1);
    const saved = await api<{ status: string }>(page, 'sched-week', 'saveEvent', { id: 60, title: 'Api 2', start: '2026-11-25T13:00', end: '2026-11-25T15:00' });
    expect(saved.status).toBe('applied');
    await expect(event(page, 'sched-week', 60)).toContainText('Api 2');
    const occ = await page.evaluate(() => window.__schedApi['sched-week'].getOccurrences(1).map((o: any) => o.start.toISOString()));
    expect(occ).toEqual(['2026-11-23T14:00:00.000Z', '2026-11-24T14:00:00.000Z', '2026-11-26T14:00:00.000Z', '2026-11-27T14:00:00.000Z']);
    const deleted = await page.evaluate(() => window.__schedApi['sched-week'].getDeletedOccurrences(1).map((d: Date) => d.toISOString()));
    expect(deleted).toEqual(['2026-11-25T14:00:00.000Z']);
    const viewEvents = await page.evaluate(() => window.__schedApi['sched-week'].getViewEvents().length);
    expect(viewEvents).toBeGreaterThan(5);
    const dates = await page.evaluate(() => window.__schedApi['sched-week'].getViewDates().map(String));
    expect(dates).toHaveLength(7);
    const infoId = await page.evaluate(() => window.__schedApi['sched-week'].getEventInfo(document.querySelector('[data-scenario="sched-week"] [data-event-id="2"]')).id);
    expect(infoId).toBe(2);
    await api(page, 'sched-week', 'deleteEvents', [60]);
    await expect(event(page, 'sched-week', 60)).toHaveCount(0);
  });
});

test.describe('data, hooks and platform', () => {
  test('renderEvent, getEventProps (class, data, hidden) and getCellProps', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-custom');
    await expect(s.getByTestId('custom-2')).toHaveText('★ Design review');
    await expect(event(page, 'sched-custom', 3)).toHaveClass(/is-overlap/);
    await expect(event(page, 'sched-custom', 3)).toHaveAttribute('data-kind', 'review');
    await expect(event(page, 'sched-custom', 7)).toHaveCount(0);
    await expect(s.locator('.salmon-scheduler__work-cell.is-five').first()).toHaveAttribute('title', 'five');
  });

  test('localeText and the toolbar items with a custom item', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-custom');
    await expect(s.getByRole('toolbar')).toBeVisible();
    await expect(s.getByRole('button', { name: 'Heute' })).toBeVisible();
    await expect(s.getByRole('button', { name: 'Custom' })).toBeVisible();
    await s.getByRole('button', { name: 'New event' }).click();
    await expect(page.getByRole('dialog', { name: 'New event' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('a remote source reads per range with a loading state; a rejected write reverts and reports', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-remote');
    await expect(s.locator('[data-event-id="1"]')).toHaveCount(1);
    const reads = await page.evaluate(() => window.__remote.reads);
    expect(reads[0]).toEqual({ start: '2026-11-24T00:00:00.000Z', end: '2026-11-25T00:00:00.000Z' });
    expect((await logs(page, 'sched-remote', 'load'))[0]?.value).toBe(1);
    await s.getByRole('button', { name: 'Next' }).click();
    await expect(s.locator('.salmon-scheduler__loading')).toBeVisible();
    await expect(s.locator('.salmon-scheduler__loading')).toHaveCount(0);
    await s.getByRole('button', { name: 'Previous' }).click();
    await expect(s.locator('[data-event-id="1"]')).toHaveCount(1);
    await page.evaluate(() => (window.__remote.rejectNext = true));
    await api(page, 'sched-remote', 'deleteEvents', [1]);
    await expect(s.locator('[data-event-id="1"]')).toHaveCount(0);
    await expect(s.locator('[data-event-id="1"]')).toHaveCount(1);
    expect((await logs(page, 'sched-remote', 'error'))[0]?.details.action).toBe('delete');
  });

  test('refresh, getState and restoreState', async ({ page }) => {
    await open(page);
    await api(page, 'sched-week', 'refresh');
    await api(page, 'sched-week', 'restoreState', { view: 'month', date: '2026-10-05' });
    await expect(range(page, 'sched-week')).toHaveText('October 2026');
    expect(await api(page, 'sched-week', 'getState')).toEqual({ view: 'month', date: '2026-10-05', allDayExpanded: false });
  });

  test('height, className and style; axe-core clean', async ({ page }) => {
    await open(page);
    await expect(scope(page, 'sched-week').locator('.salmon-scheduler')).toHaveCSS('height', '640px');
    await expectClean(page, 'scheduler', ['aria-allowed-attr']);
  });

  test('server HTML of a view hydrates without warnings and without today', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'ssr=1');
    await page.waitForFunction(() => window.__hydrated === true);
    const html = await page.evaluate(() => (window as any).__serverHtml as string);
    expect(html).toContain('salmon-scheduler__event');
    expect(html).not.toContain('data-today');
    expect(problems).toEqual([]);
  });
});
