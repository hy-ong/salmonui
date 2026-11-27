import { expect, test } from '@playwright/test';
import { assertCalendarSsr } from '../browser/ssr-calendars-check.ts';
const NEXT_URL = `http://localhost:${Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730) + 50}/`;

// Calendars in the Next App Router (examples/next-app/app/calendars/page.tsx): the same server HTML contract as the Vite SSR example, and
// hydration reports nothing (no console problem, no Next error badge).
test('calendars server render and hydrate without warnings in the Next App Router', async ({ page }) => {
  await assertCalendarSsr(page, `${NEXT_URL}calendars`, async () => {
    await page.waitForLoadState('networkidle');
  });
  const overlay = await page.evaluate(() => document.querySelector('nextjs-portal')?.shadowRoot?.querySelectorAll('[data-next-badge][data-error="true"]').length ?? 0);
  expect(overlay).toBe(0);
});
