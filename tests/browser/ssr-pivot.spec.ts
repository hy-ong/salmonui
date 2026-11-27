import { expect, test } from '@playwright/test';
import { collectProblems, SSR_URL } from './helpers.ts';

// Pivot Table in the Vite SSR example (`?pivot`, examples/vite-ssr/src/Pivot.tsx):
// local data is aggregated during the server render, so the HTML carries the row headers and the computed
// cells (not a loading state); the axis bar and the field list render their
// static markup; hydration in StrictMode development mode reports no warning
// or recoverable error, and the compact root becomes a `treegrid` after
// hydration.

// Fixture of Pivot.tsx: row i is region/country COUNTRIES[i % 5], year 2024 + i % 3, amount 10 + i % 90.
const COUNTRIES = [
  ['Asia', 'Japan'],
  ['Asia', 'India'],
  ['Europe', 'France'],
  ['Europe', 'Germany'],
  ['Americas', 'Canada'],
] as const;
function sum(where: (region: string, country: string, year: number) => boolean): number {
  let total = 0;
  for (let i = 0; i < 600; i++) {
    const [region, country] = COUNTRIES[i % 5]!;
    if (where(region, country, 2024 + (i % 3))) total += 10 + (i % 90);
  }
  return total;
}
const fmt = (n: number) => n.toLocaleString('en-US');

test('pivot table, axis bar and field list server render the computed report and hydrate without warnings', async ({ page }) => {
  const problems = collectProblems(page);
  const url = `${SSR_URL}?pivot`;
  const html = await (await page.request.get(url)).text();
  const start = html.indexOf('id="pivot-ssr"');
  expect(start).toBeGreaterThan(-1);
  const markup = html.slice(start);
  expect(markup).toContain('class="salmon-pivot-table"');
  expect(markup).toContain('data-status="ready"');
  expect(markup).not.toMatch(/class="salmon-pivot-table"[^>]*aria-busy="true"/);
  expect(markup).not.toContain('salmon-pivot-table-loading');
  // Row headers (Asia expanded to its countries) and aggregated cells.
  for (const label of ['Americas', 'Asia', 'Japan', 'India', 'Europe', 'Grand total']) expect(markup).toContain(`>${label}<`);
  expect(markup).toContain(`>${fmt(sum((r, _c, y) => r === 'Asia' && y === 2025))}<`);
  expect(markup).toContain(`>${fmt(sum((_r, c, y) => c === 'Japan' && y === 2024))}<`);
  expect(markup).toContain(`>${fmt(sum(() => true))}<`);
  // Axis bar and field list markup.
  expect(markup).toContain('class="salmon-pivot-table-axis-bar"');
  expect(markup).toContain('class="salmon-pivot-table-field-list"');
  expect(markup).toMatch(/data-pivot-field="product"/);

  await page.goto(url);
  await page.waitForFunction(() => window.__hydrated === true);
  await page.waitForTimeout(150);
  const root = page.locator('#pivot-ssr .salmon-pivot-table');
  await expect(root.getByRole('treegrid', { name: 'Sales by region' })).toHaveCount(1);
  await expect(root.locator(`[data-row-id='r["Asia"]']`)).toHaveAttribute('aria-expanded', 'true');
  // Interactive after hydration: drill and a field list change update the table.
  await root.getByRole('button', { name: 'Expand Europe' }).click();
  await expect(root.locator(`[data-row-id='r["Europe","France"]']`)).toHaveCount(1);
  await page.locator('#pivot-ssr .salmon-pivot-table-field-list [role="option"][data-pivot-field="product"]').first().click();
  await expect(page.locator('#pivot-ssr .salmon-pivot-table-axis-bar [data-axis="rows"] [data-pivot-field="product"]')).toHaveCount(1);
  expect(problems).toEqual([]);
});
