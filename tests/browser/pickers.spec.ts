import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Calendar pickers (DatePicker, the DateTimePicker fold, DateRangePicker,
// TimePicker, common behavior, forms) on examples/vite-spa/pickers.html.

const URL = `${DEV_URL}pickers.html`;

interface LogEntry {
  case: string;
  type: string;
  value: unknown;
  details?: { source?: string; reason?: string; iso?: string; epochMilliseconds?: number };
}

declare global {
  interface Window {
    __pickerLog: LogEntry[];
    __pickerRefs: Record<string, { element: HTMLElement | null; focus(): void; blur(): void; open(): void; close(): void } | null>;
    __formData?: Record<string, string>;
  }
}

const section = (page: Page, id: string): Locator => page.locator(`section[data-case="${id}"]`);
const popupOf = (page: Page, id: string): Locator => section(page, id).locator('.salmon-picker__popup');
const logOf = async (page: Page, id: string, type?: string): Promise<LogEntry[]> => (await page.evaluate(() => window.__pickerLog)).filter((e) => e.case === id && (!type || e.type === type));
const day = (popup: Locator, iso: string): Locator => popup.locator(`[data-day="${iso}"]`);
const segments = (scope: Locator): Locator => scope.locator('[role="spinbutton"]');
const activeDate = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['day'] ?? null);

async function load(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query}`);
  await page.waitForSelector('section[data-case]');
  return problems;
}

async function openDate(page: Page, id: string): Promise<Locator> {
  await section(page, id).locator('.salmon-picker__trigger').click();
  const popup = popupOf(page, id);
  await expect(popup).toBeVisible();
  return popup;
}

test.describe('DatePicker', () => {
  test('choosing a day commits a PlainDate with ISO details and closes', async ({ page }) => {
    const problems = await load(page);
    const popup = await openDate(page, 'dp-basic');
    await day(popup, '2026-11-24').click();
    await expect(popup).toHaveCount(0);
    const values = await logOf(page, 'dp-basic', 'value');
    expect(values).toEqual([{ case: 'dp-basic', type: 'value', value: '2026-11-24', details: { source: 'pointer', reason: 'calendar', iso: '2026-11-24' } }]);
    await expect(segments(section(page, 'dp-basic'))).toHaveText(['11', '24', '2026']);
    expect(problems).toEqual([]);
  });

  test('min, max and showTodayButton reach the popup calendar', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'dp-basic');
    await expect(day(popup, '2026-11-04')).toHaveAttribute('aria-disabled', 'true');
    await expect(day(popup, '2026-11-05')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(popup.locator('.salmon-calendar__today')).toHaveCount(1);
    await popup.locator('.salmon-calendar__nav[data-dir="next"]').click();
    await expect(day(popup, '2026-12-21')).toHaveAttribute('aria-disabled', 'true');
    await expect(popup.locator('.salmon-calendar__nav[data-dir="next"]')).toBeDisabled();
  });

  test('isDateDisabled, renderDay and getDayProps in the popup; a typed disabled date is invalid', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'dp-disabled-days');
    await expect(day(popup, '2026-11-21')).toHaveAttribute('aria-disabled', 'true');
    await expect(day(popup, '2026-11-25')).toHaveClass(/holiday/);
    await expect(day(popup, '2026-11-25')).toHaveAttribute('title', 'Holiday');
    await expect(day(popup, '2026-11-01').locator('b')).toHaveText('1');
    await day(popup, '2026-11-21').click({ force: true });
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    const s = section(page, 'dp-disabled-days');
    await segments(s).nth(1).focus();
    await page.keyboard.type('21');
    await expect(s.locator('.salmon-picker')).toHaveAttribute('data-invalid', '');
    await expect(s.locator('.salmon-picker__error')).toHaveText('Pick a weekday');
    await expect(segments(s).first()).toHaveAttribute('aria-invalid', 'true');
  });

  test('pattern format, inputFormats paste and popup view events', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-format');
    const field = s.locator('.salmon-date-picker');
    await expect(segments(field)).toHaveText(['23', '11', '2026']);
    await expect(segments(s.locator('.salmon-date-range-picker'))).toHaveText(['02', '11', '2026', '06', '11', '2026']);
    await segments(field).first().focus();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text', '3.12.2026');
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(segments(field)).toHaveText(['03', '12', '2026']);
    expect((await logOf(page, 'dp-format', 'value'))[0]).toMatchObject({ value: '2026-12-03', details: { iso: '2026-12-03' } });
    await field.locator('.salmon-picker__trigger').click();
    const popup = field.locator('.salmon-picker__popup');
    // The popup calendar is a lazy chunk; PageDown acts once it mounted and took focus.
    await expect.poll(() => popup.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('PageDown');
    await popup.locator('.salmon-calendar__heading').click();
    const log = await logOf(page, 'dp-format');
    expect(log.filter((e) => e.type === 'focused').map((e) => e.value)).toContain('2027-01-03');
    expect(log.filter((e) => e.type === 'view').map((e) => e.value)).toEqual(['year']);
  });

  test('month and year pickers select from the year and decade views', async ({ page }) => {
    await load(page);
    const month = await openDate(page, 'dp-month');
    await expect(month.locator('.salmon-calendar__grid[data-view="year"]')).toHaveCount(1);
    await month.getByText('Mar', { exact: true }).click();
    expect((await logOf(page, 'dp-month', 'value'))[0]).toMatchObject({ value: '2026-03-01', details: { iso: '2026-03' } });
    await expect(segments(section(page, 'dp-month'))).toHaveCount(2);
    const year = await openDate(page, 'dp-year');
    await expect(year.locator('.salmon-calendar__grid[data-view="decade"]')).toHaveCount(1);
    await year.getByText('2028', { exact: true }).click();
    expect((await logOf(page, 'dp-year', 'value'))[0]).toMatchObject({ value: '2028-01-01', details: { iso: '2028' } });
  });

  test('trigger semantics; the popup is in the top layer below the field and on screen', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-basic');
    const trigger = s.locator('.salmon-picker__trigger');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const popup = await openDate(page, 'dp-basic');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toHaveAttribute('aria-controls', (await popup.getAttribute('id')) as string);
    await expect(popup).toHaveAttribute('role', 'dialog');
    expect(await popup.evaluate((el) => el.matches(':popover-open'))).toBe(true);
    const field = await s.locator('.salmon-picker__control').boundingBox();
    const box = await popup.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(field!.y + field!.height);
    // Flip: near the bottom of a short viewport the popup opens above.
    await page.setViewportSize({ width: 1280, height: 420 });
    await load(page);
    await page.evaluate(() => document.querySelector('section[data-case="dp-auto"]')!.scrollIntoView({ block: 'end' }));
    const flipped = await openDate(page, 'dp-auto');
    const control = await section(page, 'dp-auto').locator('.salmon-picker__control').boundingBox();
    const fb = await flipped.boundingBox();
    expect(fb!.y + fb!.height).toBeLessThanOrEqual(control!.y + 1);
    expect(fb!.y).toBeGreaterThanOrEqual(0);
  });

  test('focus moves to the selected day; Escape closes and returns focus to the trigger', async ({ page }) => {
    await load(page);
    await openDate(page, 'dp-basic');
    await expect.poll(() => activeDate(page)).toBe('2026-11-23');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => activeDate(page)).toBe('2026-11-24');
    await page.keyboard.press('Escape');
    await expect(popupOf(page, 'dp-basic')).toHaveCount(0);
    await expect(section(page, 'dp-basic').locator('.salmon-picker__trigger')).toBeFocused();
    expect(await logOf(page, 'dp-basic', 'value')).toEqual([]);
  });

  test('Alt+Down opens from a segment, Alt+Up closes, Tab leaves a popover and closes it', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-basic');
    await segments(s).first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(popupOf(page, 'dp-basic')).toBeVisible();
    await expect.poll(() => activeDate(page)).toBe('2026-11-23');
    await page.keyboard.press('Alt+ArrowUp');
    await expect(popupOf(page, 'dp-basic')).toHaveCount(0);
    await expect(segments(s).first()).toBeFocused();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(popupOf(page, 'dp-basic')).toBeVisible();
    // Tab past the last focusable of the popup (the Today button) leaves the popup.
    await popupOf(page, 'dp-basic').locator('.salmon-calendar__today').focus();
    await page.keyboard.press('Tab');
    await expect(popupOf(page, 'dp-basic')).toHaveCount(0);
    const opens = (await logOf(page, 'dp-basic', 'open')).map((e) => [e.value, e.details?.reason]);
    expect(opens).toEqual([
      [true, 'keyboard'],
      [false, 'escape'],
      [true, 'keyboard'],
      [false, 'tab'],
    ]);
  });

  test('outside press closes without moving focus', async ({ page }) => {
    await load(page);
    await openDate(page, 'dp-basic');
    await page.locator('#outside').click();
    await expect(popupOf(page, 'dp-basic')).toHaveCount(0);
    expect((await logOf(page, 'dp-basic', 'open')).at(-1)).toMatchObject({ value: false, details: { reason: 'outside' } });
  });
});

test.describe('DateTimePicker fold', () => {
  test('a date then a time from the window at timeStep', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'dtp');
    const options = popup.getByRole('option');
    await expect(options.first()).toHaveText('9:00 AM');
    await expect(options.nth(1)).toHaveText('9:15 AM');
    await expect(options.last()).toHaveText('5:00 PM');
    await expect(popup.getByRole('option', { selected: true })).toHaveText('10:30 AM');
    await day(popup, '2026-11-24').click();
    // The date commits with the time kept and focus moves to the time part.
    await expect(popup).toBeVisible();
    await expect(popup.locator('.salmon-date-picker__time-field [role="spinbutton"]').first()).toBeFocused();
    await popup.getByRole('option', { name: '2:45 PM', exact: true }).click();
    await expect(popup).toHaveCount(0);
    const values = (await logOf(page, 'dtp', 'value')).map((e) => [e.value, e.details?.reason, e.details?.iso]);
    expect(values).toEqual([
      ['2026-11-24T10:30:00', 'calendar', '2026-11-24T10:30'],
      ['2026-11-24T14:45:00', 'time', '2026-11-24T14:45'],
    ]);
  });

  test('min with a time limits the list on the boundary day', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'dtp');
    await expect(day(popup, '2026-11-09')).toHaveAttribute('aria-disabled', 'true');
    await day(popup, '2026-11-10').click();
    await expect(popup.getByRole('option').first()).toHaveText('10:30 AM');
    await popup.locator('.salmon-calendar__nav[data-dir="next"]').click();
    await day(popup, '2026-12-31').click();
    await expect(popup.getByRole('option').last()).toHaveText('4:00 PM');
  });

  test('placeholderValue positions the calendar and the time list without a value', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'dtp-empty');
    await expect.poll(() => activeDate(page)).toBe('2026-11-20');
    await expect(popup.locator('.salmon-time-list__option[data-active]')).toHaveText('1:00 PM');
  });

  test('seconds granularity with a 24-hour cycle', async ({ page }) => {
    await load(page);
    const s = section(page, 'dtp-second');
    await expect(segments(s)).toHaveCount(6);
    await expect(segments(s).nth(3)).toHaveText('10');
    await expect(segments(s).nth(5)).toHaveText('15');
    await expect(s.locator('input[name="stamp"]')).toHaveValue('2026-11-23T10:30:15');
    await expect(s.locator('[data-type="dayPeriod"]')).toHaveCount(0);
  });

  test('DatePicker props apply to the time granularities (keyboard selection, clear by typing)', async ({ page }) => {
    await load(page);
    const s = section(page, 'dtp');
    await segments(s).first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    const popup = popupOf(page, 'dtp');
    await expect(popup).toBeVisible();
    await popup.locator('.salmon-date-picker__time-field [role="spinbutton"]').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(popup).toHaveCount(0);
    expect((await logOf(page, 'dtp', 'value')).at(-1)).toMatchObject({ value: '2026-11-23T10:45:00', details: { reason: 'time' } });
  });
});

test.describe('DateRangePicker', () => {
  test('two clicks, summary, onRangeSelect, then Apply commits', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'drp');
    await expect(popup.locator('.salmon-calendar__grid')).toHaveCount(2);
    await day(popup, '2026-11-16').click();
    await day(popup, '2026-11-20').click();
    await expect(popup.locator('.salmon-date-range-picker__summary-days')).toHaveText('5 days');
    expect(await logOf(page, 'drp', 'rangeSelect')).toEqual([{ case: 'drp', type: 'rangeSelect', value: { start: '2026-11-16', end: '2026-11-20' } }]);
    expect(await logOf(page, 'drp', 'value')).toEqual([]);
    await popup.getByRole('button', { name: 'Apply' }).click();
    await expect(popup).toHaveCount(0);
    expect(await logOf(page, 'drp', 'value')).toEqual([{ case: 'drp', type: 'value', value: { start: '2026-11-16', end: '2026-11-20' }, details: { source: 'pointer', reason: 'apply', iso: '2026-11-16/2026-11-20' } }]);
  });

  test('the popup summary shows the chosen range and the day count in plural forms', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'drp');
    const summary = popup.locator('.salmon-date-range-picker__summary');
    await expect(summary).toHaveAttribute('aria-live', 'polite');
    await expect(summary.locator('.salmon-date-range-picker__summary-range')).toHaveText('Nov 10 – 14, 2026');
    await expect(summary.locator('.salmon-date-range-picker__summary-days')).toHaveText('5 days');
    await day(popup, '2026-11-16').click();
    await day(popup, '2026-11-16').click();
    await expect(summary.locator('.salmon-date-range-picker__summary-range')).toHaveText('Nov 16, 2026');
    await expect(summary.locator('.salmon-date-range-picker__summary-days')).toHaveText('1 day');
  });

  test('Cancel restores; confirm={false} commits on the second selection', async ({ page }) => {
    await load(page);
    let popup = await openDate(page, 'drp');
    await day(popup, '2026-11-16').click();
    await day(popup, '2026-11-18').click();
    await popup.getByRole('button', { name: 'Cancel' }).click();
    expect(await logOf(page, 'drp', 'value')).toEqual([]);
    await expect(segments(section(page, 'drp')).nth(1)).toHaveText('10');
    popup = await openDate(page, 'drp-noconfirm');
    await expect(popup.getByRole('button', { name: 'Apply' })).toHaveCount(0);
    await day(popup, '2026-11-03').click();
    await day(popup, '2026-11-05').click();
    await expect(popup).toHaveCount(0);
    expect((await logOf(page, 'drp-noconfirm', 'value'))[0]).toMatchObject({ value: { start: '2026-11-03', end: '2026-11-05' }, details: { reason: 'calendar' } });
  });

  test('presets (static and evaluated on open) commit and close', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'drp');
    const presets = popup.getByRole('listbox', { name: 'Presets' });
    await expect(presets.getByRole('option')).toHaveText(['First week of December', 'Next 3 days']);
    await presets.getByRole('option', { name: 'Next 3 days' }).click();
    await expect(popup).toHaveCount(0);
    expect((await logOf(page, 'drp', 'value'))[0]).toMatchObject({ value: { start: '2026-11-24', end: '2026-11-26' }, details: { reason: 'preset' } });
  });

  test('minDays and maxDays disable days around the chosen start', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'drp');
    await day(popup, '2026-11-16').click();
    await expect(day(popup, '2026-11-16')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day(popup, '2026-11-17')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day(popup, '2026-11-29')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day(popup, '2026-11-30')).toHaveAttribute('aria-disabled', 'true');
    await expect(day(popup, '2026-11-02')).toHaveAttribute('aria-disabled', 'true');
  });

  test('separator between two fields in one group; paste splits on it', async ({ page }) => {
    await load(page);
    const s = section(page, 'drp-noconfirm');
    const group = s.getByRole('group', { name: 'Quick' });
    await expect(group.locator('.salmon-date-range-picker__separator')).toHaveText(' to ');
    await expect(group.getByRole('group', { name: 'Start date' })).toHaveCount(1);
    await expect(group.getByRole('group', { name: 'End date' })).toHaveCount(1);
    await segments(s).first().focus();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text', '2026-11-03 to 2026-11-09');
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    expect((await logOf(page, 'drp-noconfirm', 'value'))[0]).toMatchObject({ value: { start: '2026-11-03', end: '2026-11-09' }, details: { reason: 'input' } });
  });

  test('two months side by side, one under a narrow container', async ({ page }) => {
    await load(page);
    let popup = await openDate(page, 'drp');
    await expect(popup.locator('.salmon-calendar__grid:visible')).toHaveCount(2);
    const [a, b] = await popup.locator('.salmon-calendar__grid').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
    expect(b!).toBeGreaterThan(a!);
    // Never clipped: the popup's content fits it and the popup fits the viewport.
    const unclipped = () =>
      popup.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.scrollWidth <= el.clientWidth && r.left >= 0 && r.right <= window.innerWidth;
      });
    await expect.poll(unclipped).toBe(true);
    await page.keyboard.press('Escape');
    // A smaller root font (the docs site) keeps two months: the minimum is in px.
    await page.evaluate(() => { document.documentElement.style.fontSize = '14px'; });
    popup = await openDate(page, 'drp');
    await expect(popup.locator('.salmon-calendar__grid:visible')).toHaveCount(2);
    await expect.poll(unclipped).toBe(true);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 420, height: 800 });
    popup = await openDate(page, 'drp');
    await expect(popup.locator('.salmon-calendar__grid:visible')).toHaveCount(1);
    await expect.poll(unclipped).toBe(true);
  });

  test('month ranges', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'drp-month');
    await popup.getByText('Apr', { exact: true }).click();
    await popup.getByText('Jul', { exact: true }).click();
    await popup.getByRole('button', { name: 'Apply' }).click();
    expect((await logOf(page, 'drp-month', 'value'))[0]).toMatchObject({ value: { start: '2026-04-01', end: '2026-07-01' }, details: { iso: '2026-04/2026-07' } });
    await expect(section(page, 'drp-month').locator('input[name="months"]')).toHaveValue('2026-04/2026-07');
  });

  test('min and max; strict clamps an out-of-range end to the bound on blur', async ({ page }) => {
    await load(page);
    const s = section(page, 'drp-bounds');
    const end = s.getByRole('group', { name: 'End date' });
    await segments(end).nth(1).focus();
    await page.keyboard.type('28');
    await expect(s.locator('.salmon-picker')).toHaveAttribute('data-invalid', '');
    await page.locator('#outside').click();
    await expect(segments(end).nth(1)).toHaveText('25');
    expect((await logOf(page, 'drp-bounds', 'value')).at(-1)).toMatchObject({ value: { start: '2026-11-10', end: '2026-11-25' }, details: { reason: 'strict' } });
  });

  test('rangeOverDisabled="block" stops a range at the next disabled day', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'drp-bounds');
    await expect(day(popup, '2026-11-14')).toHaveAttribute('aria-disabled', 'true');
    await day(popup, '2026-11-12').click();
    // With the start on Thursday 12, the days past the disabled weekend cannot end the range.
    await expect(day(popup, '2026-11-13')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day(popup, '2026-11-17')).toHaveAttribute('aria-disabled', 'true');
    await day(popup, '2026-11-13').click();
    await expect(popup.locator('.salmon-date-range-picker__summary-days')).toHaveText('2 days');
  });

  test('hover previews the range before the second selection', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'drp');
    await day(popup, '2026-11-16').click();
    await day(popup, '2026-11-19').hover();
    await expect(day(popup, '2026-11-17')).toHaveAttribute('data-in-range');
    await expect(day(popup, '2026-11-19')).toHaveAttribute('data-range-end');
    await expect(day(popup, '2026-11-20')).not.toHaveAttribute('data-in-range');
  });

  test('Alt+Right / Alt+Left move between presets, calendars and buttons', async ({ page }) => {
    await load(page);
    await openDate(page, 'drp');
    await expect.poll(() => activeDate(page)).toBe('2026-11-10');
    await page.keyboard.press('Alt+ArrowRight');
    await expect(popupOf(page, 'drp').getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(popupOf(page, 'drp').getByRole('listbox', { name: 'Presets' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(popupOf(page, 'drp').getByRole('option', { name: 'Next 3 days' })).toHaveAttribute('data-active', '');
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(popupOf(page, 'drp').getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect.poll(() => activeDate(page)).toBe('2026-11-10');
  });
});

test.describe('TimePicker', () => {
  const openTime = async (page: Page, id: string): Promise<Locator> => {
    await section(page, id).locator('.salmon-picker__trigger').click();
    const list = popupOf(page, id).getByRole('listbox');
    await expect(list).toBeVisible();
    return list;
  };

  test('options at step between min and max; picking commits a PlainTime', async ({ page }) => {
    await load(page);
    const list = await openTime(page, 'tp');
    const options = list.getByRole('option');
    await expect(options).toHaveCount(21);
    await expect(options.first()).toHaveText('8:00 AM');
    await expect(options.last()).toHaveText('6:00 PM');
    await list.getByRole('option', { name: '10:30 AM', exact: true }).click();
    await expect(list).toHaveCount(0);
    expect(await logOf(page, 'tp', 'value')).toEqual([{ case: 'tp', type: 'value', value: '10:30:00', details: { source: 'pointer', reason: 'option', iso: '10:30' } }]);
  });

  test('hourCycle and Intl formatting of the options', async ({ page }) => {
    await load(page);
    const list = await openTime(page, 'tp-render');
    await expect(list.getByRole('option').nth(13)).toHaveText('13:00 slot');
  });

  test('placeholderValue positions the list without a value', async ({ page }) => {
    await load(page);
    const list = await openTime(page, 'tp-placeholder');
    await expect(list.locator('[data-active]')).toHaveText('2:00 PM');
    expect(await list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test('renderOption renders option content', async ({ page }) => {
    await load(page);
    const list = await openTime(page, 'tp-render');
    await expect(list.locator('.slot')).toHaveCount(24);
  });

  test('listbox keys with focus in the field and aria-activedescendant', async ({ page }) => {
    await load(page);
    const s = section(page, 'tp');
    await segments(s).first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    const list = popupOf(page, 'tp').getByRole('listbox');
    await expect(list).toBeVisible();
    await expect(s.locator('.salmon-picker__trigger')).toHaveAttribute('aria-haspopup', 'listbox');
    const active = list.locator('[data-active]');
    await expect(active).toHaveText('9:30 AM');
    await expect(active).toHaveAttribute('aria-selected', 'true');
    await expect(segments(s).first()).toBeFocused();
    await expect(segments(s).first()).toHaveAttribute('aria-activedescendant', (await active.getAttribute('id')) as string);
    await page.keyboard.press('ArrowDown');
    await expect(list.locator('[data-active]')).toHaveText('10:00 AM');
    await page.keyboard.press('End');
    await expect(list.locator('[data-active]')).toHaveText('6:00 PM');
    await page.keyboard.press('Home');
    await expect(list.locator('[data-active]')).toHaveText('8:00 AM');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(list).toHaveCount(0);
    await expect(segments(s).first()).toBeFocused();
    await expect(segments(s).first()).not.toHaveAttribute('aria-activedescendant', /.+/);
    expect((await logOf(page, 'tp', 'value')).at(-1)).toMatchObject({ value: '08:30:00', details: { source: 'keyboard', reason: 'option' } });
    // Closed: Up / Down are segment keys.
    await page.keyboard.press('ArrowUp');
    await expect(segments(s).first()).toHaveText('09');
  });

  test('the popup is at least as wide as the field', async ({ page }) => {
    await load(page);
    await openTime(page, 'tp');
    const field = await section(page, 'tp').locator('.salmon-picker__control').boundingBox();
    const popup = await popupOf(page, 'tp').boundingBox();
    expect(popup!.width).toBeGreaterThanOrEqual(Math.floor(field!.width));
  });

  test('a 1,440-option list is windowed and keeps the active option mounted', async ({ page }) => {
    await load(page);
    const list = await openTime(page, 'tp-1440');
    const count = await list.getByRole('option').count();
    expect(count).toBeLessThan(80);
    await expect(list.getByRole('option').first()).toHaveAttribute('aria-setsize', '1440');
    await expect(list.locator('[data-active]')).toHaveText('1:37 PM');
    await expect(list.locator('[data-active]')).toHaveAttribute('aria-posinset', '818');
    await list.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(list.getByRole('option', { name: '12:00 AM', exact: true })).toHaveCount(1);
    await expect(list.locator('[data-active]')).toHaveText('1:37 PM');
  });

  test('isTimeDisabled options are skipped and typed values invalid', async ({ page }) => {
    await load(page);
    const s = section(page, 'tp');
    const list = await openTime(page, 'tp');
    await expect(list.getByRole('option', { name: '12:00 PM', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await segments(s).first().focus();
    await page.keyboard.press('Escape');
    await segments(s).first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await expect(popupOf(page, 'tp').locator('[data-active]')).toHaveText('11:30 AM');
    await page.keyboard.press('ArrowDown');
    await expect(popupOf(page, 'tp').locator('[data-active]')).toHaveText('1:00 PM');
    await page.keyboard.press('Escape');
    await segments(s).first().focus();
    await page.keyboard.type('12');
    await expect(s.locator('.salmon-picker')).toHaveAttribute('data-invalid', '');
  });

  test('strict TimePicker clamps to the nearest bound on blur', async ({ page }) => {
    await load(page);
    const s = section(page, 'tp-strict');
    await segments(s).first().focus();
    await page.keyboard.type('07');
    await page.locator('#outside').click();
    await expect(segments(s).first()).toHaveText('09');
    expect((await logOf(page, 'tp-strict', 'value')).at(-1)).toMatchObject({ value: '09:00:00', details: { reason: 'strict' } });
  });
});

test.describe('Common behavior', () => {
  test('disabled pickers have no tab stops and no popup', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-disabled');
    await expect(s.locator('.salmon-picker__trigger')).toBeDisabled();
    await expect(segments(s).first()).not.toHaveAttribute('tabindex', '0');
    await expect(segments(s).first()).toHaveAttribute('aria-disabled', 'true');
    await s.locator('.salmon-picker__trigger').click({ force: true });
    await expect(popupOf(page, 'dp-disabled')).toHaveCount(0);
  });

  test('readOnly is focusable, does not edit and does not open', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-readonly');
    await segments(s).nth(1).focus();
    await expect(segments(s).nth(1)).toBeFocused();
    await expect(segments(s).nth(1)).toHaveAttribute('aria-readonly', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(segments(s).nth(1)).toHaveText('23');
    await s.locator('.salmon-picker__trigger').click({ force: true });
    await expect(popupOf(page, 'dp-readonly')).toHaveCount(0);
    expect(await logOf(page, 'dp-readonly')).toEqual([{ case: 'dp-readonly', type: 'focus', value: null }]);
  });

  test('placeholder watermark while empty and not focused', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-placeholder');
    await expect(s.locator('.salmon-picker__placeholder')).toBeVisible();
    await expect(s.locator('.salmon-picker__placeholder')).toHaveText('Choose a date');
    const opacity = () => s.locator('.salmon-picker__field').evaluate((el) => getComputedStyle(el).opacity);
    expect(await opacity()).toBe('0');
    await segments(s).first().focus();
    await expect(s.locator('.salmon-picker__placeholder')).toBeHidden();
    expect(await opacity()).toBe('1');
  });

  test('clear button fires onValueChange(null) and onClear', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-controlled');
    await s.getByRole('button', { name: 'Clear' }).click();
    const log = (await logOf(page, 'dp-controlled')).filter((e) => e.type !== 'focus');
    expect(log.map((e) => [e.type, e.value, e.details?.reason])).toEqual([
      ['value', null, 'clear'],
      ['clear', null, undefined],
    ]);
    await expect(page.locator('#controlled-value')).toHaveText('');
    await expect(s.getByRole('button', { name: 'Clear' })).toHaveCount(0);
  });

  test('editable={false} makes segments read-only and a click on the field opens the popup', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-noedit');
    await expect(segments(s).first()).toHaveAttribute('aria-readonly', 'true');
    await s.locator('.salmon-picker__field').click();
    await expect(popupOf(page, 'dp-noedit')).toBeVisible();
    expect((await logOf(page, 'dp-noedit', 'open'))[0]).toMatchObject({ value: true, details: { reason: 'field' } });
  });

  test('openOnFocus', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-openonfocus');
    await segments(s).first().focus();
    await expect(popupOf(page, 'dp-openonfocus')).toBeVisible();
    expect((await logOf(page, 'dp-openonfocus', 'open'))[0]).toMatchObject({ value: true, details: { reason: 'focus' } });
  });

  test('openOnFocus, a click on the trigger opens the popup and leaves it open', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-openonfocus');
    await s.locator('.salmon-picker__trigger').click();
    await expect(popupOf(page, 'dp-openonfocus')).toBeVisible();
    await page.waitForTimeout(200);
    await expect(popupOf(page, 'dp-openonfocus')).toBeVisible();
    expect((await logOf(page, 'dp-openonfocus', 'open')).map((e) => e.value)).toEqual([true]);
  });

  test('controlled open, onOpenChange, veto by not updating open, defaultOpen after hydration', async ({ page }) => {
    await load(page);
    const veto = section(page, 'dp-veto');
    await veto.locator('.salmon-picker__trigger').click();
    await expect(popupOf(page, 'dp-veto')).toHaveCount(0);
    expect(await logOf(page, 'dp-veto', 'open')).toEqual([{ case: 'dp-veto', type: 'open', value: true, details: { source: 'pointer', reason: 'trigger' } }]);
    const controlled = section(page, 'dp-controlled');
    await controlled.locator('.salmon-picker__trigger').click();
    await expect(popupOf(page, 'dp-controlled')).toBeVisible();
    await load(page, '?defaultOpen');
    await expect(popupOf(page, 'dp-default-open')).toBeVisible();
  });

  test('ref.open(), ref.close(), ref.focus(), ref.blur()', async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__pickerRefs['dp-basic']!.open());
    await expect(popupOf(page, 'dp-basic')).toBeVisible();
    await page.evaluate(() => window.__pickerRefs['dp-basic']!.close());
    await expect(popupOf(page, 'dp-basic')).toHaveCount(0);
    expect((await logOf(page, 'dp-basic', 'open')).map((e) => [e.value, e.details?.source])).toEqual([
      [true, 'api'],
      [false, 'api'],
    ]);
    await page.evaluate(() => window.__pickerRefs['tp']!.focus());
    await expect(segments(section(page, 'tp')).first()).toBeFocused();
    await page.evaluate(() => window.__pickerRefs['tp']!.blur());
    await expect(segments(section(page, 'tp')).first()).not.toBeFocused();
    expect(await page.evaluate(() => window.__pickerRefs['drp']!.element?.className)).toContain('salmon-date-range-picker');
  });

  test('onFocus and onBlur fire once for the whole group, popup included', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-basic');
    await segments(s).first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await s.locator('.salmon-picker__trigger').click();
    await day(popupOf(page, 'dp-basic'), '2026-11-25').focus();
    await page.keyboard.press('Escape');
    await page.locator('#outside').click();
    const log = (await logOf(page, 'dp-basic')).filter((e) => e.type === 'focus' || e.type === 'blur').map((e) => e.type);
    expect(log).toEqual(['focus', 'blur']);
  });

  test('popupMode="modal" is a dialog sheet; "auto" picks the sheet on a coarse small screen', async ({ page, browser }) => {
    await load(page);
    const popup = await openDate(page, 'dp-modal');
    expect(await popup.evaluate((el) => el.tagName)).toBe('DIALOG');
    expect(await popup.evaluate((el) => (el as HTMLDialogElement).open && el.matches(':modal'))).toBe(true);
    await expect(popup).toHaveAttribute('data-mode', 'modal');
    await popup.getByRole('button', { name: 'Close' }).click();
    await expect(popup).toHaveCount(0);
    const auto = await openDate(page, 'dp-auto');
    await expect(auto).toHaveAttribute('data-mode', 'popover');
    const mobile = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
    const phone = await mobile.newPage();
    await load(phone);
    await section(phone, 'dp-auto').locator('.salmon-picker__trigger').tap();
    await expect(popupOf(phone, 'dp-auto')).toHaveAttribute('data-mode', 'modal');
    expect((await logOf(phone, 'dp-auto', 'open'))[0]).toMatchObject({ details: { source: 'touch' } });
    await mobile.close();
  });

  test('className and style on the root, other DOM props on the field group', async ({ page }) => {
    await load(page);
    const root = section(page, 'dp-placeholder').locator('.salmon-date-picker');
    await expect(root).toHaveClass(/custom-class/);
    expect(await root.evaluate((el) => el.style.minInlineSize)).toBe('240px');
    await expect(section(page, 'dp-placeholder').locator('.salmon-picker__control')).toHaveAttribute('data-extra', 'x');
  });

  test('dir="rtl" mirrors the popup alignment and the arrow keys', async ({ page }) => {
    await load(page, '?dir=rtl');
    const popup = await openDate(page, 'dp-basic');
    const control = await section(page, 'dp-basic').locator('.salmon-picker__control').boundingBox();
    const box = await popup.boundingBox();
    expect(Math.abs(box!.x + box!.width - (control!.x + control!.width))).toBeLessThan(2);
    await expect.poll(() => activeDate(page)).toBe('2026-11-23');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => activeDate(page)).toBe('2026-11-24');
  });

  test('onValueChange reports user changes only, never a prop change', async ({ page }) => {
    await load(page);
    await page.locator('#set-controlled').click();
    await expect(segments(section(page, 'dp-controlled'))).toHaveText(['01', '15', '2026']);
    expect(await logOf(page, 'dp-controlled', 'value')).toEqual([]);
    const s = section(page, 'dp-controlled');
    await segments(s).nth(1).focus();
    await page.keyboard.press('ArrowUp');
    expect(await logOf(page, 'dp-controlled', 'value')).toEqual([{ case: 'dp-controlled', type: 'value', value: '2026-01-16', details: { source: 'keyboard', reason: 'input', iso: '2026-01-16' } }]);
    await expect(page.locator('#controlled-value')).toHaveText('2026-01-16');
  });

  test('zoned date-times report epochMilliseconds and an offset ISO value', async ({ page }) => {
    await load(page);
    const s = section(page, 'dp-zone');
    // 15:00 UTC is 00:00 the next day in Tokyo.
    await expect(segments(s)).toHaveText(['11', '24', '2026', '12', '00', 'AM']);
    await expect(s.locator('input[name="tokyo"]')).toHaveValue('2026-11-24T00:00+09:00');
    await segments(s).nth(4).focus();
    await page.keyboard.press('ArrowUp');
    expect((await logOf(page, 'dp-zone', 'value'))[0]).toMatchObject({ value: '2026-11-24T00:01:00', details: { iso: '2026-11-24T00:01+09:00', epochMilliseconds: Date.UTC(2026, 10, 23, 15, 1) } });
  });
});

test.describe('Forms', () => {
  test('form values are ISO strings and intervals', async ({ page }) => {
    await load(page);
    await page.locator('#picker-form [name="needed"]').evaluate((el) => el.removeAttribute('required'));
    await page.locator('#submit').click();
    expect(await page.evaluate(() => window.__formData)).toEqual({
      due: '2026-11-23',
      needed: '',
      meeting: '2026-11-23T14:30+01:00',
      stay: '2026-11-02/2026-11-06',
      from: '2026-12-01',
      to: '2026-12-03',
      alarm: '07:30',
    });
  });

  test('required and custom validity block submit and focus the first segment', async ({ page }) => {
    await load(page);
    const input = page.locator('#picker-form input[name="needed"]');
    await expect(input).toHaveAttribute('aria-hidden', 'true');
    await expect(input).toHaveAttribute('tabindex', '-1');
    expect(await input.evaluate((el) => el.getAttribute('type'))).toBeNull();
    await page.locator('#submit').click();
    expect(await page.evaluate(() => window.__formData)).toBeUndefined();
    expect(await logOf(page, 'form-empty', 'invalid')).toHaveLength(1);
    await expect(page.locator('section[data-case="form"] .salmon-picker').nth(1).locator('[role="spinbutton"]').first()).toBeFocused();
    // A value out of range sets a custom validity message.
    const due = page.locator('section[data-case="form"] .salmon-picker').first();
    await due.locator('[role="spinbutton"]').nth(1).focus();
    await page.keyboard.type('03');
    expect(await page.locator('#picker-form input[name="due"]').evaluate((el: HTMLInputElement) => el.validationMessage)).toBe('');
    await due.locator('[role="spinbutton"]').first().focus();
    await page.keyboard.type('12');
    expect(await page.locator('#picker-form input[name="due"]').evaluate((el: HTMLInputElement) => el.validationMessage)).toBe('Choose Nov 30, 2026 or earlier.');
    await expect(due).toHaveAttribute('data-invalid', '');
  });

  test('form reset restores defaultValue', async ({ page }) => {
    await load(page);
    const due = page.locator('section[data-case="form"] .salmon-picker').first();
    await due.locator('[role="spinbutton"]').nth(1).focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#picker-form input[name="due"]')).toHaveValue('2026-11-24');
    const time = page.locator('section[data-case="form"] .salmon-time-picker');
    await time.locator('[role="spinbutton"]').first().focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#picker-form input[name="alarm"]')).toHaveValue('08:30');
    await page.locator('#reset').click();
    await expect(page.locator('#picker-form input[name="due"]')).toHaveValue('2026-11-23');
    await expect(page.locator('#picker-form input[name="alarm"]')).toHaveValue('07:30');
    expect((await logOf(page, 'form-date', 'value')).at(-1)).toMatchObject({ value: '2026-11-23', details: { reason: 'reset', source: 'api' } });
  });
});

test.describe('Data Grid editors', () => {
  test('datePickerEditor maps column editorProps to the DatePicker and writes ISO dates and instants', async ({ page }) => {
    const problems = await load(page, '?grid');
    const grid = section(page, 'grid');
    const cell = (column: string) => grid.locator(`[role="gridcell"][data-column-id="${column}"]`).first();
    await expect(cell('due')).toHaveText('2026-11-16');
    await cell('due').dblclick();
    const editor = grid.locator('.salmon-data-grid-editor .salmon-date-picker');
    await expect(editor).toHaveCount(1);
    await expect(segments(editor)).toHaveText(['11', '16', '2026']);
    await editor.locator('.salmon-picker__trigger').click();
    const popup = editor.locator('.salmon-picker__popup');
    await expect(popup).toBeVisible();
    // editorProps: firstDayOfWeek (Monday first), showWeekNumbers, calendar (era heading), min and max.
    await expect(popup.locator('thead th[abbr]').nth(1)).toHaveAttribute('abbr', 'Monday');
    await expect(popup.locator('tbody th[scope="row"]').first()).toBeVisible();
    await expect(popup.locator('.salmon-calendar__heading').first()).toContainText('Reiwa');
    await expect(day(popup, '2026-11-04')).toHaveAttribute('aria-disabled', 'true');
    await expect(day(popup, '2026-11-05')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(day(popup, '2026-11-28')).toHaveAttribute('aria-disabled', 'true');
    // Escape in the popup closes the popup only; the cell stays in edit mode.
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(editor).toHaveCount(1);
    await editor.locator('.salmon-picker__trigger').click();
    await day(editor.locator('.salmon-picker__popup'), '2026-11-20').click();
    await expect(segments(editor)).toHaveText(['11', '20', '2026']);
    await segments(editor).first().focus();
    await page.keyboard.press('Enter');
    await expect(editor).toHaveCount(0);
    await expect(cell('due')).toHaveText('2026-11-20');
    // A datetime column: the DatePicker with a time part; the instant is written in the editor's time zone.
    await cell('at').dblclick();
    const at = grid.locator('.salmon-data-grid-editor .salmon-date-picker');
    await expect(segments(at)).toHaveText(['11', '16', '2026', '09', '30']);
    await segments(at).nth(3).focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect(at).toHaveCount(0);
    await expect(cell('at')).toHaveText('2026-11-16 10:30');
    expect(problems).toEqual([]);
  });
});

test.describe('Picker layout', () => {
  test('the date-and-time popup puts the time column beside the calendar', async ({ page }) => {
    await load(page);
    const popup = await openDate(page, 'dtp');
    const calendar = (await popup.locator('.salmon-calendar').boundingBox())!;
    const time = (await popup.locator('.salmon-date-picker__time').boundingBox())!;
    expect(time.x).toBeGreaterThanOrEqual(calendar.x + calendar.width);
    expect(Math.abs(time.y - calendar.y)).toBeLessThan(8);
  });

  test('description text wraps at the control width; the placeholder stays clear of the trigger', async ({ page }) => {
    await load(page);
    const basic = section(page, 'dp-basic');
    const control = (await basic.locator('.salmon-picker__control').boundingBox())!;
    const description = (await basic.locator('.salmon-picker__description').boundingBox())!;
    expect(Math.round(description.width)).toBe(Math.round(control.width));
    const empty = section(page, 'dp-placeholder');
    const placeholder = (await empty.locator('.salmon-picker__placeholder').boundingBox())!;
    const trigger = (await empty.locator('.salmon-picker__trigger').boundingBox())!;
    expect(placeholder.x + placeholder.width).toBeLessThanOrEqual(trigger.x);
  });
});
