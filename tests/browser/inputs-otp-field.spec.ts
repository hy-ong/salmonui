import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// OtpField in the browser.
// Page: examples/vite-spa/inputs.html?only=otp (examples/vite-spa/src/inputs-otp-field.tsx).

async function open(page: Page, query = '?only=otp'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#page');
}
const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const formData = (page: Page, id: string) => page.evaluate((k) => window.__inputForms?.[k] ?? null, id);

test.describe('OtpField', () => {
  test('typing fills cells, drops rejected characters and fires onComplete once full', async ({ page }) => {
    await open(page, '?only=otp');
    const input = page.getByRole('textbox', { name: 'Verification code' });
    await input.focus();
    await page.keyboard.type('1a2b3');
    await expect(input).toHaveValue('123');
    await expect(page.locator('#otp .salmon-otp-cell[data-filled]').first()).toHaveText('1');
    await page.keyboard.type('456');
    await expect(input).toHaveValue('123456');
    expect((await events(page, 'otp')).map((e) => e['value'])).toEqual(['1', '12', '123', '1234', '12345', '123456']);
    expect(await events(page, 'otp-complete')).toEqual([{ kind: 'otp-complete', value: '123456' }]);
    const key = page.getByRole('textbox', { name: 'Key' });
    await key.focus();
    await page.keyboard.press('End');
    await page.keyboard.type('c-');
    await expect(key).toHaveValue('ABC');
  });

  test('a pasted or autofilled code fills every cell', async ({ page }) => {
    await open(page, '?only=otp');
    const input = page.getByRole('textbox', { name: 'Verification code' });
    await input.fill('12');
    await input.evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text/plain', '987 654');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(input).toHaveValue('987654');
    expect((await events(page, 'otp')).at(-1)).toEqual({ kind: 'otp', value: '987654', reason: 'paste' });
    expect((await events(page, 'otp-complete')).at(-1)).toEqual({ kind: 'otp-complete', value: '987654' });
    await input.fill('');
    await input.fill('246813');
    expect((await events(page, 'otp-complete')).at(-1)).toEqual({ kind: 'otp-complete', value: '246813' });
    await expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  });

  test('arrow keys move the drawn caret; a click on a cell selects its character', async ({ page }) => {
    await open(page, '?only=otp');
    const input = page.getByRole('textbox', { name: 'Verification code' });
    await input.fill('123456');
    await input.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const cells = page.locator('#otp .salmon-otp-field').first().locator('.salmon-otp-cell');
    await expect(cells.nth(4)).toHaveAttribute('data-active', '');
    await expect(cells.nth(4)).toHaveCSS('outline-style', 'solid');
    // The transparent input covers the cells: click at the second cell's position.
    const cell = (await cells.nth(1).boundingBox())!;
    await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2);
    expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([1, 2]);
    await page.keyboard.type('9');
    await expect(input).toHaveValue('193456');
  });

  test('masked cells, placeholders, separators, submission, reset', async ({ page }) => {
    await open(page, '?only=otp');
    const pin = page.getByLabel('PIN');
    await expect(pin).toHaveAttribute('type', 'password');
    await pin.fill('42');
    const pinCells = page.locator('#otp .salmon-otp-field').nth(2).locator('.salmon-otp-cell');
    await expect(pinCells.nth(0)).toHaveText('•');
    await expect(pinCells.nth(2)).toHaveText('0');
    // Placeholder cells use the placeholder color, not the secondary text color.
    const color = (cell: number) => pinCells.nth(cell).evaluate((el) => getComputedStyle(el).color);
    const placeholderColor = await page.locator('#otp').evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--salmon-text-placeholder)';
      el.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    });
    expect(await color(2)).toBe(placeholderColor);
    expect(await color(0)).not.toBe(placeholderColor);
    await expect(page.locator('#otp .salmon-otp-separator')).toHaveCount(1);
    await page.getByRole('textbox', { name: 'Verification code' }).fill('111222');
    await pin.fill('4242');
    await page.getByRole('textbox', { name: 'Key' }).fill('cd34');
    await page.locator('#otp-submit').click();
    expect(await formData(page, 'otp-form')).toEqual([
      ['code', '111222'],
      ['key', 'CD34'],
      ['pin', '4242'],
    ]);
    await page.locator('#otp-reset').click();
    await expect(page.getByRole('textbox', { name: 'Verification code' })).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Key' })).toHaveValue('AB');
  });

  test('autoFocus focuses the input; a partial code shows the incomplete error after blur', async ({ page }) => {
    await open(page, '?only=otp&otp-autofocus');
    await expect(page.getByRole('textbox', { name: 'Auto focus target' })).toBeFocused();
    const input = page.getByRole('textbox', { name: 'Verification code' });
    await input.fill('12');
    await input.blur();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#otp .salmon-field-error').first()).toHaveText('Enter all 6 characters');
  });
});

test('server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate&only=otp');
  await page.getByRole('textbox', { name: 'Verification code' }).fill('123456');
  await expect(page.locator('#otp .salmon-otp-cell').nth(5)).toHaveText('6');
  expect(problems).toEqual([]);
});
