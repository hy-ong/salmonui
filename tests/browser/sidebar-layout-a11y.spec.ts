import { expect, test, type Page } from '@playwright/test';
import { axe } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// SidebarLayout accessibility: landmarks with accessible names, trigger ARIA, an ARIA snapshot,
// and axe in light, dark and RTL, open and closed. The file name matches the
// `test:a11y` filter (`a11y.spec`).

const URL = `${DEV_URL}sidebar-layout.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(page.locator('#push')).toBeVisible();
}

test.describe('SidebarLayout accessibility', () => {
  test('landmarks: <nav> and <aside> panels are named; triggers expose aria-expanded and aria-controls', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Rail panel' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Details' })).toBeAttached();
    const trigger = page.locator('#push-trigger');
    await expect(trigger).toHaveAccessibleName('Toggle sidebar');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const controls = (await trigger.getAttribute('aria-controls'))!;
    expect(await page.locator('#push .salmon-sidebar-panel').getAttribute('id')).toBe(controls);
    await expect(page.locator('#end-trigger')).toHaveAccessibleName('Details');
    await expect(page.locator('#rail-trigger')).toHaveAccessibleName('Collapse sidebar');
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // A closed panel leaves the accessibility tree.
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  });

  test('ARIA snapshot of a push layout', async ({ page }) => {
    await open(page);
    await expect(page.locator('#push')).toMatchAriaSnapshot(`
      - navigation "Main navigation":
        - list:
          - listitem:
            - link "Home"
          - listitem:
            - link "Orders"
      - region "Push content":
        - button "Toggle sidebar" [expanded]
        - button "Outside"
    `);
  });

  test('keyboard: the trigger toggles with Enter and Space; focus stays visible on it', async ({ page }) => {
    await open(page);
    await page.focus('#push-trigger');
    await page.keyboard.press('Space');
    await expect(page.locator('#push-trigger')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(page.locator('#push-trigger')).toHaveAttribute('aria-expanded', 'true');
    const outline = await page.locator('#push-trigger').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl']) {
    test(`axe: no violations, open and closed (${variant || 'light'})`, async ({ page }) => {
      await open(page, variant);
      expect((await axe(page)).violations).toEqual([]);
      for (const id of ['push-trigger', 'rail-trigger', 'end-trigger', 'overlay-trigger']) await page.click(`#${id}`);
      await expect(page.locator('#overlay .salmon-sidebar-panel')).toBeVisible();
      expect((await axe(page)).violations).toEqual([]);
    });
  }
});
