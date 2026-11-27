import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Checkbox and CheckboxGroup in the browser.
// Page: examples/vite-spa/inputs.html?only=checkbox (examples/vite-spa/src/inputs-checkbox.tsx).

async function open(page: Page, query = '?only=checkbox'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#page');
}
const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const clear = (page: Page) => page.evaluate(() => void (window.__inputs = []));
const formData = (page: Page, id: string) => page.evaluate((k) => window.__inputForms?.[k] ?? null, id);

test.describe('Checkbox', () => {
  test('click and Space toggle the native checkbox and report the source', async ({ page }) => {
    await open(page, '?only=checkbox');
    const box = page.getByRole('checkbox', { name: 'I accept the terms' });
    await page.getByText('I accept the terms').click();
    await expect(box).toBeChecked();
    expect((await events(page, 'chk')).at(-1)).toEqual({ kind: 'chk', checked: true, source: 'pointer', reason: 'toggle' });
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).not.toBeChecked();
    expect((await events(page, 'chk')).at(-1)).toEqual({ kind: 'chk', checked: false, source: 'keyboard', reason: 'toggle' });
    // Hit area: the 16px box answers clicks within its 26px ::after.
    const r = (await box.boundingBox())!;
    await page.mouse.click(r.x - 3, r.y + r.height / 2);
    await expect(box).toBeChecked();
  });

  test('indeterminate is the DOM property after mount and follows the controlled state', async ({ page }) => {
    await open(page, '?only=checkbox');
    expect(await page.locator('#chk-mixed').evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
    const all = page.locator('#chk-all');
    expect(await all.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
    await expect(all).toHaveAttribute('aria-checked', 'mixed');
    await page.getByRole('checkbox', { name: 'Basil' }).check();
    await expect(all).toBeChecked();
    expect(await all.evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(false);
    await expect(all).not.toHaveAttribute('aria-checked', /.*/);
    await all.click();
    await expect(page.getByRole('checkbox', { name: 'Anchovy' })).not.toBeChecked();
    expect((await events(page, 'chk-group')).at(-1)).toMatchObject({ value: ['a', 'b'], item: 'b', reason: 'toggle' });
  });

  test('names and values submit; the group value is an array', async ({ page }) => {
    await open(page, '?only=checkbox');
    await page.getByRole('checkbox', { name: 'I accept the terms' }).check();
    await page.getByRole('checkbox', { name: 'Pear' }).check();
    expect((await events(page, 'fruit')).at(-1)).toEqual({ kind: 'fruit', value: ['apple', 'pear'], item: 'pear', reason: 'toggle', source: 'pointer' });
    // labelPlacement="start": the text is before the box.
    const label = (await page.getByText('Newsletter').boundingBox())!;
    const news = (await page.locator('#chk-start').boundingBox())!;
    expect(label.x).toBeLessThan(news.x);
    await page.locator('#chk-submit').click();
    expect(await formData(page, 'chk-form')).toEqual([
      ['terms', 'yes'],
      ['news', 'on'],
      ['fruit', 'apple'],
      ['fruit', 'pear'],
    ]);
  });

  test('a required group shows its error once empty; the fieldset is named by its legend', async ({ page }) => {
    await open(page, '?only=checkbox');
    const group = page.getByRole('group', { name: 'Fruit' });
    await expect(group).toBeVisible();
    await page.getByRole('checkbox', { name: 'Apple' }).uncheck();
    await expect(group.locator('.salmon-field-error')).toHaveText('This field is required.');
    await expect(page.getByRole('checkbox', { name: 'Plum' })).toBeDisabled();
  });

  test('form reset restores defaultChecked and the group defaultValue', async ({ page }) => {
    await open(page, '?only=checkbox');
    await page.getByRole('checkbox', { name: 'I accept the terms' }).check();
    await page.getByRole('checkbox', { name: 'Newsletter' }).uncheck();
    await page.getByRole('checkbox', { name: 'Pear' }).check();
    await clear(page);
    await page.locator('#chk-reset').click();
    await expect(page.getByRole('checkbox', { name: 'I accept the terms' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Newsletter' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Apple' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Pear' })).not.toBeChecked();
    expect(await events(page, 'chk')).toEqual([{ kind: 'chk', checked: false, source: 'api', reason: 'reset' }]);
  });
});

test('server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate&only=checkbox');
  expect(await page.locator('#chk-mixed').evaluate((el: HTMLInputElement) => el.indeterminate)).toBe(true);
  await page.getByRole('checkbox', { name: 'Pear' }).check();
  expect((await events(page, 'fruit')).at(-1)).toMatchObject({ value: ['apple', 'pear'] });
  expect(problems).toEqual([]);
});
