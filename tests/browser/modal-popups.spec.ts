import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectClean } from './axe.ts';
import { collectProblems, DEV_URL } from './helpers.ts';

// Popups inside modal dialogs: a modal Dialog or Drawer makes everything outside it
// inert, so popups anchored inside it portal into the dialog, stack above it
// in the top layer and stay interactive. Escape closes the popup first, then
// the dialog; focus returns to the popup trigger, then the dialog trigger.
// Page: examples/vite-spa/modal-popups.html.

const PAGE = `${DEV_URL}modal-popups.html`;

for (const host of ['dialog', 'drawer'] as const) {
  const id = (name: string) => `#${host}-${name}`;
  const surface = (page: Page) => page.locator(`dialog[data-test=${host}]`);
  const log = (page: Page, which: string) => page.evaluate((i) => (window.__modal ?? []).filter((e) => e['id'] === i), `${host}-${which}`);
  const activeId = (page: Page) => page.evaluate(() => document.activeElement?.id ?? null);

  async function open(page: Page): Promise<string[]> {
    const problems = collectProblems(page);
    await page.goto(`${PAGE}?host=${host}`);
    await page.waitForSelector('#page');
    await page.locator('#open').click();
    await expect(surface(page)).toBeVisible();
    expect(await surface(page).evaluate((el) => el.matches(':modal'))).toBe(true);
    return problems;
  }

  /** The popup is a descendant of the modal dialog, in the top layer, and the top element at its center. */
  async function expectInteractive(popup: Locator): Promise<void> {
    await expect(popup).toBeVisible();
    const state = await popup.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = el.ownerDocument.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12));
      let top: Element | null = el;
      while (top && !top.matches('[popover]')) top = top.parentElement;
      return { inDialog: !!el.closest('dialog')?.matches(':modal'), hit: !!hit && el.contains(hit), topLayer: !!top?.matches(':popover-open') };
    });
    expect(state).toEqual({ inDialog: true, hit: true, topLayer: true });
  }

  /** Escape closes the popup only; a second Escape closes the dialog and focus returns to its trigger. */
  async function escapeOrder(page: Page, popup: Locator, focusAfterFirst: string): Promise<void> {
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(surface(page)).toBeVisible();
    expect(await activeId(page)).toBe(focusAfterFirst);
    await page.keyboard.press('Escape');
    await expect(surface(page)).toHaveCount(0);
    expect(await activeId(page)).toBe('open');
  }

  test.describe(`inside a modal ${host}`, () => {
    test('Select: pointer and keyboard choice, Escape order, focus return', async ({ page }) => {
      const problems = await open(page);
      const trigger = page.locator(id('select'));
      await trigger.click();
      const list = page.locator('.salmon-dropdown-popup, [role="listbox"]').first();
      await expectInteractive(list);
      await list.getByRole('option', { name: 'Cherry' }).click();
      await expect(list).toHaveCount(0);
      expect((await log(page, 'select')).at(-1)?.['value']).toBe('cherry');
      await expect(surface(page)).toBeVisible();
      // Keyboard: open, move, choose.
      await trigger.focus();
      await page.keyboard.press('ArrowDown');
      await expectInteractive(page.getByRole('listbox'));
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('listbox')).toHaveCount(0);
      expect((await log(page, 'select')).at(-1)?.['value']).toBe('grape');
      // Escape order.
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('listbox')).toBeVisible();
      await escapeOrder(page, page.getByRole('listbox'), `${host}-select`);
      expect(problems).toEqual([]);
    });

    test('Combobox: pointer and keyboard choice, Escape order', async ({ page }) => {
      await open(page);
      const input = page.locator(id('combobox'));
      await input.click();
      await input.fill('ch');
      const list = page.getByRole('listbox');
      await expectInteractive(list);
      await list.getByRole('option', { name: 'Cherry' }).click();
      expect((await log(page, 'combobox')).at(-1)?.['value']).toBe('cherry');
      await expect(input).toBeFocused();
      await input.fill('');
      await input.pressSequentially('gr');
      await expect(list).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      expect((await log(page, 'combobox')).at(-1)?.['value']).toBe('grape');
      await input.fill('');
      await input.pressSequentially('a');
      await expect(list).toBeVisible();
      // Escape closes the list; the next clears the text (APG combobox); the next closes the dialog.
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);
      await expect(surface(page)).toBeVisible();
      await expect(input).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(input).toHaveValue('');
      await expect(surface(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(surface(page)).toHaveCount(0);
      expect(await activeId(page)).toBe('open');
    });

    test('DatePicker: pointer and keyboard choice, Escape order', async ({ page }) => {
      await open(page);
      const field = surface(page).locator('.salmon-date-picker');
      await field.locator('.salmon-picker__trigger').click();
      const popup = page.locator('.salmon-picker__popup');
      await expectInteractive(popup);
      const iso = await popup.locator('[data-day]:not([aria-disabled="true"])').nth(10).getAttribute('data-day');
      await popup.locator(`[data-day="${iso}"]`).click();
      await expect(popup).toHaveCount(0);
      await expect(page.locator(id('date-value'))).toHaveText(iso as string);
      // Keyboard: the trigger opens with focus on the calendar; arrows move, Enter chooses.
      await field.locator('.salmon-picker__trigger').focus();
      await page.keyboard.press('Enter');
      await expect(popup).toBeVisible();
      await page.keyboard.press('ArrowRight');
      const next = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['day'] ?? null);
      expect(next).not.toBeNull();
      await page.keyboard.press('Enter');
      await expect(popup).toHaveCount(0);
      await expect(page.locator(id('date-value'))).toHaveText(next as string);
      // Escape order: the popup closes and focus returns into the field; then the dialog closes.
      await field.locator('.salmon-picker__trigger').click();
      await expect(popup).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(surface(page)).toBeVisible();
      expect(await page.evaluate(() => !!document.activeElement?.closest('.salmon-date-picker'))).toBe(true);
      await page.keyboard.press('Escape');
      await expect(surface(page)).toHaveCount(0);
      expect(await activeId(page)).toBe('open');
    });

    test('MenuButton: pointer and keyboard actions, submenu, Escape order', async ({ page }) => {
      await open(page);
      const trigger = page.locator(id('menu'));
      await trigger.click();
      const menu = page.getByRole('menu');
      await expectInteractive(menu);
      await menu.getByRole('menuitem', { name: 'Copy' }).click();
      await expect(menu).toHaveCount(0);
      expect((await log(page, 'menu')).at(-1)?.['value']).toBe('copy');
      await expect(trigger).toBeFocused();
      // Keyboard into the submenu.
      await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowRight');
      const sub = page.getByRole('menu').nth(1);
      await expectInteractive(sub);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toHaveCount(0);
      expect((await log(page, 'menu')).at(-1)?.['value']).toBe('mail');
      await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      await escapeOrder(page, menu, `${host}-menu`);
    });

    test('Tooltip: shows above the dialog on hover and focus; Escape hides it first', async ({ page }) => {
      await open(page);
      const trigger = page.locator(id('tip-trigger'));
      await trigger.hover();
      const tip = page.getByRole('tooltip');
      await expect(tip).toHaveText('Saves the draft');
      const state = await tip.evaluate((el) => ({ inDialog: !!el.closest('dialog')?.matches(':modal'), topLayer: el.matches(':popover-open') || !!el.closest(':popover-open') }));
      expect(state).toEqual({ inDialog: true, topLayer: true });
      await page.mouse.move(1, 1);
      await expect(tip).toHaveCount(0);
      // Keyboard focus (focus-visible) shows it too.
      await page.locator(id('menu')).focus();
      await page.keyboard.press('Tab');
      await expect(trigger).toBeFocused();
      await expect(tip).toBeVisible();
      await expect(trigger).toHaveAccessibleDescription('Saves the draft');
      await escapeOrder(page, tip, `${host}-tip-trigger`);
    });

    test('Popover: content is interactive, outside press closes it only, Escape order', async ({ page }) => {
      await open(page);
      const trigger = page.locator(id('popover-trigger'));
      await trigger.click();
      const content = page.locator(`[data-test=${host}-popover]`);
      await expectInteractive(content);
      await content.locator(id('popover-button')).click();
      expect(await log(page, 'popover')).toHaveLength(1);
      // A press elsewhere in the dialog closes the popover, not the dialog.
      await surface(page).locator('.salmon-dialog-title').click();
      await expect(content).toHaveCount(0);
      await expect(surface(page)).toBeVisible();
      await trigger.click();
      await expect(content).toBeVisible();
      await escapeOrder(page, content, `${host}-popover-trigger`);
    });

    test('a backdrop press while a popup is open closes the popup only', async ({ page }) => {
      await open(page);
      await page.locator(id('menu')).click();
      await expect(page.getByRole('menu')).toBeVisible();
      const box = await surface(page).boundingBox();
      // A point on the backdrop, outside the dialog box.
      const x = host === 'drawer' ? 20 : 8;
      expect(box && (x < box.x || x > box.x + box.width)).toBeTruthy();
      await page.mouse.click(x, 400);
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(surface(page)).toBeVisible();
      if (host === 'drawer') {
        // Without an open popup, the dismissible drawer closes on the backdrop.
        await page.mouse.click(x, 400);
        await expect(surface(page)).toHaveCount(0);
      }
    });

    test('axe: clean with each popup open', async ({ page }) => {
      // axe reports aria-controls on an aria-haspopup trigger as needs-review (it cannot tell whether
      // the popup id must exist yet); the id is asserted to name an element in the dialog instead.
      const reviewed = ['aria-valid-attr-value'];
      const controlsInDialog = (trigger: string) =>
        page.evaluate((sel) => {
          const ids = (document.querySelector(sel)?.getAttribute('aria-controls') ?? '').split(' ').filter(Boolean);
          return ids.length > 0 && ids.every((i) => !!document.getElementById(i)?.closest('dialog'));
        }, trigger);
      await open(page);
      // The open transition (opacity) has finished.
      await page.waitForTimeout(250);
      await expectClean(page, `${host} open`);
      await page.locator(id('select')).click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await expectClean(page, `${host} select`, reviewed);
      expect(await controlsInDialog(id('select'))).toBe(true);
      await page.keyboard.press('Escape');
      await page.locator(id('menu')).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await expectClean(page, `${host} menu`, reviewed);
      expect(await controlsInDialog(id('menu'))).toBe(true);
      await page.keyboard.press('Escape');
      await page.locator(id('popover-trigger')).click();
      await expect(page.locator(`[data-test=${host}-popover]`)).toBeVisible();
      await expectClean(page, `${host} popover`, reviewed);
      await page.keyboard.press('Escape');
      await surface(page).locator('.salmon-picker__trigger').click();
      await expect(page.locator('.salmon-picker__popup')).toBeVisible();
      await expectClean(page, `${host} date picker`, reviewed);
      await page.keyboard.press('Escape');
      await page.locator(id('menu')).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('tooltip')).toBeVisible();
      await expectClean(page, `${host} tooltip`, reviewed);
      await expect(surface(page)).toBeVisible();
    });
  });
}
