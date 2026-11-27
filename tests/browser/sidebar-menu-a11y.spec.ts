import { expect, test, type Page } from '@playwright/test';
import { axe } from './axe.ts';
import { DEV_URL } from './helpers.ts';

// SidebarMenu accessibility: a named navigation landmark of lists, links with
// aria-current, disclosure buttons (no ARIA menu roles), an ARIA snapshot, and
// axe in light, dark, RTL, the dark sidebar surface and the collapsed rail with
// an open flyout. The file name matches the `test:a11y` filter (`a11y.spec`).

const URL = `${DEV_URL}sidebar-menu.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(page.locator('#grouped')).toBeVisible();
}

test.describe('SidebarMenu accessibility', () => {
  test('landmark, link and disclosure semantics; no menu roles', async ({ page }) => {
    await open(page);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Orders 12' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: 'Commerce' })).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.getByRole('list', { name: 'Workspace' })).toBeVisible();
    await expect(page.locator('#grouped [role^="menu"]')).toHaveCount(0);
    // The rail keeps the labels as accessible names.
    const rail = page.getByRole('navigation', { name: 'Rail navigation' });
    await expect(rail.getByRole('link', { name: 'Overview' })).toBeVisible();
    await expect(rail.getByRole('button', { name: 'Commerce' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('ARIA snapshot of the grouped navigation', async ({ page }) => {
    await open(page);
    await expect(page.locator('#grouped')).toMatchAriaSnapshot(`
      - navigation "Main navigation":
        - list:
          - listitem:
            - text: Workspace
            - list "Workspace":
              - listitem:
                - link "Overview"
              - listitem:
                - link "Analytics"
              - listitem:
                - link "Orders 12"
          - listitem:
            - text: Operations
            - list "Operations":
              - listitem:
                - button "Commerce" [expanded]
                - list:
                  - listitem:
                    - link "Products"
                  - listitem:
                    - link "Promotions"
                  - listitem:
                    - link "Subscriptions" [disabled]
              - listitem:
                - button "Customers" [expanded]
                - list:
                  - listitem:
                    - link "Segments"
                  - listitem:
                    - button "Support" [expanded]
                    - list:
                      - listitem:
                        - link "Cases"
                      - listitem:
                        - link "Feedback"
              - listitem:
                - link "Payments"
          - listitem:
            - text: System
            - list "System":
              - listitem:
                - link "Settings"
              - listitem:
                - button "Help"
    `);
  });

  for (const variant of ['', 'scheme=dark', 'dir=rtl', 'surface=dark']) {
    test(`axe: no violations, rail flyout open (${variant || 'light'})`, async ({ page }) => {
      await open(page, variant);
      expect((await axe(page)).violations).toEqual([]);
      await page.locator('#rail [data-sidebar-menu-item="customers"]').click();
      await expect(page.locator('#rail .salmon-sidebar-menu-flyout')).toHaveAttribute('data-placed', '');
      expect((await axe(page)).violations).toEqual([]);
      await page.locator('#rail [data-sidebar-menu-item="customers"]').click();
      await page.locator('#rail [data-sidebar-menu-item="overview"]').hover();
      await expect(page.locator('#rail .salmon-sidebar-menu-tooltip')).toBeVisible();
      expect((await axe(page)).violations).toEqual([]);
    });
  }
});
