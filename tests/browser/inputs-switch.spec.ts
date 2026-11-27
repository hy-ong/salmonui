import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Switch in the browser.
// Page: examples/vite-spa/inputs.html?only=switch (examples/vite-spa/src/inputs-switch.tsx).

async function open(page: Page, query = '?only=switch'): Promise<void> {
  await page.goto(`${DEV_URL}inputs.html${query}`);
  await page.waitForFunction(() => window.__inputsReady === true);
  await page.waitForSelector('#page');
}
const events = (page: Page, kind?: string) => page.evaluate((k) => (window.__inputs ?? []).filter((e) => !k || e['kind'] === k), kind) as Promise<Record<string, unknown>[]>;
const formData = (page: Page, id: string) => page.evaluate((k) => window.__inputForms?.[k] ?? null, id);

test.describe('Switch', () => {
  test('role=switch toggles by click and Space with the source', async ({ page }) => {
    await open(page, '?only=switch');
    const wifi = page.getByRole('switch', { name: 'Wi-Fi' });
    await wifi.click();
    await expect(wifi).toBeChecked();
    expect((await events(page, 'switch')).at(-1)).toEqual({ kind: 'switch', checked: true, source: 'pointer', reason: 'toggle' });
    await page.keyboard.press('Space');
    await expect(wifi).not.toBeChecked();
    expect((await events(page, 'switch')).at(-1)).toEqual({ kind: 'switch', checked: false, source: 'keyboard', reason: 'toggle' });
    await expect(page.getByRole('switch', { name: 'Airplane mode' })).toBeDisabled();
  });

  test('names submit, start labels, vetoed controlled changes and reset', async ({ page }) => {
    await open(page, '?only=switch');
    await page.getByRole('switch', { name: 'Wi-Fi' }).click();
    await page.locator('#swt-submit').click();
    expect(await formData(page, 'swt-form')).toEqual([
      ['wifi', 'on'],
      ['bt', 'on'],
    ]);
    const label = (await page.getByText('Bluetooth').boundingBox())!;
    const input = (await page.locator('#swt-start').boundingBox())!;
    expect(label.x).toBeLessThan(input.x);
    await page.getByRole('switch', { name: 'Vetoed on' }).click();
    await expect(page.getByRole('switch', { name: 'Vetoed on' })).not.toBeChecked();
    await page.getByRole('switch', { name: 'Bluetooth' }).click();
    await page.locator('#swt-reset').click();
    await expect(page.getByRole('switch', { name: 'Wi-Fi' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'Bluetooth' })).toBeChecked();
  });
});

test('server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
  const problems = collectProblems(page);
  await open(page, '?hydrate&only=switch');
  await page.getByRole('switch', { name: 'Wi-Fi' }).click();
  await expect(page.getByRole('switch', { name: 'Wi-Fi' })).toBeChecked();
  expect(problems).toEqual([]);
});
