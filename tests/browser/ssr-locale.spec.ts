import { expect, test } from '@playwright/test';
import { collectProblems, SSR_URL } from './helpers.ts';

// LocaleProvider in the Vite SSR example (`?locale`):
// the server markup is already Traditional Chinese (no English flash), and
// hydration in StrictMode development mode reports no warning or
// recoverable error.

const HAN = /\p{Script=Han}/u;

test('the zh-TW page hydrates without warnings in the Vite SSR example', async ({ page }) => {
  const problems = collectProblems(page);
  const url = `${SSR_URL}?locale`;
  await page.goto(url);
  await page.waitForFunction(() => window.__hydrated === true);
  await page.waitForFunction(() => document.querySelector('[data-salmon-pending]') === null);
  await page.waitForTimeout(250);
  await expect(page.getByRole('grid', { name: '訂單' })).toBeVisible();
  // A client interaction after hydration: the validation message comes from the pack.
  await page.getByRole('button', { name: '建立訂單' }).click();
  await expect(page.getByText('此欄位為必填。')).toHaveCount(2);
  expect(problems).toEqual([]);
});

test('the server HTML of the zh-TW page carries the pack strings and zh-TW formats', async ({ page }) => {
  const html = await (await page.request.get(`${SSR_URL}?locale`)).text();
  expect(html).toContain('role="grid"');
  // The grid pager and the date picker buttons, rendered on the server.
  expect(html).toContain('第 1 頁，共 4 頁');
  expect(html).not.toMatch(/(Rows|Items) per page/);
  const pickerNames = [...html.matchAll(/class="salmon-picker__(?:trigger|clear)[^"]*"[^>]*aria-label="([^"]*)"|aria-label="([^"]*)"[^>]*class="salmon-picker__(?:trigger|clear)/g)].map((m) => m[1] ?? m[2] ?? '');
  expect(pickerNames.length).toBeGreaterThan(0);
  for (const name of pickerNames) expect(name).toMatch(HAN);
  // `locale` from the provider: zh-TW dates in the grid cells.
  expect(html).toMatch(/2026年11月\d+日/);
});
