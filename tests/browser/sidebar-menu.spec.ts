import { expect, test, type Page } from '@playwright/test';
import { collectProblems, DEV_URL } from './helpers.ts';

// SidebarMenu interaction (docs/site/content/navigation/sidebar-menu.md): router
// links through renderLink, aria-current, disclosure submenus, keyboard
// shortcuts, the collapsed rail with flyouts and tooltips, and hydration.
// Page: examples/vite-spa/src/sidebar-menu.tsx.

const URL = `${DEV_URL}sidebar-menu.html`;

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`${URL}${query ? `?${query}` : ''}`);
  await expect(page.locator('#grouped')).toBeVisible();
}

const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: unknown[] }).__events);
const item = (page: Page, menu: string, id: string) => page.locator(`#${menu} [data-sidebar-menu-item="${id}"]`).first();

test.describe('SidebarMenu', () => {
  test('router links: a click navigates client-side, selects the item and moves aria-current', async ({ page }) => {
    await open(page);
    const before = page.url();
    await expect(item(page, 'grouped', 'orders')).toHaveAttribute('aria-current', 'page');
    await item(page, 'grouped', 'analytics').click();
    expect(page.url()).toBe(before);
    await expect(page.locator('#location')).toHaveText('/workspace/analytics');
    await expect(item(page, 'grouped', 'analytics')).toHaveAttribute('aria-current', 'page');
    await expect(item(page, 'grouped', 'orders')).not.toHaveAttribute('aria-current', /.*/);
    await expect(page.locator('#grouped [aria-current]')).toHaveCount(1);
    expect(await events(page)).toEqual(expect.arrayContaining([['click', 'analytics'], ['navigate', '/workspace/analytics'], ['selected', 'analytics', 'pointer']]));
    // The rail menu follows the same location.
    await expect(item(page, 'rail', 'analytics')).toHaveAttribute('aria-current', 'page');
  });

  test('a modified click reports onItemClick but does not select', async ({ page }) => {
    await open(page);
    await page.evaluate(() => document.querySelector('#grouped [data-sidebar-menu-item="payments"]')!.addEventListener('click', (e) => e.preventDefault()));
    await item(page, 'grouped', 'payments').click({ modifiers: ['Shift'] });
    const log = await events(page);
    expect(log).toContainEqual(['click', 'payments']);
    expect(log.some((e) => (e as unknown[])[0] === 'selected')).toBe(false);
  });

  test('disclosure submenus: click and Enter toggle; aria-expanded follows; closed panels are hidden', async ({ page }) => {
    await open(page);
    const commerce = item(page, 'grouped', 'commerce');
    await expect(commerce).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator(`[id="${await commerce.getAttribute('aria-controls')}"]`);
    await expect(item(page, 'grouped', 'products')).toBeVisible();
    await commerce.click();
    await expect(commerce).toHaveAttribute('aria-expanded', 'false');
    await expect(panel).toHaveAttribute('hidden', 'until-found');
    await expect(item(page, 'grouped', 'products')).toBeHidden();
    await commerce.focus();
    await page.keyboard.press('Enter');
    await expect(commerce).toHaveAttribute('aria-expanded', 'true');
    expect(await events(page)).toEqual(expect.arrayContaining([['expanded', 'commerce', false, 'pointer'], ['expanded', 'commerce', true, 'keyboard']]));
  });

  test('keyboard: Tab reaches every link; arrows, Home and End move focus and skip disabled and hidden items', async ({ page }) => {
    await open(page);
    await item(page, 'grouped', 'overview').focus();
    await page.keyboard.press('Tab');
    await expect(item(page, 'grouped', 'analytics')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'grouped', 'orders')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'grouped', 'commerce')).toBeFocused();
    // Left collapses an open submenu; Down then skips its hidden links.
    await page.keyboard.press('ArrowLeft');
    await expect(item(page, 'grouped', 'commerce')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'grouped', 'customers')).toBeFocused();
    // Right moves into an open submenu, Left back to its button.
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'grouped', 'segments')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(item(page, 'grouped', 'customers')).toBeFocused();
    await page.keyboard.press('End');
    await expect(item(page, 'grouped', 'help')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(item(page, 'grouped', 'overview')).toBeFocused();
    // Right opens a closed submenu, a second Right enters it; the disabled link is not a stop.
    await item(page, 'grouped', 'commerce').focus();
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'grouped', 'commerce')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'grouped', 'products')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'grouped', 'promotions')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, 'grouped', 'customers')).toBeFocused();
  });

  test('RTL mirrors Right and Left', async ({ page }) => {
    await open(page, 'dir=rtl');
    await item(page, 'grouped', 'customers').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(item(page, 'grouped', 'segments')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'grouped', 'customers')).toBeFocused();
  });

  test('an action item (no href) is a button that selects on Enter', async ({ page }) => {
    await open(page);
    await item(page, 'plain', 'help').focus();
    await page.keyboard.press('Enter');
    await expect(item(page, 'plain', 'help')).toHaveAttribute('aria-current', 'true');
    expect(await events(page)).toContainEqual(['plain-selected', 'help']);
  });

  test('uncontrolled: defaultSelected opens its submenus; a new selection reveals itself', async ({ page }) => {
    await open(page);
    await expect(item(page, 'plain', 'customers')).toHaveAttribute('aria-expanded', 'true');
    await expect(item(page, 'plain', 'commerce')).toHaveAttribute('aria-expanded', 'false');
    await expect(item(page, 'plain', 'segments')).toHaveAttribute('aria-current', 'page');
  });

  test('rail: icons only, a hover tooltip shows the label, focus shows it too', async ({ page }) => {
    await open(page);
    const overview = item(page, 'rail', 'overview');
    const box = await overview.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(48);
    await expect(overview).toHaveAccessibleName('Overview');
    await overview.hover();
    const tip = page.locator('#rail .salmon-sidebar-menu-tooltip');
    await expect(tip).toHaveText('Overview');
    await expect(tip).toHaveAttribute('data-placed', '');
    const tipBox = (await tip.boundingBox())!;
    expect(tipBox.x).toBeGreaterThan(box!.x + box!.width);
    await page.mouse.move(600, 700);
    await expect(tip).toHaveCount(0);
    await item(page, 'grouped', 'help').focus();
    await page.keyboard.press('Tab');
    await expect(item(page, 'rail', 'overview')).toBeFocused();
    await expect(tip).toHaveText('Overview');
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
  });

  test('rail: a submenu opens as a flyout on hover and closes on leave', async ({ page }) => {
    await open(page);
    const commerce = item(page, 'rail', 'commerce');
    await commerce.hover();
    const flyout = page.locator('#rail .salmon-sidebar-menu-flyout');
    await expect(flyout).toBeVisible();
    await expect(commerce).toHaveAttribute('aria-expanded', 'true');
    await expect(commerce).toHaveAttribute('aria-controls', (await flyout.getAttribute('id'))!);
    await expect(flyout.locator('.salmon-sidebar-menu-flyout-title')).toHaveText('Commerce');
    // Moving into the flyout keeps it open.
    await flyout.locator('[data-sidebar-menu-item="promotions"]').hover();
    await page.waitForTimeout(300);
    await expect(flyout).toBeVisible();
    await page.mouse.move(600, 700);
    await expect(flyout).toHaveCount(0);
  });

  test('rail: keyboard opens the flyout into its first link; Tab runs through it; Escape returns to the button', async ({ page }) => {
    await open(page);
    const commerce = item(page, 'rail', 'commerce');
    await commerce.focus();
    await page.keyboard.press('Enter');
    const flyout = page.locator('#rail .salmon-sidebar-menu-flyout');
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('[data-sidebar-menu-item="products"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(flyout.locator('[data-sidebar-menu-item="promotions"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(flyout).toHaveCount(0);
    await expect(commerce).toBeFocused();
    // Right opens too; Left closes back to the button.
    await page.keyboard.press('ArrowRight');
    await expect(flyout.locator('[data-sidebar-menu-item="products"]')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(flyout).toHaveCount(0);
    await expect(commerce).toBeFocused();
    // Tab from the last flyout link continues to the next rail item and closes the flyout.
    await page.keyboard.press('Space');
    await expect(flyout.locator('[data-sidebar-menu-item="products"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(flyout.locator('[data-sidebar-menu-item="promotions"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(item(page, 'rail', 'customers')).toBeFocused();
    await expect(flyout).toHaveCount(0);
  });

  test('rail: a click pins the flyout; selecting a link closes it; the trigger shows the active branch', async ({ page }) => {
    await open(page);
    const customers = item(page, 'rail', 'customers');
    await customers.click();
    const flyout = page.locator('#rail .salmon-sidebar-menu-flyout');
    await expect(flyout).toBeVisible();
    // Nested submenus inside the flyout are inline disclosures.
    const support = flyout.locator('[data-sidebar-menu-item="support"]');
    await support.click();
    await expect(support).toHaveAttribute('aria-expanded', 'true');
    await flyout.locator('[data-sidebar-menu-item="cases"]').click();
    await expect(flyout).toHaveCount(0);
    await expect(page.locator('#location')).toHaveText('/operations/customers/support/cases');
    await expect(customers).toHaveAttribute('data-active', '');
    // An outside press closes a pinned flyout.
    await customers.click();
    await expect(flyout).toBeVisible();
    await page.mouse.click(700, 700);
    await expect(flyout).toHaveCount(0);
  });

  test('rail flyout opens to the inline end in RTL', async ({ page }) => {
    await open(page, 'dir=rtl');
    const commerce = item(page, 'rail', 'commerce');
    await commerce.click();
    const flyout = page.locator('#rail .salmon-sidebar-menu-flyout');
    await expect(flyout).toHaveAttribute('data-placed', '');
    const a = (await commerce.boundingBox())!;
    const f = (await flyout.boundingBox())!;
    expect(f.x + f.width).toBeLessThan(a.x);
  });

  test('expanding the rail back shows labels and inline submenus', async ({ page }) => {
    await open(page);
    await page.click('#rail-trigger');
    await expect(page.locator('#rail')).not.toHaveAttribute('data-collapsed', /.*/);
    await expect(page.locator('#rail .salmon-sidebar-menu-label').first()).toBeVisible();
    await expect(item(page, 'rail', 'commerce')).toHaveAttribute('aria-controls', /.+/);
  });

  test('server markup hydrates with zero warnings and stays interactive', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto(`${URL}?mode=hydrate`);
    await page.waitForFunction(() => (window as unknown as { __hydrated?: boolean }).__hydrated === true);
    await item(page, 'rail', 'commerce').click();
    await expect(page.locator('#rail .salmon-sidebar-menu-flyout')).toBeVisible();
    await item(page, 'grouped', 'commerce').click();
    await expect(item(page, 'grouped', 'commerce')).toHaveAttribute('aria-expanded', 'false');
    expect(problems).toEqual([]);
  });

  test('reduced motion turns the submenu transition off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const t = await page.locator('#grouped .salmon-sidebar-menu-submenu').first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(t.split(',').every((d) => d.trim() === '0s')).toBe(true);
  });
});
