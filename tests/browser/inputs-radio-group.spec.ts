import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// RadioGroup and Radio in the browser.
// Page: examples/vite-spa/inputs.html?only=radio (examples/vite-spa/src/inputs-radio-group.tsx).

async function open(page: Page, query = '?only=radio'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#page');
}
const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const formData = (page: Page, id: string) => page.evaluate((k) => window.__inputForms?.[k] ?? null, id);

test.describe('RadioGroup', () => {
  test('one Tab stop; arrow keys move and select, skipping disabled radios', async ({ page }) => {
    await open(page, '?only=radio');
    const group = page.getByRole('radiogroup', { name: 'Plan' });
    await group.getByText('Free').click();
    expect((await events(page, 'radio')).at(-1)).toEqual({ kind: 'radio', value: 'free', source: 'pointer', reason: 'select' });
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: 'Pro' })).toBeChecked();
    expect((await events(page, 'radio')).at(-1)).toEqual({ kind: 'radio', value: 'pro', source: 'keyboard', reason: 'select' });
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: 'Max' })).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'Standard' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('radio', { name: 'Max' })).toBeFocused();
  });

  test('controlled value, start labels and standalone radios grouped by name', async ({ page }) => {
    await open(page, '?only=radio');
    await page.getByRole('radio', { name: 'M', exact: true }).click();
    await expect(page.locator('#rad-controlled-out')).toHaveText('m');
    const label = (await page.getByText('M', { exact: true }).boundingBox())!;
    const input = (await page.getByRole('radio', { name: 'M', exact: true }).boundingBox())!;
    expect(label.x).toBeLessThan(input.x);
    await page.getByRole('radio', { name: 'Solo B' }).check();
    await expect(page.getByRole('radio', { name: 'Solo A' })).not.toBeChecked();
  });

  test('required errors on submit, read-only ignores changes, names submit', async ({ page }) => {
    await open(page, '?only=radio');
    await page.locator('#rad-submit').click();
    const group = page.getByRole('radiogroup', { name: 'Plan' });
    await expect(group).toHaveAttribute('aria-invalid', 'true');
    await expect(group.locator('.salmon-field-error')).toHaveText('This field is required.');
    await expect(page.getByRole('radio', { name: 'Team' })).toBeDisabled();
    await page.getByRole('radio', { name: 'Y', exact: true }).click({ force: true });
    await expect(page.getByRole('radio', { name: 'X', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Pro' }).check();
    await expect(group).not.toHaveAttribute('aria-invalid', /.*/);
    await page.locator('#rad-submit').click();
    expect(await formData(page, 'rad-form')).toEqual([
      ['plan', 'pro'],
      ['ship', 'std'],
      ['locked', 'x'],
    ]);
  });

  test('form reset restores the default selection', async ({ page }) => {
    await open(page, '?only=radio');
    await page.getByRole('radio', { name: 'Pro' }).check();
    await page.getByRole('radio', { name: 'Express' }).check();
    await page.locator('#rad-reset').click();
    await expect(page.getByRole('radio', { name: 'Pro' })).not.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Standard' })).toBeChecked();
    expect((await events(page, 'radio')).at(-1)).toMatchObject({ reason: 'reset', source: 'api' });
  });
});

test('server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate&only=radio');
  await page.getByRole('radio', { name: 'Pro' }).check();
  expect((await events(page, 'radio')).at(-1)).toMatchObject({ value: 'pro' });
  expect(problems).toEqual([]);
});
