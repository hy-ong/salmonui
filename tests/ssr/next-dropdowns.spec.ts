import { expect, test } from '@playwright/test';
import { assertDropdownSsr } from '../browser/ssr-dropdowns-check.ts';
const NEXT_URL = `http://localhost:${Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730) + 50}/`;

// Dropdowns in the Next App Router (examples/next-app/app/dropdowns/page.tsx): the same server HTML contract as the Vite SSR example, and
// hydration reports nothing (no console problem, no Next error badge).
test('dropdowns server render and hydrate without warnings in the Next App Router', async ({ page }) => {
  await assertDropdownSsr(page, `${NEXT_URL}dropdowns`, async () => {
    await page.waitForLoadState('networkidle');
  });
  const overlay = await page.evaluate(() => document.querySelector('nextjs-portal')?.shadowRoot?.querySelectorAll('[data-next-badge][data-error="true"]').length ?? 0);
  expect(overlay).toBe(0);
});
