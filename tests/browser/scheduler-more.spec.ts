import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEV_URL, trackModules, waitForModule } from './helpers.ts';

// Scheduler browser gates on scheduler.html?set=more (examples/vite-spa/src/scheduler-more.tsx):
// cell selection, the all-day row, cell templates, click and
// hover events, the Islamic calendar, formats, editor and quick
// info templates and inline editing.

async function open(page: Page): Promise<void> {
  trackModules(page);
  await page.goto(`${DEV_URL}scheduler.html?set=more`);
  await page.waitForFunction(() => window.__mountMs !== undefined);
  // The keys live in the interaction chunk, requested when idle after mount (keys before it are
  // dropped). Idle callbacks run in order, so once this one ran every scheduler requested it.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestIdleCallback(r)))));
  await waitForModule(page, /\/scheduler\/interact\.js(\?|$)/);
}
const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const logs = (page: Page, id: string, type: string) => page.evaluate(([i, t]) => window.__schedEvents.filter((e) => e.id === i && e.type === t), [id, type] as const);
const api = <T,>(page: Page, id: string, fn: string, ...args: unknown[]) => page.evaluate(([i, f, a]) => (window.__schedApi[i as string] as any)[f as string](...(a as unknown[])), [id, fn, args] as const) as Promise<T>;
// Week view, UTC, 30-minute cells: row r is r * 30 minutes after midnight, column c is Sun + c.
const cell = (s: Locator, r: number, c: number): Locator => s.locator('.salmon-scheduler__work-cell').nth(r * 7 + c);
async function center(l: Locator): Promise<{ x: number; y: number }> {
  await l.scrollIntoViewIfNeeded();
  const b = await l.boundingBox();
  if (!b) throw new Error('no box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test.describe('cells and templates', () => {
  test('a drag selects a time range across days, Shift+click extends, cellSelectionRows=false keeps one day', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-select');
    const a = await center(cell(s, 18, 2));
    const b = await center(cell(s, 21, 3));
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    const last = (await logs(page, 'sched-select', 'selection')).at(-1)?.value;
    expect(last).toEqual({ start: '2026-11-24T09:00:00.000Z', end: '2026-11-25T11:00:00.000Z', allDay: false });
    await expect(cell(s, 30, 2)).toHaveAttribute('aria-selected', 'true');
    await expect(cell(s, 17, 2)).toHaveAttribute('aria-selected', 'false');
    // quickInfo.onSelectionEnd opens the cell popup for the range.
    await expect(page.getByRole('dialog', { name: 'New event' })).toBeVisible();
    await page.keyboard.press('Escape');
    const sel = await api<{ start: string; end: string }>(page, 'sched-select', 'getSelectedCells');
    expect(new Date(sel.start).toISOString()).toBe('2026-11-24T09:00:00.000Z');

    const c = scope(page, 'sched-select-col');
    // Row 19 (9:30): row 18 holds the 9:00 standup.
    await cell(c, 19, 2).click();
    await cell(c, 20, 2).click({ modifiers: ['Shift'] });
    expect((await logs(page, 'sched-select-col', 'selection')).at(-1)?.value).toEqual({ start: '2026-11-24T09:30:00.000Z', end: '2026-11-24T10:30:00.000Z', allDay: false });
    const p = await center(cell(c, 18, 2));
    const q = await center(cell(c, 22, 4));
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(q.x, q.y, { steps: 8 });
    await page.mouse.up();
    const v = (await logs(page, 'sched-select-col', 'selection')).at(-1)?.value as { start: string; end: string };
    expect(v.start.slice(0, 10)).toBe('2026-11-24');
    expect(v.end.slice(0, 10)).toBe('2026-11-24');
  });

  test('the all-day row expands to every lane and collapses; allDayRowScroll marks the row', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-allday');
    const row = s.locator('.salmon-scheduler__all-day-row');
    const spans = row.locator('.salmon-scheduler__event--span');
    await expect(spans).toHaveCount(1);
    await expect(row.locator('.salmon-scheduler__more')).toHaveText('+2 more');
    const toggle = s.getByRole('button', { name: 'Expand all-day section' });
    await toggle.click();
    await expect(row).toHaveAttribute('data-expanded', '');
    await expect(row).toHaveAttribute('data-scroll', '');
    await expect(spans).toHaveCount(3);
    await s.getByRole('button', { name: 'Collapse all-day section' }).click();
    await expect(spans).toHaveCount(1);
    expect((await logs(page, 'sched-allday', 'expanded')).map((e) => e.value)).toEqual([true, false]);
    expect((await api<{ allDayExpanded: boolean }>(page, 'sched-allday', 'getState')).allDayExpanded).toBe(false);
  });

  test('renderDateHeader, renderHeaderIndent, renderCell and renderCellHeader', async ({ page }) => {
    await open(page);
    const w = scope(page, 'sched-tpl-week');
    await expect(w.getByTestId('date-header')).toHaveCount(7);
    await expect(w.getByTestId('date-header').first()).toHaveText('D:2026-11-22');
    await expect(w.getByTestId('indent')).toHaveText('TZ');
    await expect(w.getByTestId('noon')).toHaveCount(7);
    await expect(cell(w, 24, 0).getByTestId('noon')).toHaveCount(1);
    const m = scope(page, 'sched-tpl-month');
    await expect(m.getByTestId('cell-header')).toHaveCount(35);
    await expect(m.getByTestId('cell-header').first()).toHaveText('#1');
    await expect(m.getByTestId('first-of-month')).toHaveCount(2);
  });

  test('hover, event and cell clicks and double clicks; preventDefault skips the editor', async ({ page }) => {
    await open(page);
    const w = scope(page, 'sched-tpl-week');
    const meeting = w.locator('.salmon-scheduler__event[data-event-id="4"]');
    await meeting.hover();
    await cell(w, 30, 5).hover();
    const hovers = (await logs(page, 'sched-tpl-week', 'hover')).map((e) => [e.value, e.details.id]);
    expect(hovers).toContainEqual(['event', 4]);
    expect(hovers).toContainEqual(['cell', null]);
    await meeting.dblclick();
    expect((await logs(page, 'sched-tpl-week', 'eventDoubleClick')).map((e) => e.value)).toEqual([4]);
    expect((await logs(page, 'sched-tpl-week', 'eventClick')).map((e) => e.value)).toContain(4);
    await page.keyboard.press('Escape');
    await cell(w, 34, 5).dblclick();
    expect((await logs(page, 'sched-tpl-week', 'cellDoubleClick')).map((e) => e.value)).toEqual(['2026-11-27T17:00:00.000Z']);
    await page.waitForTimeout(300);
    await expect(page.locator('.salmon-scheduler__editor')).toHaveCount(0);
  });
});

test.describe('calendars and formats', () => {
  test('calendar="islamic-umalqura" relabels the range and dates', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-islamic');
    await expect(s.locator('.salmon-scheduler__date-range')).toHaveText(/1448/);
    await expect(s.locator('.salmon-scheduler__date-range')).not.toHaveText(/November/);
    const label = await s.locator('.salmon-scheduler__month-cell .salmon-scheduler__sr').filter({ hasText: 'Monday' }).first().textContent();
    expect(label).toMatch(/AH/);
  });

  test('hourCycle h23 and dateFormat', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-formats');
    await expect(s.locator('.salmon-scheduler__event[data-event-id="4"] .salmon-scheduler__event-time')).toHaveText('10:00 – 11:00');
    await expect(s.locator('.salmon-scheduler__date-range')).toHaveText('23/11/2026 – 29/11/2026');
    await expect(s.locator('.salmon-scheduler__time-label').nth(26)).toHaveText('13');
  });
});

test.describe('templates and inline editing', () => {
  test('renderDialog, renderDialogHeader and renderDialogFooter replace the editor parts', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-dialog-tpl');
    await s.locator('.salmon-scheduler__event[data-event-id="4"]').dblclick();
    const dlg = page.getByRole('dialog', { name: 'Edit event' });
    await expect(dlg.getByTestId('dlg-header')).toHaveText('Edit Meeting');
    await dlg.getByTestId('dlg-title').fill('Meeting 2');
    await dlg.getByTestId('dlg-save').click();
    await expect(dlg).toHaveCount(0);
    expect((await logs(page, 'sched-dialog-tpl', 'save'))[0]?.value[0].title).toBe('Meeting 2');
    await cell(s, 30, 5).dblclick();
    const add = page.getByRole('dialog', { name: 'New event' });
    await expect(add.getByTestId('dlg-header')).toHaveText('Create');
    await add.getByTestId('dlg-cancel').click();
    await expect(add).toHaveCount(0);
  });

  test('custom dialog header and footer sit in the padded title and footer slots', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-dialog-tpl');
    await s.locator('.salmon-scheduler__event[data-event-id="4"]').dblclick();
    const dlg = page.getByRole('dialog', { name: 'Edit event' });
    await expect(dlg.locator('.salmon-dialog-title').getByTestId('dlg-header')).toHaveCount(1);
    await expect(dlg.locator('.salmon-dialog-footer').getByTestId('dlg-save')).toHaveCount(1);
    const pad = await dlg.locator('.salmon-dialog-footer').evaluate((el) => getComputedStyle(el).paddingInlineEnd);
    expect(parseFloat(pad)).toBeGreaterThan(0);
    await dlg.getByTestId('dlg-cancel').click();
  });

  test('quick info header, content and footer templates for events and cells', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-qi-tpl');
    await s.locator('.salmon-scheduler__event[data-event-id="4"]').click();
    await expect(page.getByTestId('qi-header')).toHaveText('Event Meeting');
    await expect(page.getByTestId('qi-content')).toHaveText('event:2026-11-24T10:00:00.000Z');
    await page.getByTestId('qi-close').click();
    await expect(page.getByTestId('qi-header')).toHaveCount(0);
    await cell(s, 30, 5).click();
    await expect(page.getByTestId('qi-header')).toHaveText('Cell');
    await expect(page.getByTestId('qi-content')).toHaveText('cell:2026-11-27T15:00:00.000Z');
  });

  test('typing in a cell creates an event inline; Enter on an event edits its title; Escape cancels', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-inline');
    const c = cell(s, 26, 3);
    await c.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.type('Lunch');
    const input = s.getByRole('textbox', { name: 'Title' });
    await expect(input).toHaveValue('Lunch');
    await page.keyboard.press('Enter');
    await expect(input).toHaveCount(0);
    expect((await logs(page, 'sched-inline', 'add'))[0]?.value[0]).toMatchObject({ title: 'Lunch' });
    await expect(s.locator('.salmon-scheduler__event', { hasText: 'Lunch' })).toHaveCount(1);
    await expect(c).toBeFocused();

    const meeting = s.locator('.salmon-scheduler__event[data-event-id="4"]');
    await meeting.focus();
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('Meeting');
    await input.fill('Sync');
    await page.keyboard.press('Enter');
    expect((await logs(page, 'sched-inline', 'save'))[0]?.value[0]).toMatchObject({ id: 4, title: 'Sync' });
    await expect(meeting).toContainText('Sync');
    await expect(meeting).toBeFocused();

    await meeting.press('Enter');
    await input.fill('Nope');
    await page.keyboard.press('Escape');
    await expect(meeting).toContainText('Sync');
    expect(await logs(page, 'sched-inline', 'save')).toHaveLength(1);
  });
});

test.describe('export and import', () => {
  test('exportToCsv and exportToExcel write the events, fire onBeforeExport / onExport, download, and cancel', async ({ page }) => {
    await open(page);
    const csv = await api<{ fileName: string; mimeType: string; data: string }>(page, 'sched-export', 'exportToCsv', { fields: ['id', 'title', 'start'], headerTexts: { title: 'Subject' }, download: false });
    expect(csv.fileName).toBe('Schedule.csv');
    const lines = csv.data.split('\r\n');
    expect(lines[0]).toBe('id,Subject,start');
    expect(lines[1]).toBe('1,Standup,2026-11-23T09:00:00-05:00');
    // includeOccurrences expands the series over the visible week (one exception).
    const occ = await api<{ data: string }>(page, 'sched-export', 'exportToCsv', { fields: ['title'], includeOccurrences: true, separator: ';', download: false });
    expect(occ.data.split('\r\n').filter((l) => l === 'Standup')).toHaveLength(4);
    const xlsx = await page.evaluate(async () => {
      const f = await (window.__schedApi['sched-export'] as any).exportToExcel({ fileName: 'week', sheetName: 'Week', download: false });
      return { fileName: f.fileName, mimeType: f.mimeType, zip: f.data[0] === 0x50 && f.data[1] === 0x4b, size: f.data.length };
    });
    expect(xlsx).toMatchObject({ fileName: 'week.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: true });
    expect(await logs(page, 'sched-export', 'beforeExport')).toHaveLength(3);
    expect((await logs(page, 'sched-export', 'export')).map((e) => e.value)).toEqual([
      { format: 'csv', fileName: 'Schedule.csv', mimeType: 'text/csv' },
      { format: 'csv', fileName: 'Schedule.csv', mimeType: 'text/csv' },
      { format: 'excel', fileName: 'week.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ]);
    const [download] = await Promise.all([page.waitForEvent('download'), api(page, 'sched-export', 'exportToCsv', { fileName: 'events' })]);
    expect(download.suggestedFilename()).toBe('events.csv');
    expect(await api(page, 'sched-export', 'exportToExcel', { fileName: 'blocked' })).toBeNull();
    expect(await logs(page, 'sched-export', 'export')).toHaveLength(4);
  });

  test('exportToICalendar writes VEVENTs with RRULE and EXDATE; importICalendar adds the events and fires onAdd', async ({ page }) => {
    await open(page);
    const ics = await api<{ fileName: string; mimeType: string; data: string }>(page, 'sched-export', 'exportToICalendar', { calendarName: 'Week', download: false });
    expect(ics).toMatchObject({ fileName: 'Schedule.ics', mimeType: 'text/calendar' });
    expect(ics.data.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.data).toContain('X-WR-CALNAME:Week');
    expect(ics.data).toContain('SUMMARY:Standup');
    expect(ics.data).toContain('RRULE:FREQ=DAILY;COUNT=5');
    expect(ics.data).toContain('DTSTART;TZID=America/New_York:20261123T090000');
    expect(ics.data).toContain('EXDATE');
    expect(ics.data.match(/BEGIN:VEVENT/g)).toHaveLength(8);
    const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:imp-1', 'SUMMARY:Imported', 'DTSTART:20261124T150000Z', 'DTEND:20261124T160000Z', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
    const result = await page.evaluate(async (t) => {
      const r = await (window.__schedApi['sched-export'] as any).importICalendar(new Blob([t], { type: 'text/calendar' }));
      return { status: r.status, ids: r.rows.map((x: Record<string, unknown>) => x['id']) };
    }, text);
    expect(result).toEqual({ status: 'applied', ids: ['imp-1'] });
    await expect(scope(page, 'sched-export').locator('[data-event-id="imp-1"]')).toBeVisible();
    expect((await logs(page, 'sched-export', 'add')).at(-1)?.value).toEqual([{ id: 'imp-1', title: 'Imported', start: '2026-11-24T15:00:00.000Z', end: '2026-11-24T16:00:00.000Z', allDay: false }]);
    // Round trip: the export of the imported event parses back to the same instant.
    const again = await api<{ data: string }>(page, 'sched-export', 'exportToICalendar', { download: false, utc: true });
    expect(again.data).toContain('DTSTART:20261124T150000Z');
  });
});

test.describe('event selection', () => {
  test('click selects, Ctrl / Cmd toggles, Shift extends in time order; selectedEventIds is reactive', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-selection');
    const ev = (id: string) => s.locator(`.salmon-scheduler__event[data-event-id="${id}"]`).first();
    // Initial selectedEventIds={[2]}.
    await expect(ev('2')).toHaveAttribute('aria-pressed', 'true');
    await ev('3').click();
    await expect(ev('3')).toHaveAttribute('aria-pressed', 'true');
    await expect(ev('2')).toHaveAttribute('aria-pressed', 'false');
    expect((await logs(page, 'sched-selection', 'selection')).at(-1)).toMatchObject({ value: [3], details: { keys: ['3'], source: 'pointer' } });
    await ev('5').click({ modifiers: ['ControlOrMeta'] });
    expect((await logs(page, 'sched-selection', 'selection')).at(-1)?.value).toEqual([3, 5]);
    await ev('5').click({ modifiers: ['ControlOrMeta'] });
    expect((await logs(page, 'sched-selection', 'selection')).at(-1)?.value).toEqual([3]);
    // Shift: from Overlap A (Tue 10:30) to UTC call (Wed 20:00) takes the Wednesday standup occurrence between them (its series id once).
    await ev('8').click({ modifiers: ['Shift'] });
    expect((await logs(page, 'sched-selection', 'selection')).at(-1)?.value).toEqual([3, 1, 8]);
    await expect(ev('8')).toHaveAttribute('aria-pressed', 'true');
    // A series id selects every visible occurrence.
    await s.getByTestId('select-standup').click();
    await expect(s.locator('.salmon-scheduler__event[data-event-id="1"][aria-pressed="true"]')).toHaveCount(5);
    await expect(ev('3')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('scheduler shortcuts (in progress)', () => {
  test('Alt+digit switches views, Ctrl / Cmd + arrows navigate, Escape clears the event selection, Delete asks to delete', async ({ page }) => {
    await open(page);
    const s = scope(page, 'sched-selection');
    const root = s.locator('.salmon-scheduler');
    const ev = s.locator('.salmon-scheduler__event[data-event-id="3"]').first();
    await ev.click();
    await expect(ev).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(ev).toHaveAttribute('aria-pressed', 'false');
    expect((await logs(page, 'sched-selection', 'selection')).at(-1)).toMatchObject({ value: [], details: { source: 'keyboard' } });
    await ev.click();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('alertdialog', { name: 'Delete event' })).toBeVisible();
    await page.keyboard.press('Escape');
    await ev.focus();
    await page.keyboard.press('Alt+4');
    await expect(root).toHaveAttribute('data-view', 'month');
    const range = root.locator('.salmon-scheduler__date-range, [class*="range"]').first();
    const before = await range.textContent();
    // From a focused cell, which unmounts with its month: focus stays in the Scheduler.
    await root.locator('.salmon-scheduler__month-cell').nth(10).focus();
    await page.keyboard.press('ControlOrMeta+ArrowRight');
    await expect(range).not.toHaveText(before ?? '');
    await expect.poll(() => root.evaluate((r) => r.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await expect(range).toHaveText(before ?? '');
    await expect.poll(() => root.evaluate((r) => r.contains(document.activeElement))).toBe(true);
    // From the month body itself.
    await root.locator('.salmon-scheduler__month-body').focus();
    await page.keyboard.press('ControlOrMeta+ArrowRight');
    await expect(range).not.toHaveText(before ?? '');
    await page.keyboard.press('ControlOrMeta+ArrowLeft');
    await expect(range).toHaveText(before ?? '');
    await page.keyboard.press('Alt+1');
    await expect(root).toHaveAttribute('data-view', 'day');
  });
});
