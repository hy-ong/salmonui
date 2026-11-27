import { expect, test } from '@playwright/test';
import { collectProblems } from '../browser/helpers.ts';
const NEXT_URL = `http://localhost:${Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730) + 50}/`;

// LocaleProvider in the Next App Router (examples/next-app/app/locale/: a
// Server Component layout rendering the 'use client' provider wrapper with
// the zh-TW pack): the server HTML is Traditional Chinese, and hydration
// reports nothing (no console problem, no Next error badge).

test('the zh-TW page server renders and hydrates cleanly in the Next App Router', async ({ page }) => {
  const url = `${NEXT_URL}locale`;
  const html = await (await page.request.get(url)).text();
  expect(html).toContain('role="grid"');
  expect(html).toContain('每頁筆數');

  const problems = collectProblems(page);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('grid', { name: '訂單' })).toBeVisible();
  await expect(page.getByRole('button', { name: '下一頁' }).first()).toBeVisible();
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.locator('.salmon-toast').filter({ hasText: '已儲存' })).toBeVisible();
  const overlay = await page.evaluate(() => document.querySelector('nextjs-portal')?.shadowRoot?.querySelectorAll('[data-next-badge][data-error="true"]').length ?? 0);
  expect(overlay).toBe(0);
  expect(problems).toEqual([]);
});
