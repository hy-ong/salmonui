import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// Kanban accessibility (roles): the board grid of cell rows and card gridcells, an ARIA
// snapshot of a small board, and axe in light, dark and RTL with a
// selection, a lifted card, swimlanes and the open editor. The file name
// matches the `test:a11y` filter (`a11y.spec`).

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const URL = `${DEV_URL}kanban.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(page.locator('.salmon-kanban-card').first()).toBeVisible();
}

async function axe(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const run = (window as unknown as { axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await run.run({ include: [['.salmon-kanban']] }, { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

test.describe('Kanban accessibility', () => {
  test('ARIA: a grid of cell rows with rowheaders and card gridcells, one tab stop, named controls', async ({ page }) => {
    await open(page);
    const grid = page.getByRole('grid', { name: 'Sprint' });
    await expect(grid).toHaveAttribute('aria-roledescription', 'board');
    await expect(grid).toHaveAttribute('aria-multiselectable', 'true');
    await expect(grid.getByRole('row')).toHaveCount(5);
    await expect(grid.getByRole('row', { name: /^To do, 2 cards/ }).getByRole('rowheader')).toHaveText('To do, 2 cards');
    const card = grid.getByRole('gridcell', { name: /^Set up CI/ });
    await expect(card).toHaveAttribute('aria-roledescription', 'card');
    await expect(card).toHaveAttribute('aria-selected', 'false');
    await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Collapse To do' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Move column Review' })).toHaveCount(1);
    await expect(page.locator('#main .salmon-kanban-count').first()).toHaveAttribute('aria-label', '2 cards');
    // Both live regions exist before anything is announced.
    await expect(page.locator('#main > [role="status"]')).toHaveCount(2);
  });

  test('ARIA snapshot of a small board', async ({ page }) => {
    await open(page, 'fixture=group');
    await page.locator('#left [data-card="sl1"]').click();
    await expect(page.locator('#left [role="grid"]')).toMatchAriaSnapshot(`
      - grid "Left board":
        - row "To do, 2 cards Left one Left two":
          - rowheader "To do, 2 cards"
          - gridcell "Left one" [selected]
          - gridcell "Left two"
        - row "Done, 1 cards Left three":
          - rowheader "Done, 1 cards"
          - gridcell "Left three"
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations (${variant || 'light'}) with a selection, a lifted card, a limit and the open editor`, async ({ page }) => {
      const problems = collectProblems(page);
      await open(page, variant);
      await page.locator('#main [data-card="st1"]').click();
      await page.locator('#main [data-card="sb1"]').click({ modifiers: ['ControlOrMeta'] });
      expect(await axe(page)).toEqual([]);
      // A lifted card (keyboard drag) with its drop indicator.
      await page.locator('#main [data-card="sd1"]').focus();
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('#main [data-lifted]')).toHaveCount(1);
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      // Collapsed column and the editor dialog.
      await page.getByRole('button', { name: 'Collapse Done' }).click();
      await page.locator('#main [data-card="sd2"]').dblclick();
      const dialog = page.getByRole('dialog', { name: 'Edit card' });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Title').fill('');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog.getByLabel('Title')).toHaveAccessibleDescription('Title is required');
      expect(await axe(page)).toEqual([]);
      expect(problems).toEqual([]);
    });

    test(`axe: no violations (${variant || 'light'}) on swimlanes, the narrow layout and the loading state`, async ({ page }) => {
      await open(page, `fixture=lanes${variant ? `&${variant}` : ''}`);
      expect(await axe(page)).toEqual([]);
      await open(page, `fixture=narrow${variant ? `&${variant}` : ''}`);
      expect(await axe(page)).toEqual([]);
      await page.goto(`${URL}?fixture=source${variant ? `&${variant}` : ''}`);
      await expect(page.locator('#source')).toHaveAttribute('aria-busy', 'true');
      expect(await axe(page)).toEqual([]);
    });
  }

  test('the tooltip is announced as the card description', async ({ page }) => {
    await open(page, 'tooltip=1');
    await page.locator('#main [data-card="sd1"]').focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.locator('#main [data-card="sd1"]')).toHaveAccessibleDescription(/Press Space to pick up\..*Build board — Columns and cards/);
    expect(await axe(page)).toEqual([]);
  });
});
