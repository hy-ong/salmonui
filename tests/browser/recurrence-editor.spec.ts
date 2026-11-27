import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// RecurrenceEditor browser gates (examples/vite-spa/scheduler.html): value
// triad, repeat and end types, weekday toggles, monthly and yearly options,
// the until DatePicker bounds, locale, RTL, axe-core and hydration.

declare global {
  interface Window {
    __schedEvents: { id: string; type: string; value: unknown; details?: any }[];
    __mountMs?: number;
    __hydrated?: boolean;
  }
}

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${DEV_URL}scheduler.html${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => window.__mountMs !== undefined);
}

const scope = (page: Page, id: string): Locator => page.locator(`[data-scenario="${id}"]`);
const values = (page: Page, id: string) => page.evaluate((i) => window.__schedEvents.filter((e) => e.id === i && e.type === 'value').map((e) => e.value), id);
const summary = (page: Page, id: string) => scope(page, id).locator('.salmon-recurrence-editor__summary');

async function choose(page: Page, combobox: Locator, label: string): Promise<void> {
  await combobox.click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

test.describe('RecurrenceEditor', () => {
  test('never -> weekly emits an RRULE anchored at start; back to never emits null', async ({ page }) => {
    await open(page);
    const s = scope(page, 're-basic');
    await expect(summary(page, 're-basic')).toHaveText('Never');
    await choose(page, s.getByRole('combobox', { name: 'Repeat' }), 'Weekly');
    // 2026-11-23 is a Monday.
    expect(await values(page, 're-basic')).toEqual(['FREQ=WEEKLY;BYDAY=MO']);
    await expect(summary(page, 're-basic')).toHaveText('Every week on Monday');
    await s.getByRole('button', { name: 'Wednesday' }).click();
    expect((await values(page, 're-basic')).at(-1)).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
    await s.getByLabel('Repeat every').fill('2');
    expect((await values(page, 're-basic')).at(-1)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
    await expect(summary(page, 're-basic')).toHaveText('Every 2 weeks on Monday and Wednesday');
    await choose(page, s.getByRole('combobox', { name: 'Repeat' }), 'Never');
    expect((await values(page, 're-basic')).at(-1)).toBe(null);
    const details = await page.evaluate(() => window.__schedEvents.filter((e) => e.id === 're-basic').at(-2)?.details);
    expect(details.summary).toBe('Every 2 weeks on Monday and Wednesday');
    expect(details.rule.frequency).toBe('weekly');
  });

  test('a controlled value follows its prop and a prop change does not echo', async ({ page }) => {
    await open(page);
    const s = scope(page, 're-controlled');
    await expect(s.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
    await s.getByTestId('set-monthly').click();
    await expect(summary(page, 're-controlled')).toHaveText('Every month on the last Friday, 5 times');
    expect(await values(page, 're-controlled')).toEqual([]);
    await s.getByRole('radio', { name: 'On day' }).check();
    await expect(s.getByTestId('rule')).toHaveText('FREQ=MONTHLY;BYMONTHDAY=23;COUNT=5');
  });

  test('frequencies, endTypes and defaultFrequency limit the options', async ({ page }) => {
    await open(page);
    const s = scope(page, 're-limited');
    await expect(summary(page, 're-limited')).toHaveText('Every day');
    await s.getByRole('combobox', { name: 'Repeat' }).click();
    await expect(page.getByRole('option')).toHaveText(['Never', 'Daily', 'Weekly']);
    await page.keyboard.press('Escape');
    await choose(page, s.getByRole('combobox', { name: 'End' }), 'After');
    expect((await values(page, 're-limited')).at(-1)).toBe('FREQ=DAILY;COUNT=10');
    await s.getByLabel('occurrences').fill('4');
    await expect(summary(page, 're-limited')).toHaveText('Every day, 4 times');
    await s.getByRole('combobox', { name: 'End' }).click();
    await expect(page.getByRole('option')).toHaveText(['Never', 'After']);
  });

  test('monthly day or ordinal weekday; the until DatePicker honors min and max', async ({ page }) => {
    await open(page);
    const s = scope(page, 're-monthly');
    await expect(summary(page, 're-monthly')).toHaveText('Every month on day 23, until Jan 1, 2027');
    await s.getByRole('radio', { name: 'On the' }).check();
    // 2026-11-23 is the fourth Monday.
    expect((await values(page, 're-monthly')).at(-1)).toBe('FREQ=MONTHLY;BYDAY=4MO;UNTIL=20270101');
    await choose(page, s.getByRole('combobox', { name: 'Week of the month' }), 'last');
    await choose(page, s.getByRole('combobox', { name: 'Day of the week' }), 'Friday');
    expect((await values(page, 're-monthly')).at(-1)).toBe('FREQ=MONTHLY;BYDAY=-1FR;UNTIL=20270101');
    await expect(summary(page, 're-monthly')).toHaveText('Every month on the last Friday, until Jan 1, 2027');
    const until = s.locator('.salmon-recurrence-editor__until');
    await expect(until).toBeVisible();
    await until.getByRole('button', { name: /calendar|choose/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The popup opens on the until month; days before min (2026-11-23) are disabled.
    await expect(dialog.getByRole('gridcell', { name: 'Friday, January 1, 2027' })).toHaveAttribute('aria-selected', 'true');
    await dialog.getByRole('button', { name: /previous/i }).first().click();
    await dialog.getByRole('button', { name: /previous/i }).first().click();
    await expect(dialog.getByRole('gridcell', { name: 'Sunday, November 22, 2026' })).toHaveAttribute('aria-disabled', 'true');
    await expect(dialog.getByRole('gridcell', { name: 'Monday, November 23, 2026' })).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
  });

  test('yearly with an ordinal weekday of a month and a month select', async ({ page }) => {
    await open(page);
    const s = scope(page, 're-yearly');
    await expect(summary(page, 're-yearly')).toHaveText('Every year on the fourth Thursday of November');
    await choose(page, s.getByRole('combobox', { name: 'Month', exact: true }), 'October');
    expect((await values(page, 're-yearly')).at(-1)).toBe('FREQ=YEARLY;BYDAY=4TH;BYMONTH=10');
    await s.getByRole('radio', { name: 'On day' }).check();
    expect((await values(page, 're-yearly')).at(-1)).toBe('FREQ=YEARLY;BYMONTHDAY=26;BYMONTH=10');
  });
});

test.describe('RecurrenceEditor platform', () => {
  test('locale names and localeText', async ({ page }) => {
    await open(page);
    const s = scope(page, 're-de');
    await expect(s.getByText('Wiederholen')).toBeVisible();
    await expect(summary(page, 're-de')).toHaveText('Jede Woche am Montag');
    // de-DE weeks start on Monday.
    await expect(s.locator('.salmon-recurrence-editor__weekdays [data-salmon-toggle-item]').first()).toHaveAccessibleName('Montag');
  });

  test('dir, className and style pass through', async ({ page }) => {
    await open(page);
    const root = scope(page, 're-rtl').locator('.salmon-recurrence-editor');
    await expect(root).toHaveAttribute('dir', 'rtl');
    await expect(root).toHaveClass(/custom-class/);
    await expect(root).toHaveCSS('max-inline-size', '480px');
  });

  test('labelled group, keyboard reachable, axe-core clean', async ({ page }) => {
    await open(page);
    const s = scope(page, 're-basic');
    await expect(s.getByRole('group', { name: 'Recurrence' })).toBeVisible();
    await scope(page, 're-controlled').getByRole('button', { name: 'Monday' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(scope(page, 're-controlled').getByRole('button', { name: 'Tuesday' })).toBeFocused();
    await expect(scope(page, 're-disabled').getByRole('combobox', { name: 'Repeat' })).toBeDisabled();
    await expectClean(page, 'recurrence editor');
  });

  test('server HTML hydrates without warnings', async ({ page }) => {
    const problems = collectProblems(page);
    await open(page, 'ssr=1');
    await page.waitForFunction(() => window.__hydrated === true);
    await expect(summary(page, 'ssr-editor')).toHaveText('Every week on Monday and Wednesday, until Dec 31, 2026');
    expect(problems).toEqual([]);
  });
});
