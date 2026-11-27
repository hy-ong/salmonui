import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// InlineEdit composed with the Salmon field components through
// `children` (page: examples/vite-spa/src/inline-edit-fields.tsx). Each field
// runs in both modes: a popup of the field must not end the edit, Escape in a
// popup closes only the popup, and the saved value is the field's typed value.

interface Log {
  saves: Record<string, unknown>;
  cancels: string[];
}

const log = (page: Page): Promise<Log> => page.evaluate(() => (window as unknown as { __fields: Log }).__fields);
const row = (page: Page, field: string): Locator => page.locator(`[data-field="${field}"]`);
const previewOf = (page: Page, field: string): Locator => row(page, field).locator('.salmon-inline-edit-preview');
const editor = (page: Page): Locator => page.locator('.salmon-inline-edit-editor');
const saveButton = (page: Page): Locator => editor(page).getByRole('button', { name: 'Save', exact: true });

async function start(page: Page, field: string): Promise<void> {
  await previewOf(page, field).click();
  await expect(editor(page)).toBeVisible();
}

async function saved(page: Page, field: string, value: unknown): Promise<void> {
  await expect.poll(async () => (await log(page)).saves[field]).toEqual(value);
  await expect(editor(page)).toHaveCount(0);
}

for (const mode of ['popover', 'inline'] as const) {
  test.describe(`InlineEdit with field components (${mode})`, () => {
    let problems: ReturnType<typeof collectProblems>;
    test.beforeEach(async ({ page }) => {
      problems = collectProblems(page);
      await page.goto(`${DEV_URL}inline-edit-fields.html?mode=${mode}`);
    });
    test.afterEach(() => {
      expect(problems).toEqual([]);
    });

    test('NumberField: typed number saves on Enter and on blur', async ({ page }) => {
      await start(page, 'number');
      const input = editor(page).locator('input').first();
      await expect(input).toBeFocused();
      await input.fill('42');
      await page.keyboard.press('Enter');
      await saved(page, 'number', 42);
      await expect(previewOf(page, 'number')).toHaveText(/42/);
      await expect(previewOf(page, 'number')).toBeFocused();
      await start(page, 'number');
      await editor(page).locator('input').first().fill('7');
      await page.locator('#after').click();
      await saved(page, 'number', 7);
    });

    test('NumberField: the value clamped on blur is the value saved', async ({ page }) => {
      await start(page, 'number');
      await editor(page).locator('input').first().fill('500');
      await page.locator('#after').click();
      await saved(page, 'number', 100);
    });

    test('NumberField: Enter does not clamp, so validation.range rejects an out-of-range draft', async ({ page }) => {
      await start(page, 'number');
      await editor(page).locator('input').first().fill('500');
      await page.keyboard.press('Enter');
      await expect(editor(page).locator('.salmon-inline-edit-error')).toBeVisible();
      expect((await log(page)).saves['number']).toBeUndefined();
    });

    test('NumberField: Escape cancels the edit', async ({ page }) => {
      await start(page, 'number');
      await editor(page).locator('input').first().fill('99');
      await page.keyboard.press('Escape');
      await expect(editor(page)).toHaveCount(0);
      expect((await log(page)).cancels).toEqual(['number']);
      await expect(previewOf(page, 'number')).toHaveText(/3/);
    });

    test('MaskedField: masked entry saves on Enter', async ({ page }) => {
      await start(page, 'masked');
      const input = editor(page).locator('input').first();
      await expect(input).toBeFocused();
      await page.keyboard.type('123456');
      await expect(input).toHaveValue('123-456');
      await page.keyboard.press('Enter');
      await expect.poll(async () => String((await log(page)).saves['masked'])).toMatch(/^123-?456$/);
      await expect(editor(page)).toHaveCount(0);
    });

    test('ColorPicker: the popup keeps the edit; Escape closes only the popup', async ({ page }) => {
      await start(page, 'color');
      await editor(page).getByRole('button', { name: /color/i }).first().click();
      const popup = page.locator('.salmon-color-picker-popup');
      await expect(popup).toBeVisible();
      // A press on the panel's padding moves focus nowhere; the edit stays.
      await popup.click({ position: { x: 2, y: 2 } });
      await expect(popup).toBeVisible();
      await expect(editor(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(editor(page)).toBeVisible();
      expect((await log(page)).cancels).toEqual([]);
      await editor(page).getByRole('button', { name: /color/i }).first().click();
      await expect(popup).toBeVisible();
      const hex = popup.getByRole('textbox').first();
      await hex.fill('#ff0000');
      await hex.press('Enter');
      await expect(popup).toBeVisible();
      // Escape with focus inside the portaled popup closes the popup, not the edit.
      await hex.focus();
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(editor(page)).toBeVisible();
      expect((await log(page)).cancels).toEqual([]);
      // The picker's default confirm mode: Escape discarded the pick, Apply keeps it.
      await editor(page).getByRole('button', { name: /color/i }).first().click();
      await expect(popup).toBeVisible();
      await popup.getByRole('textbox').first().fill('#ff0000');
      await popup.getByRole('textbox').first().press('Enter');
      await popup.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(popup).toHaveCount(0);
      await expect(editor(page)).toBeVisible();
      await saveButton(page).click();
      await expect.poll(async () => String((await log(page)).saves['color']).toLowerCase()).toContain('ff0000');
      await expect(editor(page)).toHaveCount(0);
    });

    test('Slider: arrow keys change the draft; Save commits it', async ({ page }) => {
      await start(page, 'slider');
      const thumb = editor(page).getByRole('slider');
      await thumb.focus();
      await page.keyboard.press('ArrowRight');
      await expect(thumb).toHaveValue('41');
      await saveButton(page).click();
      await saved(page, 'slider', 41);
    });

    test('DatePicker: choosing a day in the popup keeps the edit; Save commits it', async ({ page }) => {
      await start(page, 'date');
      await editor(page).getByRole('button', { name: /calendar|date/i }).first().click();
      const popup = page.locator('.salmon-picker__popup');
      await expect(popup).toBeVisible();
      await popup.getByRole('gridcell', { name: /March 20/ }).first().click();
      await expect(editor(page)).toBeVisible();
      await expect(popup).toHaveCount(0);
      await saveButton(page).click();
      await saved(page, 'date', '2026-03-20');
    });

    test('DatePicker: Escape in the popup closes only the popup', async ({ page }) => {
      await start(page, 'date');
      await editor(page).getByRole('button', { name: /calendar|date/i }).first().click();
      const popup = page.locator('.salmon-picker__popup');
      await expect(popup).toBeVisible();
      await popup.getByRole('gridcell', { name: /March 15/ }).first().focus();
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(editor(page)).toBeVisible();
      expect((await log(page)).cancels).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(editor(page)).toHaveCount(0);
      expect((await log(page)).cancels).toEqual(['date']);
    });

    test('DatePicker with time: the popup keeps the edit', async ({ page }) => {
      await start(page, 'datetime');
      await editor(page).getByRole('button', { name: /calendar|date/i }).first().click();
      const popup = page.locator('.salmon-picker__popup');
      await expect(popup).toBeVisible();
      await popup.getByRole('gridcell', { name: /March 20/ }).first().click();
      await expect(editor(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await saveButton(page).click();
      await expect.poll(async () => String((await log(page)).saves['datetime'])).toContain('2026-03-20');
    });

    test('TimePicker: choosing a time in the popup keeps the edit; Save commits it', async ({ page }) => {
      await start(page, 'time');
      await editor(page).getByRole('button', { name: /time/i }).first().click();
      const popup = page.locator('.salmon-picker__popup');
      await expect(popup).toBeVisible();
      await popup.getByRole('option', { name: /10:00/ }).first().click();
      await expect(editor(page)).toBeVisible();
      await expect(popup).toHaveCount(0);
      await saveButton(page).click();
      await expect.poll(async () => String((await log(page)).saves['time'])).toContain('10:00');
    });

    test('DateRangePicker: picking both ends keeps the edit; Save commits the range', async ({ page }) => {
      await start(page, 'range');
      await editor(page).getByRole('button', { name: /calendar|date/i }).first().click();
      const popup = page.locator('.salmon-picker__popup');
      await expect(popup).toBeVisible();
      await popup.getByRole('gridcell', { name: /March 16/ }).first().click();
      await expect(editor(page)).toBeVisible();
      await popup.getByRole('gridcell', { name: /March 18/ }).first().click();
      await expect(editor(page)).toBeVisible();
      await popup.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(popup).toHaveCount(0);
      await expect(editor(page)).toBeVisible();
      await saveButton(page).click();
      await saved(page, 'range', { start: '2026-03-16', end: '2026-03-18' });
    });

    test('Select: an option keeps the edit; Escape closes only the list', async ({ page }) => {
      await start(page, 'select');
      const trigger = editor(page).getByRole('combobox');
      await trigger.click();
      await expect(page.getByRole('option', { name: 'Banana' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('option', { name: 'Banana' })).toHaveCount(0);
      await expect(editor(page)).toBeVisible();
      expect((await log(page)).cancels).toEqual([]);
      await trigger.click();
      await page.getByRole('option', { name: 'Banana' }).click();
      await expect(editor(page)).toBeVisible();
      await saveButton(page).click();
      await saved(page, 'select', 'Banana');
    });

    test('Select multiple: options toggle without ending the edit', async ({ page }) => {
      await start(page, 'multi');
      await editor(page).getByRole('combobox').click();
      await page.getByRole('option', { name: 'Cherry' }).click();
      await expect(editor(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await saveButton(page).click();
      await saved(page, 'multi', ['Apple', 'Cherry']);
    });

    test('Combobox: typing and Enter choose an option without saving; Save commits it', async ({ page }) => {
      await start(page, 'combobox');
      const input = editor(page).getByRole('combobox');
      await input.fill('Che');
      await expect(page.getByRole('option')).toHaveText(['Cherry']);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue('Cherry');
      await expect(editor(page)).toBeVisible();
      await saveButton(page).click();
      await saved(page, 'combobox', 'Cherry');
    });
  });
}
