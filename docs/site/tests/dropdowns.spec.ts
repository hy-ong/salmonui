import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { loadDemos, sitePaths } from '../lib/catalog.mjs';

// Dropdowns demos: every demo
// server-renders without a popup and hydrates with zero console errors, the
// accessibility demo is axe-clean closed and open, and a few
// demos prove their rows in the browser.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

const paths = sitePaths(new URL('..', import.meta.url).pathname.replace(/\/$/, ''));
const demos = loadDemos(paths.demos).filter((d) => d.category === 'dropdowns');

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') problems.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function openHydrated(page: Page, id: string): Promise<void> {
  const response = await page.goto(`/demos/dropdowns/${id}`);
  expect(response?.status(), `${id} status`).toBe(200);
  await page.waitForFunction(() => window.__hydrated === true);
  await page.waitForLoadState('networkidle');
}

async function axeViolations(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const include = ['main', '.salmon-dropdown-popup'].filter((s) => document.querySelector(s)).map((s) => [s]);
    const r = await axeApi.run({ include }, { resultTypes: ['violations'], rules: { region: { enabled: false }, 'color-contrast': { enabled: false } } });
    return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`);
  });
}

test('the dropdowns section has its demos', () => {
  expect(demos.length).toBe(31);
});

for (const demo of demos) {
  test(`dropdowns demo ${demo.id} server-renders without a popup and hydrates cleanly`, async ({ page, request }) => {
    const html = await (await request.get(`/demos/dropdowns/${demo.id}`)).text();
    // popups mount after a user action only.
    expect(html).not.toContain('salmon-dropdown-popup');
    const problems = collectProblems(page);
    await openHydrated(page, demo.id);
    await page.waitForTimeout(250);
    expect(problems).toEqual([]);
  });
}

test('dropdown accessibility demo is axe-clean closed and open', async ({ page }) => {
  await openHydrated(page, 'dropdown-accessibility');
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('combobox', { name: 'Favourite color' }).click();
  await expect(page.getByRole('combobox', { name: 'Favourite color' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.salmon-dropdown-popup [role="option"]').first()).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Palette' }).click();
  await expect(page.locator('.salmon-dropdown-popup [role="option"]').first()).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('select events: a vetoed change keeps the value and the ref focuses the trigger', async ({ page }) => {
  await openHydrated(page, 'select-events');
  const plan = page.getByRole('combobox', { name: 'Plan' });
  await plan.click();
  await page.getByRole('option', { name: 'Team' }).click();
  await expect(page.getByText('Value: team')).toBeVisible();
  await plan.click();
  await page.getByRole('option', { name: 'Enterprise (contact sales)' }).click();
  await expect(page.getByText('Value: team')).toBeVisible();
  await expect(page.getByRole('log')).toContainText('vetoed');
  await page.getByRole('button', { name: 'Focus the Select' }).click();
  await expect(plan).toBeFocused();
});

test('popup demo: type-ahead on a closed Select reaches deep into a virtual list', async ({ page }) => {
  await openHydrated(page, 'dropdown-popup');
  const code = page.getByRole('combobox', { name: /^Code/ });
  await code.focus();
  await page.keyboard.type('wi');
  await expect(code).toContainText('Willow 001');
});

test('popup demo: a remote value is labelled after mount without opening', async ({ page }) => {
  await openHydrated(page, 'dropdown-popup');
  await expect(page.getByRole('combobox', { name: /selectedItems/ })).toContainText('Japan');
  await expect(page.getByRole('combobox', { name: /label read after mount/ })).toContainText('Iceland');
});

test('listbox remote: ranges are read and a failed read offers a retry', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, 'listbox-remote');
  const log = page.getByRole('log', { name: 'Requests' });
  await expect(log).toContainText('rows 0–');
  const list = page.getByRole('listbox', { name: /Customer/ });
  await expect(list.getByRole('option').first()).toBeVisible();
  await page.getByRole('checkbox', { name: 'Fail the next read' }).check();
  await page.getByRole('searchbox').fill('ana');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible({ timeout: 5000 });
  await expect(log).toContainText('onLoadError');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(list.getByRole('option').first()).toBeVisible({ timeout: 5000 });
  // An inline onLoadError fires once per failure, not on every re-render.
  await expect(log.locator('li').filter({ hasText: 'onLoadError' })).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('combobox tags: creating, rejecting and a vetoed removal', async ({ page }) => {
  await openHydrated(page, 'combobox-tags');
  const input = page.getByRole('combobox', { name: 'Labels' });
  await input.fill('triage');
  await input.press('Enter');
  await expect(page.getByText('Value: [bug, security, triage]')).toBeVisible();
  await page.getByRole('button', { name: 'Remove security' }).click();
  await expect(page.getByText('Value: [bug, security, triage]')).toBeVisible();
  await expect(page.getByRole('log')).toContainText('vetoed');
});

test('autocomplete remote: inline searchFields do not re-read when the log re-renders the page', async ({ page }) => {
  await openHydrated(page, 'autocomplete-remote');
  const input = page.getByRole('combobox', { name: 'Destination' });
  await input.fill('s');
  await expect(page.locator('.salmon-dropdown-popup [role="option"]').filter({ hasText: 'São Paulo' })).toBeVisible({ timeout: 5000 });
  // The open read is superseded by the search read (aborted); after that, re-renders from the log must not read again.
  const log = page.getByRole('log', { name: 'Requests' });
  await page.waitForTimeout(1000);
  const settled = await log.innerText();
  await page.waitForTimeout(1500);
  expect(await log.innerText()).toBe(settled);
  expect(await log.locator('li').filter({ hasText: 'read: search "s"' }).count()).toBe(1);
});

test('mention: a highlighted match sits flush with the rest of the label', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, 'mention');
  await page.getByRole('textbox', { name: 'Comment' }).click();
  await page.keyboard.type('Hi @ok');
  const option = page.locator('.salmon-mention-option').filter({ hasText: 'Ben Okafor' });
  await expect(option).toBeVisible();
  // One text box per option: the text before the mark ends where the mark starts (no flex gap).
  const gap = await option.locator('.salmon-mention-mark').evaluate((mark) => {
    const range = document.createRange();
    range.selectNodeContents(mark.previousSibling as Node);
    return mark.getBoundingClientRect().left - range.getBoundingClientRect().right;
  });
  expect(Math.abs(gap)).toBeLessThan(1);
  expect(problems).toEqual([]);
});

test('select-events: the Loading checkbox shows the spinner on the trigger and the loading row over the items', async ({ page }) => {
  const problems = collectProblems(page);
  await openHydrated(page, 'select-events');
  const stage = page.locator('.demo__stage');
  const trigger = stage.locator('.salmon-select-trigger').first();
  await expect(trigger).not.toHaveAttribute('aria-busy', /.*/);
  await stage.getByRole('checkbox', { name: 'Loading' }).check();
  await expect(trigger).toHaveAttribute('aria-busy', 'true');
  await expect(trigger.locator('.salmon-dropdown-spinner')).toBeVisible();
  await stage.getByRole('button', { name: 'Open the list' }).click();
  await expect(page.locator('.salmon-dropdown-popup [role="status"]')).toHaveText('Loading…');
  await expect(page.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
  await page.keyboard.press('Escape');
  await stage.getByRole('checkbox', { name: 'Loading' }).uncheck();
  await expect(trigger).not.toHaveAttribute('aria-busy', /.*/);
  expect(problems).toEqual([]);
});
