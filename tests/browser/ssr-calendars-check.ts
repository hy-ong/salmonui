import { expect, type Page } from '@playwright/test';
import { collectProblems } from './helpers.ts';

// The server HTML and hydration contract of the calendar SSR pages
// (examples/vite-ssr `?pickers`, examples/next-app /calendars): inline grids, segmented fields and
// picker triggers render on the server from plain values; no popup and no
// "today" is in the server HTML; the Calendar without a date is a sized busy
// frame; hydration reports nothing, then marks today and fills the frame.
export async function assertCalendarSsr(page: Page, url: string, waitHydrated: () => Promise<void>): Promise<void> {
  // Markup only: a framework's serialized props (the Next flight payload) are not rendered HTML.
  const html = (await (await page.request.get(url)).text()).replace(/<script[\s\S]*?<\/script>/g, '');
  expect(html).toMatch(/role="grid"[^>]*aria-labelledby="[^"]+"/);
  expect(html).toContain('>November 2026<');
  expect(html).toMatch(/data-day="2026-11-23"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-day="2026-11-23"/);
  expect(html).toMatch(/data-range-start="true"/);
  expect(html).toContain('class="salmon-date-picker salmon-picker"');
  expect(html).toContain('class="salmon-date-range-picker salmon-picker"');
  expect(html).toContain('class="salmon-time-picker salmon-picker"');
  expect(html).toMatch(/role="spinbutton"[^>]*aria-valuenow="2026"/);
  expect(html).toMatch(/name="arrival"[^>]*value="2026-11-23"/);
  // Never on the server: popups, "today", preset lists.
  expect(html).not.toContain('salmon-picker__popup');
  expect(html).not.toContain('aria-current="date"');
  expect(html).not.toContain('data-today');
  // The Calendar without a date: a busy frame of 42 empty cells.
  expect(html).toMatch(/class="salmon-calendar"[^>]*aria-busy="true"/);

  const problems = collectProblems(page);
  await page.goto(url);
  await waitHydrated();
  await page.waitForTimeout(200);
  // After hydration the frame shows today's month with today marked.
  await expect(page.locator('.salmon-calendar[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('[aria-current="date"]').first()).toBeAttached();
  // The hydrated pickers work.
  await page.locator('.salmon-date-range-picker .salmon-picker__trigger').click();
  await expect(page.locator('.salmon-date-range-picker__popup, .salmon-picker__popup').last()).toBeVisible();
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
}
