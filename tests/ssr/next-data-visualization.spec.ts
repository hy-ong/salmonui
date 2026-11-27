import { expect, test } from '@playwright/test';
import { collectProblems } from '../browser/helpers.ts';
const NEXT_URL = `http://localhost:${Number(process.env['SALMON_UI_PORT_BASE'] ?? 41730) + 50}/`;

// Data Visualization in the Next App Router (examples/next-app/app/data-visualization):
// the Kanban client island is complete in
// the server HTML and hydrates with nothing reported.
test('Kanban renders in the Next server HTML and hydrates cleanly', async ({ page }) => {
  const url = `${NEXT_URL}data-visualization`;
  const html = await (await page.request.get(url)).text();
  expect(html).toMatch(/role="grid"[^>]*aria-label="Sprint board"/);
  expect([...html.matchAll(/class="salmon-kanban-card"/g)].length).toBe(5);
  expect([...html.matchAll(/role="rowgroup" class="salmon-kanban-lane"/g)].length).toBe(2);
  expect(html).toMatch(/data-card="sk3"[^>]*aria-selected="true"/);
  expect(html).not.toContain('salmon-kanban-editor');

  const problems = collectProblems(page);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  const board = page.locator('#next-kanban');
  await board.locator('[data-card="sk1"]').click();
  await expect(board.locator('[data-card="sk1"]')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog.salmon-kanban-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  const overlay = await page.evaluate(() => {
    const shadow = document.querySelector('nextjs-portal')?.shadowRoot;
    return shadow?.querySelectorAll('[data-next-badge][data-error="true"]').length ?? 0;
  });
  expect(overlay).toBe(0);
  expect(problems).toEqual([]);
});

test('every visualization family renders its SVG in the Next server HTML and hydrates cleanly', async ({ page }) => {
  const url = `${NEXT_URL}data-visualization`;
  const html = await (await page.request.get(url)).text();
  // Fourteen figure and image families, plus the server-rendered polar chart from features={[polar]}.
  for (const title of ['Units', 'Polar units', 'Target', 'Price', 'Share', 'Funnel', 'Load', 'Heat', 'Tree', 'Flow', 'Map']) expect(html, title).toMatch(new RegExp(`<figcaption[^>]*>${title}</figcaption>`));
  expect(html).toMatch(/data-axis="polar"/);
  expect(html).toMatch(/viewBox="0 0 600 300"/);
  expect([...html.matchAll(/role="img"/g)].length).toBeGreaterThanOrEqual(3);
  expect([...html.matchAll(/role="slider"/g)].length).toBeGreaterThanOrEqual(3);

  const problems = collectProblems(page);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  const gallery = page.locator('#next-viz');
  await expect(gallery.locator('figure')).toHaveCount(11);
  // The measured relayout after hydration keeps every figure drawn.
  await expect(gallery.locator('svg.salmon-chart-svg').first()).toBeVisible();
  const overlay = await page.evaluate(() => document.querySelector('nextjs-portal')?.shadowRoot?.querySelectorAll('[data-next-badge][data-error="true"]').length ?? 0);
  expect(overlay).toBe(0);
  expect(problems).toEqual([]);
});
