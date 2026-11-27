import { expect, test } from '@playwright/test';
import { collectProblems, SSR_URL } from './helpers.ts';
import { assertCalendarSsr } from './ssr-calendars-check.ts';

// Calendar pickers in the Vite SSR example (`?pickers`): plain values render on the server, an instant without
// `timeZone` defers, no popup or preset runs on the server, `defaultOpen`
// opens after hydration, and hydration in StrictMode development mode reports
// no warning or recoverable error.

test('calendar pickers server render and hydrate without warnings', async ({ page }) => {
  const problems = collectProblems(page);
  const url = `${SSR_URL}?pickers`;
  const html = await (await page.request.get(url)).text();
  expect(html).toContain('class="salmon-date-picker salmon-picker"');
  expect(html).toContain('class="salmon-date-range-picker salmon-picker"');
  expect(html).toContain('class="salmon-time-picker salmon-picker"');
  expect(html).not.toContain('salmon-picker__popup');
  expect(html).toMatch(/name="arrival"[^>]*value="2026-11-23"/);

  await page.goto(url);
  await page.waitForFunction(() => window.__hydrated === true);
  await page.waitForTimeout(100);
  // defaultOpen takes effect after hydration.
  await expect(page.locator('.salmon-picker__popup')).toHaveCount(1);
  // The deferred instant fills in on the client (host zone).
  const instant = page.locator('.salmon-picker').filter({ hasText: 'Instant' }).locator('[role="spinbutton"]').first();
  await expect(instant).toHaveAttribute('aria-valuenow', /\d+/);
  // Opening the range picker evaluates its preset function on the client.
  await page.locator('.salmon-date-range-picker .salmon-picker__trigger').click();
  await expect(page.getByRole('option', { name: 'Today' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('calendars server render and hydrate without warnings in the Vite SSR example', async ({ page }) => {
  await assertCalendarSsr(page, `${SSR_URL}?pickers`, async () => {
    await page.waitForFunction(() => window.__hydrated === true);
  });
});
