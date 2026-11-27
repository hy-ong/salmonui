import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { loadDemos, loadDocs, sitePaths } from '../lib/catalog.mjs';

// Component category routes with the
// Calendars section: /docs/calendars, /docs/calendars/<slug>,
// /demos/calendars and /demos/calendars/<id> server-render and hydrate with
// zero console errors; the sidebar shows the current section's pages.

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const docs = loadDocs(`${paths.content}/calendars`, 'calendars');
const demos = loadDemos(paths.demos).filter((d) => d.category === 'calendars');

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.hostname === 'localhost' && response.status() >= 400) problems.push(`HTTP ${response.status()}: ${url.pathname}`);
  });
  return problems;
}

async function openHydrated(page: Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} status`).toBe(200);
  await page.waitForFunction(() => window.__hydrated === true);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Documentation' });

test('the calendars section has docs pages and demos', () => {
  expect(docs.length).toBeGreaterThan(0);
  expect(demos.length).toBeGreaterThan(0);
  expect(demos.length).toBe(44);
});

for (const demo of demos) {
  test(`calendars demo ${demo.id} server-renders and hydrates cleanly`, async ({ page, request }) => {
    const html = await (await request.get(`/demos/calendars/${demo.id}`)).text();
    expect(html).toMatch(/role="grid"|role="spinbutton"|class="salmon-recurrence-editor|class="salmon-scheduler|class="salmon-gantt/);
    const problems = collectProblems(page);
    await openHydrated(page, `/demos/calendars/${demo.id}`);
    await expect(page.locator('h1')).toHaveText(demo.title);
    expect(problems).toEqual([]);
  });
}

for (const doc of docs) {
  test(`calendars docs page ${doc.slug} hydrates cleanly with its demos`, async ({ page }) => {
    const problems = collectProblems(page);
    await openHydrated(page, `/docs/calendars/${doc.slug}`);
    await expect(page.locator('h1')).toHaveText(doc.title);
    for (const id of doc.demos) await expect(page.locator(`[data-demo-id="${id}"]`)).toBeVisible();
    // The sidebar marks this page as current.
    await expect(sidebar(page).locator('[aria-current="page"]')).toHaveAttribute('href', `/docs/calendars/${doc.slug}`);
    expect(problems).toEqual([]);
  });
}

test('docs home, demos home and the calendars indexes list the section', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/docs');
  await expect(page.locator('main .home-cards a', { hasText: /^Calendars$/ })).toHaveAttribute('href', '/docs/calendars');
  await openHydrated(page, '/docs/calendars');
  await expect(page.locator('h1')).toHaveText('Salmon UI Calendars documentation');
  for (const doc of docs) await expect(page.locator(`main a[href="/docs/calendars/${doc.slug}"]`)).toBeVisible();
  await openHydrated(page, '/demos');
  await expect(page.locator('main .home-cards a', { hasText: /^All Calendars demos$/ })).toHaveAttribute('href', '/demos/calendars');
  await openHydrated(page, '/demos/calendars');
  for (const demo of demos) await expect(page.locator(`a[href="/demos/calendars/${demo.id}"]`).first()).toBeVisible();
  expect(problems).toEqual([]);
});

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const stage = (page: Page) => page.locator('.demo__stage').first();

test('calendar-pickers-platform: axe-core is clean with the pickers and an open popup', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/calendars/calendar-pickers-platform');
  const check = async (state: string) => {
    if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
    const violations = await page.evaluate(async () => {
      const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const include = ['.demo__stage', '.salmon-picker__popup'].filter((s) => document.querySelector(s)).map((s) => [s]);
      const r = await axeApi.run({ include }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
      return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`);
    });
    expect(violations, state).toEqual([]);
  };
  await check('closed');
  await stage(page).getByRole('group', { name: 'Ship date' }).getByRole('spinbutton').first().focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.locator('.salmon-picker__popup').first()).toBeVisible();
  await check('DatePicker popup open');
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
});

test('calendar-picker-formats: a wall time in a DST gap reports the resolved instant', async ({ page }) => {
  await openHydrated(page, '/demos/calendars/calendar-picker-formats');
  await stage(page).getByRole('group', { name: /Clocks change/ }).getByRole('spinbutton', { name: /hour/i }).click();
  await page.keyboard.type('02');
  await page.keyboard.press('Tab');
  await expect(stage(page).locator('.demo-log')).toContainText('details.iso: 2026-03-08T03:30-04:00');
});

test('scheduler demos: defaultValue seeds a new event, a custom dialog writes its own field', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, '/demos/calendars/scheduler-editing');
  await stage(page).getByRole('button', { name: 'openEditor (new)' }).click();
  await expect(page.getByRole('dialog').getByLabel('Room')).toHaveValue('Atrium');
  await page.keyboard.press('Escape');
  await openHydrated(page, '/demos/calendars/scheduler-templates');
  await stage(page).locator('.demo-event--focus').first().dblclick();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Kind' }).click();
  await page.getByRole('option', { name: 'Travel' }).click();
  await dialog.getByRole('button', { name: 'Save plan' }).click();
  await expect(stage(page).locator('.demo-event--travel')).toHaveCount(2);
  expect(problems).toEqual([]);
});

test('a calendars docs page has a Markdown version', async ({ request }) => {
  const doc = docs[0]!;
  const response = await request.get(`/docs/calendars/${doc.slug}.md`);
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(doc.title);
});
