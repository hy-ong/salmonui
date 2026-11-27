import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// LocaleProvider with the built-in zh-TW pack
// (examples/vite-spa/src/locale-zh-tw.tsx): one provider localizes the
// strings of every family below it, its `locale` drives the Intl formats,
// `?lang=en` (no provider) keeps the built-in English, and axe reports
// nothing. Server rendering: ssr-locale.spec.ts and tests/ssr/next-locale.spec.ts.

const URL = `${DEV_URL}locale-zh-tw.html`;
const HAN = /\p{Script=Han}/u;
// axe cannot compare visible text with accessible names outside English
// content (lang="zh-TW"), so it marks the icon-only pager buttons ("…" named
// 「後幾頁」) "needs review"; their names are asserted above instead.
const REVIEWED = ['label-content-name-mismatch'];

async function open(page: Page, query = ''): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto(`${URL}${query}`);
  await page.waitForFunction(() => document.querySelector('[data-salmon-pending]') === null && document.querySelector('#orders [role="grid"], #orders[role="grid"]') !== null);
  return problems;
}

/** The accessible names (`aria-label`) of the buttons in `scope`. */
async function buttonNames(scope: Locator): Promise<string[]> {
  return scope.locator('button[aria-label]').evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? ''));
}

test.describe('LocaleProvider with the zh-TW pack', () => {
  test('Pager: the page size label, the navigation buttons and the landmark are Traditional Chinese', async ({ page }) => {
    const problems = await open(page);
    const pager = page.locator('#pager');
    await expect(pager).toContainText('每頁筆數');
    await expect(page.getByRole('navigation', { name: '分頁' }).first()).toBeVisible();
    await expect(pager.getByRole('button', { name: '下一頁', exact: true })).toBeVisible();
    await expect(pager.getByRole('button', { name: '上一頁', exact: true })).toBeVisible();
    await expect(pager).toContainText('第 1 頁，共 40 頁');
    expect(problems).toEqual([]);
  });

  test('DataGrid: the pager info and page size, the column menu and the selection checkboxes', async ({ page }) => {
    await open(page);
    const grid = page.locator('#orders');
    const pager = page.locator('.salmon-data-grid-pager').first();
    await expect(pager).toContainText('第 1 頁，共 5 頁');
    await expect(pager).toContainText('（共 45 筆）');
    await expect(pager).not.toContainText(/Page \d|per page|items/);
    // Assistive names of the grid's own buttons (pager, header menu and filter buttons).
    const names = [...(await buttonNames(pager)), ...(await buttonNames(grid.locator('[role="columnheader"]').first()))];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name, `grid button "${name}"`).toMatch(HAN);
  });

  test('DataGrid: formats follow the provider locale (zh-TW dates and TWD amounts)', async ({ page }) => {
    await open(page);
    await expect(page.locator('#orders [role="gridcell"]').filter({ hasText: /^2026年11月\d+日$/ }).first()).toBeVisible();
    await expect(page.locator('#orders [role="gridcell"]').filter({ hasText: /^\$\d/ }).first()).toBeVisible();
  });

  test('DatePicker and DateRangePicker: trigger names and the calendar are Traditional Chinese', async ({ page }) => {
    await open(page);
    const picker = page.locator('.salmon-date-picker').filter({ hasText: '下單日期' }).first();
    const names = await buttonNames(picker);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name, `date picker button "${name}"`).toMatch(HAN);
    for (const name of await buttonNames(page.locator('.salmon-date-range-picker').first())) expect(name, `range picker button "${name}"`).toMatch(HAN);
    await picker.locator('.salmon-picker__trigger').click();
    const popup = page.locator('.salmon-picker__popup');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('2026年11月');
    for (const name of await buttonNames(popup)) expect(name, `calendar button "${name}"`).toMatch(HAN);
  });

  test('Select and Combobox: the clear and toggle buttons are Traditional Chinese', async ({ page }) => {
    await open(page);
    const select = page.locator('#status').locator('xpath=ancestor-or-self::*[contains(@class, "salmon-select")][1]');
    const names = [...(await buttonNames(select)), ...(await buttonNames(page.locator('#customer').locator('xpath=ancestor::*[contains(@class, "salmon-combobox")][1]')))];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name, `dropdown button "${name}"`).toMatch(HAN);
  });

  test('Form validation: required fields report 「此欄位為必填。」', async ({ page }) => {
    await open(page);
    await page.locator('#submit').click();
    const form = page.locator('#order-form');
    await expect(form.getByText('此欄位為必填。')).toHaveCount(2);
    await expect(form).not.toContainText('This field is required.');
  });

  test('FileUpload: the drop zone and browse button are Traditional Chinese', async ({ page }) => {
    await open(page);
    const upload = page.locator('.salmon-file-upload').first();
    await expect(upload).toContainText(HAN);
    await expect(upload).not.toContainText(/Browse|Drop files/i);
  });

  test('Dialog, useConfirm and Toaster: the close, cancel and dismiss buttons are Traditional Chinese', async ({ page }) => {
    const problems = await open(page);
    await page.locator('#details').click();
    const dialog = page.getByRole('dialog', { name: '訂單詳情' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '關閉' })).toBeVisible();
    // The resize handle (lazy chunk) names its corner in Traditional Chinese.
    await expect(dialog.getByRole('button', { name: '調整大小（右下角）' })).toBeVisible();
    await expectClean(page, 'zh-TW dialog open', REVIEWED);
    await dialog.getByRole('button', { name: '關閉' }).click();
    await expect(dialog).toBeHidden();

    await page.locator('#delete').click();
    const confirm = page.getByRole('alertdialog', { name: '刪除訂單？' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole('button', { name: '取消' })).toBeVisible();
    await expect(confirm.getByRole('button', { name: '確定' })).toBeVisible();
    await confirm.getByRole('button', { name: '取消' }).click();
    await expect(page.locator('#result')).toHaveText('已取消');

    await page.locator('#toast').click();
    const toast = page.locator('.salmon-toast').filter({ hasText: '已儲存' });
    await expect(toast).toBeVisible();
    for (const name of await buttonNames(toast)) expect(name, `toast button "${name}"`).toMatch(HAN);
    expect(problems).toEqual([]);
  });

  test('Tabs and Breadcrumbs: assistive names are Traditional Chinese', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('navigation').filter({ hasText: '首頁' }).first()).toHaveAttribute('aria-label', HAN);
    await expect(page.getByRole('tablist').first()).toBeVisible();
  });

  test('without the provider (?lang=en) the same components keep the built-in English', async ({ page }) => {
    const problems = await open(page, '?lang=en');
    await expect(page.locator('#pager')).toContainText('Items per page');
    await expect(page.locator('#pager').getByRole('button', { name: 'Next page', exact: true })).toBeVisible();
    await page.locator('#submit').click();
    await expect(page.locator('#order-form').getByText('This field is required.')).toHaveCount(2);
    expect(problems).toEqual([]);
  });

  test('axe: zero violations in light and dark, at rest and after validation', async ({ page }) => {
    await open(page);
    await expectClean(page, 'zh-TW at rest', REVIEWED);
    await page.locator('#submit').click();
    await expect(page.locator('#order-form').getByText(HAN).first()).toBeVisible();
    await expectClean(page, 'zh-TW validation errors', REVIEWED);
    await open(page, '?scheme=dark');
    await expectClean(page, 'zh-TW dark', REVIEWED);
  });
});
