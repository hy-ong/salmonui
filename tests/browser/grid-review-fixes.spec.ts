import { expect, test } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// Regressions from the Data Grid demo review (2026-11-26) that need the
// harness rather than a docs demo. Fixture flags: examples/vite-spa/src/harness.ts
// (`?chrome`, `?tbrender`).

test('toolbar render items without a label: the overflow menu names them by title, rendered text or aria-label, and development warns once per item', async ({ page }) => {
  const problems = collectProblems(page);
  await openGrid(page, `${DEV_URL}?rows=200&cols=10&chrome&tbrender`);
  await page.setViewportSize({ width: 520, height: 800 });
  const more = page.locator('.salmon-data-grid-toolbar__more');
  await expect(more).toBeVisible();
  await more.click();
  const menu = page.locator('[data-salmon-popover]');
  const text = (id: string) => menu.locator(`[data-item-id="${id}"] .salmon-data-grid-menu__text`);
  await expect(text('withTitle')).toHaveText('Refresh data');
  await expect(text('withText')).toHaveText('Live status');
  await expect(text('iconOnly')).toHaveText('Sync now');
  // The item with a label keeps it.
  await expect(text('custom')).toHaveText('Custom');
  // Exactly one development warning per unlabeled render item without a title.
  const warnings = problems.filter((p) => p.includes('has a render function but no label'));
  expect(warnings.map((w) => /toolbar item "(\w+)"/.exec(w)?.[1]).sort()).toEqual(['iconOnly', 'withText']);
  expect(problems.filter((p) => !p.includes('has a render function but no label'))).toEqual([]);
});
