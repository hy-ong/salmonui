import { expect, test } from '@playwright/test';
import { collectProblems } from '../browser/helpers.ts';
const NEXT_URL = `http://localhost:${Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730) + 50}/`;

// Notifications as React Server Components in the Next App Router
// (examples/next-app/app/notifications/page.tsx
// has no "use client" boundary): complete server HTML, and hydration reports nothing.
test('Notifications server components render in the server HTML and hydrate cleanly', async ({ page }) => {
  const url = `${NEXT_URL}notifications`;
  const html = await (await page.request.get(url)).text();
  expect(html).toContain('class="salmon-message"');
  expect(html).toMatch(/class="salmon-badge[^"]*"[^>]*>New</);
  expect(html).toContain('99+');
  expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="42"/);
  expect(html).toMatch(/role="meter"[^>]*data-tone="danger"/);
  expect(html).toMatch(/role="status"[^>]*>.*Loading orders/);
  expect([...html.matchAll(/class="salmon-skeleton__line"/g)].length).toBe(3);

  const problems = collectProblems(page);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('progressbar', { name: 'Upload' })).toHaveAttribute('aria-valuetext', '42%');
  const overlay = await page.evaluate(() => {
    const shadow = document.querySelector('nextjs-portal')?.shadowRoot;
    return shadow?.querySelectorAll('[data-next-badge][data-error="true"]').length ?? 0;
  });
  expect(overlay).toBe(0);
  expect(problems).toEqual([]);
});
