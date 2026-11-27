import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL, openGrid } from './helpers.ts';

// Touch multi-sort popup: with `sorting.multiple`, a header tap
// sorts and shows the "Multi-sort" toggle by the header; while it is
// pressed, taps add columns to the sort (like Ctrl+click). A press outside
// the headers and the popup hides it and turns the toggle off. Mouse clicks
// never show it.

const SMALL = `${DEV_URL}?rows=200&cols=10`;
const header = (page: Page, id: string) => page.locator(`.salmon-data-grid-header-cell[data-column-id="${id}"]`);
const popup = (page: Page) => page.locator('.salmon-data-grid-touch-sort');
const toggle = (page: Page) => page.getByRole('button', { name: 'Multi-sort' });

test.describe('touch multi-sort popup', () => {
  test.use({ hasTouch: true });

  test('header tap shows the Multi-sort toggle; pressed, taps add columns; tapping elsewhere hides it', async ({ page }) => {
    const problems = collectProblems(page);
    await openGrid(page, `${SMALL}&qsort=multi`);
    await header(page, 's1').tap();
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'ascending');
    await expect(popup(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    // The popup sits by the tapped header.
    const cell = (await header(page, 's1').boundingBox())!;
    const box = (await popup(page).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(cell.y + cell.height - 1);
    expect(Math.abs(box.x - cell.x)).toBeLessThan(2);

    // Toggle off: a tap replaces the sort.
    await header(page, 'n4').tap();
    await expect(header(page, 'n4')).toHaveAttribute('aria-sort', 'ascending');
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'none');

    // Toggle on: taps add to the sort with order numbers.
    await toggle(page).tap();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    await header(page, 's1').tap();
    await expect(header(page, 'n4')).toHaveAttribute('aria-sort', 'ascending');
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'ascending');
    await expect(header(page, 'n4').locator('.salmon-data-grid-sort-indicator__order')).toHaveText('1');
    await expect(header(page, 's1').locator('.salmon-data-grid-sort-indicator__order')).toHaveText('2');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    // Tapping a sorted column again cycles it in place.
    await header(page, 'n4').tap();
    await expect(header(page, 'n4')).toHaveAttribute('aria-sort', 'descending');
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'ascending');

    // A tap in the body hides the popup and turns the toggle off.
    await page.locator('.salmon-data-grid-rows .salmon-data-grid-cell').nth(3).tap();
    await expect(popup(page)).toHaveCount(0);
    await header(page, 's2').tap();
    await expect(header(page, 's2')).toHaveAttribute('aria-sort', 'ascending');
    await expect(header(page, 'n4')).toHaveAttribute('aria-sort', 'none');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    // Escape hides it too.
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('mouse clicks and single sorting never show the popup', async ({ page }) => {
    await openGrid(page, `${SMALL}&qsort=multi`);
    await header(page, 's1').click();
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'ascending');
    await header(page, 'n4').click({ modifiers: ['ControlOrMeta'] });
    await expect(header(page, 'n4')).toHaveAttribute('aria-sort', 'ascending');
    await expect(popup(page)).toHaveCount(0);
    await openGrid(page, `${SMALL}&qsort`);
    await header(page, 's1').tap();
    await expect(header(page, 's1')).toHaveAttribute('aria-sort', 'ascending');
    await page.waitForTimeout(100);
    await expect(popup(page)).toHaveCount(0);
  });
});
