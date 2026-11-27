import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Filter builder demo: the advanced filter builder dialog opened
// from the toolbar item and `api.openFilterBuilder()`, editing nested AND/OR
// groups, validation, `includeHidden`, the cancellable
// `onBeforeFilterBuilderOpen`, `ui: 'builder'` on the filter events, the
// modal focus handling (trap, Escape, focus return) and axe-core on the
// open dialog. The dialog code is a lazy chunk: every assertion waits for it.

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

async function open(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto('/demos/data-grid/filter-builder');
  await page.waitForFunction(() => window.__hydrated === true && document.querySelector('[data-salmon-pending]') === null);
  return problems;
}

const grid = (page: Page) => page.locator('.salmon-data-grid').first();
const cells = (page: Page, id: string) => grid(page).locator(`.salmon-data-grid-rows [data-row-id] .salmon-data-grid-cell[data-column-id="${id}"]`);
const texts = async (page: Page, id: string) => (await cells(page, id).allInnerTexts()).map((t) => t.trim());
const toolbarButton = (page: Page) => page.locator('[data-toolbar-item="filterBuilder"]');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Filter builder' });
const rules = (scope: Locator) => scope.locator('.salmon-data-grid-filter-builder__rule');
const log = (page: Page) => page.locator('[role="log"]');

async function openFromToolbar(page: Page): Promise<Locator> {
  await toolbarButton(page).click();
  const d = dialog(page);
  await expect(d).toBeVisible();
  return d;
}

/** Fills one condition row: field, operator, value. */
async function setRule(rule: Locator, field: string, operator: string, value?: string): Promise<void> {
  await rule.getByLabel('Field').selectOption({ label: field });
  await rule.getByLabel('Operator').selectOption({ label: operator });
  if (value !== undefined) await rule.getByLabel('Value').fill(value);
}

async function expectAxeClean(page: Page): Promise<void> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => {
    const axeApi = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<any> } }).axe;
    const r = await axeApi.run({ include: [['[data-salmon-popover]']] }, { resultTypes: ['violations', 'incomplete'], rules: { region: { enabled: false } } });
    return {
      violations: r.violations.map((v: any) => `${v.id}: ${v.nodes.slice(0, 2).map((n: any) => n.target.join(' ')).join(', ')}`),
      incomplete: r.incomplete.map((v: any) => v.id as string),
    };
  });
  expect(result.violations).toEqual([]);
  expect(result.incomplete.filter((id: string) => id !== 'color-contrast')).toEqual([]);
}

test.describe('filter builder demo', () => {
  test('opens with the applied nested groups; modal focus, Escape and focus return; axe-core is clean', async ({ page }) => {
    const problems = await open(page);
    // Initial rule: (Country = Japan OR Country = Malaysia) AND Amount > 100.
    for (const country of await texts(page, 'country')) expect(['Japan', 'Malaysia']).toContain(country);
    const d = await openFromToolbar(page);
    await expect(d).toHaveAttribute('aria-modal', 'true');
    const root = d.getByRole('group', { name: 'Filter builder', exact: true });
    const nested = root.getByRole('group', { name: 'Condition group' });
    await expect(nested).toHaveCount(1);
    await expect(nested.getByRole('radio', { name: 'Or' })).toBeChecked();
    await expect(root.getByRole('radio', { name: 'And' }).first()).toBeChecked();
    await expect(rules(nested)).toHaveCount(2);
    await expect(rules(nested).nth(1).getByLabel('Value')).toHaveValue('Malaysia');
    await expect(rules(d)).toHaveCount(3);
    // Focus starts inside the dialog and Tab stays there.
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.salmon-data-grid-filter-builder')))).toBe(true);
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.salmon-data-grid-filter-builder')))).toBe(true);
    await expectAxeClean(page);
    // Escape closes without applying; focus returns to the toolbar button.
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    await expect(toolbarButton(page)).toBeFocused();
    expect(problems).toEqual([]);
  });

  test('clear, add a condition and a nested OR group, apply: one filter change with ui builder', async ({ page }) => {
    const problems = await open(page);
    await page.getByRole('button', { name: 'Open through the API' }).click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    await d.getByRole('button', { name: 'Clear' }).click();
    await expect(rules(d)).toHaveCount(0);
    const root = d.getByRole('group', { name: 'Filter builder', exact: true });
    await root.getByRole('button', { name: 'Add condition' }).click();
    // The new condition's field gets focus.
    await expect(rules(d).first().getByLabel('Field')).toBeFocused();
    await setRule(rules(d).first(), 'Category', 'Equal', 'Tea');
    await root.getByRole('button', { name: 'Add group' }).click();
    const group = root.getByRole('group', { name: 'Condition group' });
    await group.getByRole('radio', { name: 'Or' }).check();
    await setRule(rules(group).first(), 'Qty', 'Greater than', '10');
    await group.getByRole('button', { name: 'Add condition' }).click();
    await setRule(rules(group).nth(1), 'Qty', 'Less than', '2');
    await d.getByRole('button', { name: 'OK' }).click();
    await expect(d).toHaveCount(0);
    await expect(log(page)).toContainText('filter change (builder, pointer): category equal "Tea" AND (quantity greaterThan 10 OR quantity lessThan 2)');
    const categories = await texts(page, 'category');
    expect(categories.length).toBeGreaterThan(0);
    for (const c of categories) expect(c).toBe('Tea');
    for (const q of await texts(page, 'quantity')) expect(Number(q) > 10 || Number(q) < 2).toBe(true);
    // Reopening shows the applied tree; removing the group and applying drops it.
    const again = await openFromToolbar(page);
    const reopened = again.getByRole('group', { name: 'Condition group' });
    await expect(rules(reopened)).toHaveCount(2);
    await reopened.getByRole('button', { name: 'Remove group' }).click();
    await expect(again.getByRole('group', { name: 'Condition group' })).toHaveCount(0);
    await again.getByRole('button', { name: 'OK' }).press('Enter');
    await expect(again).toHaveCount(0);
    await expect(log(page)).toContainText('filter change (builder, keyboard): category equal "Tea"');
    expect(problems).toEqual([]);
  });

  test('an incomplete condition is marked invalid and nothing applies; Cancel discards the draft', async ({ page }) => {
    const problems = await open(page);
    const d = await openFromToolbar(page);
    const root = d.getByRole('group', { name: 'Filter builder', exact: true });
    // The root group's own button comes first.
    await root.getByRole('button', { name: 'Add condition' }).first().click();
    const added = rules(root).last();
    await setRule(added, 'Customer', 'Contains');
    await d.getByRole('button', { name: 'OK' }).click();
    await expect(d).toBeVisible();
    await expect(added.getByLabel('Value')).toHaveAttribute('aria-invalid', 'true');
    await expect(added.getByLabel('Value')).toBeFocused();
    await added.getByRole('button', { name: 'Remove condition' }).click();
    await expect(rules(d)).toHaveCount(3);
    await d.getByRole('button', { name: 'Cancel' }).click();
    await expect(d).toHaveCount(0);
    await expect(log(page)).not.toContainText('filter change');
    expect(problems).toEqual([]);
  });

  test('includeHidden offers hidden columns; onBeforeFilterBuilderOpen cancels the opening', async ({ page }) => {
    const problems = await open(page);
    let d = await openFromToolbar(page);
    await expect(rules(d).first().getByLabel('Field').locator('option', { hasText: 'Priority' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByLabel('Offer hidden columns').check();
    d = await openFromToolbar(page);
    await expect(rules(d).first().getByLabel('Field').locator('option', { hasText: 'Priority' })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.getByLabel('Cancel opening').check();
    await toolbarButton(page).click();
    await expect(log(page)).toContainText('builder open (pointer): (country equal "Japan" OR country equal "Malaysia") AND amount greaterThan 100 - cancelled');
    await expect(dialog(page)).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
